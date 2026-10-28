'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, UserX, UserCheck } from 'lucide-react';
import { ApiError, get, patch, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { ReasonDialog } from '@/components/reception/dialogs';
import { useRealtime } from '@/lib/realtime';
import { DEV_NOTIFIED, ServiceAccountBanner, SheetLinkField, sourcePayload, SyncPanel, type SheetSync } from './sheet-sync';

interface Member {
  id: string;
  displayName: string;
  memberCode: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  sheets: { id: string; title: string; campaign: string; active: boolean }[];
  openLeads: number;
}
interface Sheet extends SheetSync {
  id: string;
  externalId: string;
  title: string;
  campaign: string;
  active: boolean;
  createdAt: string;
  createdBy: string | null;
  leads: number;
  member: { id: string; displayName: string; memberCode: string | null; active: boolean; assignedAt: string; assignedBy: string | null } | null;
  history: { member: string | null; assignedAt: string; unassignedAt: string | null; by: string | null }[];
}

function MemberDialog({ m, nextCode, onClose }: { m?: Member; nextCode: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ displayName: m?.displayName ?? '', memberCode: m?.memberCode ?? nextCode, phone: m?.phone ?? '', email: m?.email ?? '', password: '' });
  const mut = useMutation({
    mutationFn: () =>
      m
        ? patch(`/lead-admin/members/${m.id}`, { displayName: f.displayName, phone: f.phone || null, email: f.email || null })
        : post('/lead-admin/members', { displayName: f.displayName, memberCode: f.memberCode || undefined, phone: f.phone || undefined, email: f.email || undefined, password: f.password }),
    onSuccess: () => {
      toast.success(m ? 'Member update' : `Member ${f.memberCode} add — ab sheet assign karein`);
      void qc.invalidateQueries({ queryKey: ['lead-admin'] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const invalid = f.displayName.trim().length < 2 || (!f.phone && !f.email) || (!m && f.password.length < 8);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={m ? `Member — ${m.memberCode}` : 'Naya Lead Team member'} description={m ? undefined : 'Member ID se login; pehli dafa ka password member ko alag se dein.'}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) mut.mutate();
          }}
        >
          <Field label="Naam" required htmlFor="lm-n">
            <Input id="lm-n" value={f.displayName} onChange={set('displayName')} />
          </Field>
          {!m && (
            <Field label="Member ID" htmlFor="lm-c" hint="Khali chhorein to agla number">
              <Input id="lm-c" value={f.memberCode} onChange={set('memberCode')} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" htmlFor="lm-p">
              <Input id="lm-p" value={f.phone} onChange={set('phone')} placeholder="0300…" />
            </Field>
            <Field label="Email" htmlFor="lm-e">
              <Input id="lm-e" type="email" value={f.email} onChange={set('email')} />
            </Field>
          </div>
          {!m && (
            <Field label="Initial password" required htmlFor="lm-pw" hint="Kam az kam 8 characters">
              <Input id="lm-pw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
            </Field>
          )}
          {mut.error && <Notice>{mut.error instanceof ApiError ? mut.error.message : 'Save nahi hua'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mut.isPending} disabled={invalid}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Lead Team members (spec §16): add, contact, disable / enable; shows assigned sheets. */
export function MembersAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lead-admin', 'members'], queryFn: () => get<{ items: Member[]; nextMemberCode: string }>('/lead-admin/members') });
  const [edit, setEdit] = React.useState<Member | 'new' | null>(null);
  const [toggle, setToggle] = React.useState<Member | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEdit('new')}>
          <Plus className="size-4" /> Add member
        </Button>
      </div>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi Lead member nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'c', header: 'Member ID', cell: (r) => <span className="font-semibold">{r.memberCode}</span> },
              { key: 'n', header: 'Naam', cell: (r) => r.displayName },
              { key: 'ct', header: 'Contact', cell: (r) => [r.phone && formatPhone(r.phone), r.email].filter(Boolean).join(' · ') || '—', hideSm: true },
              { key: 's', header: 'Sheets', cell: (r) => (r.sheets.length ? r.sheets.map((s) => s.campaign).join(', ') : <Chip tone="warning">No sheet</Chip>) },
              { key: 'o', header: 'Open leads', cell: (r) => r.openLeads, hideSm: true },
              { key: 'a', header: 'Status', cell: (r) => <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Disabled'}</Chip> },
              {
                key: 'x',
                header: '',
                cell: (r) => (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className={r.active ? 'text-danger' : undefined} onClick={() => setToggle(r)}>
                      {r.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />} {r.active ? 'Disable' : 'Enable'}
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      {edit && <MemberDialog m={edit === 'new' ? undefined : edit} nextCode={q.data?.nextMemberCode ?? ''} onClose={() => setEdit(null)} />}
      {toggle && (
        <ReasonDialog
          title={`${toggle.active ? 'Disable' : 'Enable'} ${toggle.memberCode}`}
          description={toggle.active ? 'Login foran band; sheets reassign karein taake leads ruk na jayein.' : 'Member dobara login kar sake ga.'}
          label="Note (audit)"
          submitLabel={toggle.active ? 'Disable' : 'Enable'}
          danger={toggle.active}
          onSubmit={async () => {
            await patch(`/lead-admin/members/${toggle.id}`, { active: !toggle.active });
            toast.success(toggle.active ? 'Disabled — sessions band' : 'Enabled');
            void qc.invalidateQueries({ queryKey: ['lead-admin'] });
          }}
          onClose={() => setToggle(null)}
        />
      )}
    </div>
  );
}

/**
 * Link a new Meta sheet — only the Google Sheet link is needed; title, campaign, tab and columns are read from the
 * sheet (D-045). Editing also allows renaming. Problems show a neutral line; the developer gets the reason.
 */
function SheetDialog({ sheet, onClose }: { sheet?: Sheet; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ title: sheet?.title ?? '', campaign: sheet?.campaign ?? '' });
  const [link, setLink] = React.useState(sheet?.googleSheetId ? `https://docs.google.com/spreadsheets/d/${sheet.googleSheetId}` : '');
  const m = useMutation({
    mutationFn: () => (sheet ? patch(`/lead-admin/sheets/${sheet.id}`, { title: f.title, campaign: f.campaign, ...sourcePayload(link) }) : post('/lead-admin/sheets', sourcePayload(link))),
    onSuccess: () => {
      toast.success(sheet ? 'Sheet update' : 'Sheet link ho gayi — ab member assign karein');
      void qc.invalidateQueries({ queryKey: ['lead-admin'] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ready = sheet ? !!(f.title.trim() && f.campaign.trim()) : !!link.trim();
  const errorText = m.error instanceof ApiError && m.error.status < 500 ? m.error.message : DEV_NOTIFIED;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={sheet ? `Edit — ${sheet.campaign}` : 'Meta sheet link karein'}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) m.mutate();
          }}
        >
          {sheet && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" required htmlFor="sh-t">
                <Input id="sh-t" value={f.title} onChange={set('title')} />
              </Field>
              <Field label="Campaign" required htmlFor="sh-c">
                <Input id="sh-c" value={f.campaign} onChange={set('campaign')} />
              </Field>
            </div>
          )}
          <SheetLinkField link={link} setLink={setLink} />
          {m.error && <Notice>{errorText}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={!ready}>
              {sheet ? 'Save' : 'Link sheet'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Delete a sheet (D-047): the lead team stops seeing it and every lead from it at once; syncing stops. Call history
 * and bookings stay on record (nothing clinical or historical is erased).
 */
function DeleteSheetDialog({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post<{ hiddenLeads: number; cancelledCallbacks: number }>(`/lead-admin/sheets/${sheet.id}/delete`),
    onSuccess: (r) => {
      toast.success(`Sheet delete — ${r.hiddenLeads} leads lead team se hata di gayi`);
      void qc.invalidateQueries({ queryKey: ['lead-admin'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Delete — ${sheet.campaign}?`}>
        <div className="space-y-3 text-dense">
          <p>
            Yeh sheet aur is ki <b>{sheet.leads} leads</b> lead team ko dikhna band ho jayengi{sheet.member ? ` (${sheet.member.displayName})` : ''}, pending callbacks cancel ho jayenge aur sync ruk
            jayegi.
          </p>
          <p className="text-muted">Calls / bookings ki history record mein rehti hai. Yahi sheet dobara link ho sakti hai.</p>
          {m.error && <Notice>{m.error instanceof ApiError && m.error.status < 500 ? m.error.message : DEV_NOTIFIED}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
              <Trash2 className="size-4" /> Delete sheet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Meta sheets (spec §16): link, assign one member at a time, history of assignments. */
export function SheetsAdmin() {
  const qc = useQueryClient();
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['lead-admin', 'sheets'], queryFn: () => get<{ items: Sheet[] }>('/lead-admin/sheets'), refetchInterval: pollInterval || 60_000 });
  const members = useQuery({ queryKey: ['lead-admin', 'members'], queryFn: () => get<{ items: Member[]; nextMemberCode: string }>('/lead-admin/members') });
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Sheet | null>(null);
  const [deleting, setDeleting] = React.useState<Sheet | null>(null);
  const [pick, setPick] = React.useState<Record<string, string>>({});
  const refresh = () => void qc.invalidateQueries({ queryKey: ['lead-admin'] });
  const assign = useMutation({
    mutationFn: (v: { sheetId: string; memberId: string }) => post<{ moved: number; imported: number }>(`/lead-admin/sheets/${v.sheetId}/assign`, { memberId: v.memberId }),
    onSuccess: (r) => {
      toast.success(`Sheet assign${r.moved ? ` — ${r.moved} open leads naye member ko` : ''}${r.imported ? ` · ${r.imported} leads aa gayi` : ''}`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Assign nahi hua'),
  });
  const toggleActive = useMutation({
    mutationFn: (s: Sheet) => patch(`/lead-admin/sheets/${s.id}`, { active: !s.active }),
    onSuccess: refresh,
  });
  return (
    <div className="space-y-3">
      <ServiceAccountBanner />
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Link sheet
        </Button>
      </div>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi Meta sheet link nahi">
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((s) => (
              <Card key={s.id} accent={s.member && s.lastSyncStatus !== 'FAILED' ? 'ops' : 'danger'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{s.campaign}</CardTitle>
                    <p className="text-dense text-muted">
                      {s.title} · {s.externalId} · {s.leads} leads
                    </p>
                  </div>
                  <Chip tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Chip>
                </CardHeader>
                <p className="mb-2 text-dense">
                  {s.member ? (
                    <>
                      Assigned: <span className="font-semibold">{s.member.memberCode} {s.member.displayName}</span> · {formatDateTime(s.member.assignedAt)}
                      {!s.member.active && <Chip tone="danger"> member disabled</Chip>}
                    </>
                  ) : (
                    <span className="text-danger">Kisi member ko assign nahi</span>
                  )}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Assign to" htmlFor={`as-${s.id}`}>
                    <Select id={`as-${s.id}`} value={pick[s.id] ?? ''} onChange={(e) => setPick((p) => ({ ...p, [s.id]: e.target.value }))}>
                      <option value="">Member chunein</option>
                      {members.data?.items.filter((m) => m.active && m.id !== s.member?.id).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.memberCode} · {m.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button size="sm" disabled={!pick[s.id]} loading={assign.isPending && assign.variables?.sheetId === s.id} onClick={() => assign.mutate({ sheetId: s.id, memberId: pick[s.id]! })}>
                    {s.member ? 'Reassign' : 'Assign'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(s)}>
                    {s.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(s)}>
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </div>
                <div className="mt-2">
                  <SyncPanel sheetId={s.id} s={s} />
                </div>
                {s.history.length > 1 && (
                  <details className="mt-2 text-dense text-muted">
                    <summary className="cursor-pointer">Assignment history</summary>
                    <ul className="mt-1 space-y-0.5">
                      {s.history.map((h, i) => (
                        <li key={i}>
                          {h.member} · {formatDateTime(h.assignedAt)}
                          {h.unassignedAt ? ` → ${formatDateTime(h.unassignedAt)}` : ' (current)'} · by {h.by}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {adding && <SheetDialog onClose={() => setAdding(false)} />}
      {editing && <SheetDialog sheet={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteSheetDialog sheet={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
