'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { ApiError, get, post, put } from '@/lib/api';
import { useSession } from '@/lib/session';
import { addDays, clinicDate, clinicHm, clinicToIso, formatDateTime, formatDay } from '@/lib/time';
import type { AdRequest, Complaint, LeaveRequest, Sheet, ThreadMessage } from '@/lib/types';
import { cn, titleCase } from '@/lib/utils';
import { statusLabel } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';

// ───────────── Thread ─────────────

export function Thread({ messages }: { messages: ThreadMessage[] }) {
  const { me } = useSession();
  return (
    <ol className="space-y-2">
      {messages.map((m) => {
        const mine = m.authorId === me.user.id;
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-card border px-3 py-2', mine ? 'border-brand-light bg-brand-light' : 'border-line bg-surface')}>
              <p className="text-[12px] font-semibold text-muted">
                {m.author?.displayName ?? 'Unknown'} · {formatDateTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-dense text-ink">{m.body}</p>
              {m.statusChange && (
                <p className="mt-1">
                  <StatusChip status={m.statusChange} />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplyBox({ onSend, statuses, pending }: { onSend: (body: string, status?: string) => Promise<unknown>; statuses?: string[]; pending: boolean }) {
  const [body, setBody] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return setErr('Message likhein');
    try {
      await onSend(body.trim(), status || undefined);
      setBody('');
      setStatus('');
      setErr(null);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Message nahi gaya — dobara koshish karein.');
    }
  };
  return (
    <form onSubmit={send} className="space-y-2 border-t border-line pt-3">
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply likhein…" aria-label="Reply" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {statuses && (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56" aria-label="Status">
            <option value="">Status same rakhein</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" loading={pending}>
          Send
        </Button>
      </div>
      {err && <Notice>{err}</Notice>}
    </form>
  );
}

export function ListAndDetail<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  renderRow,
  detail,
}: {
  items: T[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  renderRow: (t: T) => React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onSelect(t.id)}
              className={cn('w-full rounded-card border border-line bg-surface p-3 text-left shadow-card hover:bg-brand-light', selectedId === t.id && 'bg-brand-light ring-1 ring-brand-medium')}
            >
              {renderRow(t)}
            </button>
          </li>
        ))}
      </ul>
      <div>{detail}</div>
    </div>
  );
}

// ───────────── Ad / Issue requests (spec §7) ─────────────

const AD_KINDS = ['RADIUS_CHANGE', 'EDIT_AD', 'NEW_AD', 'ISSUE'] as const;

function NewAdRequest({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<(typeof AD_KINDS)[number]>('RADIUS_CHANGE');
  const [sheetId, setSheetId] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [reason, setReason] = React.useState('');
  const sheets = useQuery({ queryKey: ['lead', 'sheets'], queryFn: () => get<{ items: Sheet[] }>('/lead/sheets'), enabled: open });
  const m = useMutation({
    mutationFn: () => post<AdRequest>('/requests/ad', { kind, sheetId: sheetId || undefined, detail, reason: reason || undefined }),
    onSuccess: (r) => {
      toast.success('Request Muaz aur Hamza Zafar ko bhej di gayi');
      void qc.invalidateQueries({ queryKey: ['requests', 'ad'] });
      setDetail('');
      setReason('');
      setOpen(false);
      onCreated(r.id);
    },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Ad / Issue request
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Ad / Issue request" description="Ek hi request Muaz aur Hamza Zafar dono ko jati hai; jawab isi thread mein aata hai.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (detail.trim().length >= 2) m.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" required htmlFor="ad-kind">
                <Select id="ad-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  {AD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {titleCase(k)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Campaign / sheet" htmlFor="ad-sheet">
                <Select id="ad-sheet" value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
                  <option value="">General</option>
                  {sheets.data?.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.campaign}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Detail" required htmlFor="ad-detail" error={detail && detail.trim().length < 2 ? 'Detail likhein' : undefined}>
              <Textarea id="ad-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Radius 5km se 10km karein" />
            </Field>
            <Field label="Reason" htmlFor="ad-reason">
              <Input id="ad-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Request nahi gayi'}</Notice>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={m.isPending} disabled={detail.trim().length < 2}>
                Send request
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdRequestsPanel({ initialId }: { initialId?: string | null }) {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<string | null>(initialId ?? null);
  const list = useQuery({ queryKey: ['requests', 'ad'], queryFn: () => get<{ items: AdRequest[] }>('/requests/ad') });
  const detail = useQuery({ queryKey: ['requests', 'ad', selected], queryFn: () => get<AdRequest>(`/requests/ad/${selected}`), enabled: !!selected });
  const reply = useMutation({
    mutationFn: (v: { body: string; status?: string }) => post(`/requests/ad/${selected}/messages`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests', 'ad'] }),
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <NewAdRequest onCreated={setSelected} />
      </div>
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Koi request nahi" hint="Radius change, ad edit, new ad ya koi issue — ek hi form se bhejein." />
      ) : (
        <ListAndDetail
          items={list.data.items}
          selectedId={selected}
          onSelect={setSelected}
          renderRow={(r) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-dense font-semibold text-ink">{titleCase(r.kind)}</p>
                <StatusChip status={r.status} />
              </div>
              <p className="line-clamp-1 text-dense text-muted">{r.detail}</p>
              <p className="text-[12px] text-muted">
                {r.campaign ?? 'General'} · {formatDateTime(r.updatedAt)}
              </p>
            </>
          )}
          detail={
            !selected ? (
              <EmptyState title="Request chunein" hint="Thread aur replies yahan dikhenge." />
            ) : detail.isPending ? (
              <LoadingRows />
            ) : detail.isError ? (
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            ) : (
              <Card accent="leadership">
                <CardHeader>
                  <div>
                    <SectionLabel>To Muaz Tahir & Hamza Zafar</SectionLabel>
                    <CardTitle>
                      {titleCase(detail.data.kind)} · {detail.data.campaign ?? 'General'}
                    </CardTitle>
                  </div>
                  <StatusChip status={detail.data.status} />
                </CardHeader>
                <Thread messages={detail.data.thread ?? []} />
                <div className="mt-3">
                  <ReplyBox pending={reply.isPending} onSend={(body, status) => reply.mutateAsync({ body, status })} />
                </div>
              </Card>
            )
          }
        />
      )}
    </div>
  );
}

// ───────────── Leave / early leave (spec §21; D-013) ─────────────

/** Days in an inclusive 'YYYY-MM-DD' range (0 when the end is before the start). */
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1);

/** "28 Oct → 30 Oct (3 din)" for leave, "28 Oct, 4:00 pm → 9:00 pm" for early leave. */
export function leaveWhen(r: Pick<LeaveRequest, 'kind' | 'startAt' | 'endAt'>): string {
  const a = clinicDate(new Date(r.startAt));
  const b = clinicDate(new Date(r.endAt));
  if (r.kind === 'LEAVE' && clinicHm(r.startAt) === '00:00' && clinicHm(r.endAt) === '23:59') {
    const n = daysBetween(a, b);
    return a === b ? `${formatDay(r.startAt)} (1 din)` : `${formatDay(r.startAt)} → ${formatDay(r.endAt)} (${n} din)`;
  }
  return a === b ? `${formatDateTime(r.startAt)} → ${clinicHm(r.endAt)}` : `${formatDateTime(r.startAt)} → ${formatDateTime(r.endAt)}`;
}

function LeaveForm({ existing, onDone }: { existing?: LeaveRequest; onDone: () => void }) {
  const qc = useQueryClient();
  const today = clinicDate();
  const tomorrow = addDays(today, 1);
  const [kind, setKind] = React.useState<'LEAVE' | 'EARLY_LEAVE'>(existing?.kind ?? 'LEAVE');
  // Leave: whole days from one date to another. Early leave: one day, from a time until a time.
  const [date, setDate] = React.useState(existing ? clinicDate(new Date(existing.startAt)) : tomorrow);
  const [untilDate, setUntilDate] = React.useState(existing ? clinicDate(new Date(existing.endAt)) : tomorrow);
  const [from, setFrom] = React.useState(existing?.kind === 'EARLY_LEAVE' ? clinicHm(existing.startAt) : '16:00');
  const [to, setTo] = React.useState(existing?.kind === 'EARLY_LEAVE' ? clinicHm(existing.endAt) : '21:00');
  const [reason, setReason] = React.useState(existing?.reason ?? '');
  const [coverage, setCoverage] = React.useState(existing?.coveragePlan ?? '');
  const isLeave = kind === 'LEAVE';
  const days = daysBetween(date, untilDate);
  const m = useMutation({
    mutationFn: () => {
      const span = isLeave ? { startAt: clinicToIso(date, '00:00'), endAt: clinicToIso(untilDate, '23:59') } : { startAt: clinicToIso(date, from), endAt: clinicToIso(date, to) };
      const body = { kind, ...span, reason, coveragePlan: coverage || undefined };
      return existing ? put(`/requests/leave/${existing.id}`, body) : post('/requests/leave', body);
    },
    onSuccess: () => {
      toast.success(existing ? 'Request dobara bhej di' : 'Leave request bhej di');
      void qc.invalidateQueries({ queryKey: ['requests', 'leave'] });
      onDone();
    },
  });
  const badRange = isLeave ? untilDate < date : to <= from;
  const invalid = reason.trim().length < 2 || !date || (isLeave && !untilDate) || badRange;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) m.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Type" htmlFor="lv-kind">
          <Select id="lv-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="LEAVE">Leave (poore din)</option>
            <option value="EARLY_LEAVE">Early leave (aaj jaldi jana)</option>
          </Select>
        </Field>
        {isLeave ? (
          <>
            <Field label="Kis tareekh se" htmlFor="lv-date">
              <Input
                id="lv-date"
                type="date"
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (untilDate < e.target.value) setUntilDate(e.target.value);
                }}
              />
            </Field>
            <Field label="Kis tareekh tak" htmlFor="lv-until" error={badRange ? 'Aakhri tareekh pehli ke baad ho' : undefined}>
              <Input id="lv-until" type="date" min={date || today} value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
            </Field>
            <div className="flex items-end pb-2 text-dense text-muted">{!badRange && date && untilDate ? `Kul ${days} din` : ''}</div>
          </>
        ) : (
          <>
            <Field label="Date" htmlFor="lv-date">
              <Input id="lv-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Kitne baje jana hai" htmlFor="lv-from">
              <Input id="lv-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Duty khatam (tak)" htmlFor="lv-to" error={badRange ? 'End start ke baad ho' : undefined}>
              <Input id="lv-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Field label="Reason" required htmlFor="lv-reason">
        <Textarea id="lv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Coverage plan" htmlFor="lv-cov">
        <Input id="lv-cov" value={coverage} onChange={(e) => setCoverage(e.target.value)} />
      </Field>
      {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Request nahi gayi'}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={m.isPending} disabled={invalid}>
          {existing ? 'Resubmit' : 'Send request'}
        </Button>
      </div>
    </form>
  );
}

export function LeavePanel({ initialId, approverHint }: { initialId?: string | null; approverHint: string }) {
  const [selected, setSelected] = React.useState<string | null>(initialId ?? null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const list = useQuery({ queryKey: ['requests', 'leave', 'mine'], queryFn: () => get<{ items: LeaveRequest[] }>('/requests/leave', { box: 'mine' }) });
  const detail = useQuery({ queryKey: ['requests', 'leave', selected], queryFn: () => get<LeaveRequest>(`/requests/leave/${selected}`), enabled: !!selected });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-dense text-muted">{approverHint}</p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Leave / early leave
        </Button>
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent wide title="Leave / early leave request">
          <LeaveForm onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Koi leave request nahi" />
      ) : (
        <ListAndDetail
          items={list.data.items}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            setEditing(false);
          }}
          renderRow={(r) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-dense font-semibold text-ink">{r.kind === 'LEAVE' ? 'Leave' : 'Early leave'}</p>
                <StatusChip status={r.status} />
              </div>
              <p className="text-[12px] text-muted">{leaveWhen(r)}</p>
            </>
          )}
          detail={
            !selected ? (
              <EmptyState title="Request chunein" />
            ) : detail.isPending ? (
              <LoadingRows />
            ) : detail.isError ? (
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            ) : (
              <Card accent="ops">
                <CardHeader>
                  <div>
                    <SectionLabel>Approver: {titleCase(detail.data.approverRole)}</SectionLabel>
                    <CardTitle>{detail.data.kind === 'LEAVE' ? 'Leave' : 'Early leave'}</CardTitle>
                    <p className="text-dense text-muted">{leaveWhen(detail.data)}</p>
                  </div>
                  <StatusChip status={detail.data.status} />
                </CardHeader>
                {detail.data.decisionReason && <Notice tone={detail.data.status === 'APPROVED' ? 'success' : 'warning'}>{detail.data.decisionReason}</Notice>}
                <div className="mt-3">
                  <Thread messages={detail.data.thread ?? []} />
                </div>
                {detail.data.status === 'RETURNED_FOR_CORRECTION' &&
                  (editing ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <LeaveForm existing={detail.data} onDone={() => setEditing(false)} />
                    </div>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <Button onClick={() => setEditing(true)}>Correct & resubmit</Button>
                    </div>
                  ))}
              </Card>
            )
          }
        />
      )}
    </div>
  );
}

// ───────────── Complaints (spec §21; D-019) ─────────────

function NewComplaint({ recipientHint }: { recipientHint: string }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [open, setOpen] = React.useState(false);
  const [recipient, setRecipient] = React.useState<'MANAGER' | 'MD' | 'HAMZA'>('MANAGER');
  const [subject, setSubject] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const isManager = me.user.role === 'MANAGER';
  const m = useMutation({
    mutationFn: () => post('/requests/complaints', { subject, detail, recipient: isManager ? undefined : recipient }),
    onSuccess: () => {
      toast.success('Complaint bhej di gayi');
      void qc.invalidateQueries({ queryKey: ['requests', 'complaints'] });
      setSubject('');
      setDetail('');
      setOpen(false);
    },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New complaint
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Complaint" description={recipientHint}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (subject.trim().length >= 2 && detail.trim().length >= 2) m.mutate();
            }}
          >
            {!isManager && (
              <Field label="Kis ko bhejni hai" required htmlFor="cp-to">
                <Select id="cp-to" value={recipient} onChange={(e) => setRecipient(e.target.value as typeof recipient)}>
                  <option value="MANAGER">Manager</option>
                  <option value="MD">MD (Usama Sufain)</option>
                  {me.user.role !== 'MARKETING_DIRECTOR' && <option value="HAMZA">Hamza Zafar</option>}
                </Select>
              </Field>
            )}
            <Field label="Subject" required htmlFor="cp-sub">
              <Input id="cp-sub" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Detail" required htmlFor="cp-det">
              <Textarea id="cp-det" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} />
            </Field>
            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Complaint nahi gayi'}</Notice>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={m.isPending} disabled={subject.trim().length < 2 || detail.trim().length < 2}>
                Send
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ComplaintsPanel({ initialId, recipientHint }: { initialId?: string | null; recipientHint: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<string | null>(initialId ?? null);
  const list = useQuery({ queryKey: ['requests', 'complaints', 'mine'], queryFn: () => get<{ items: Complaint[] }>('/requests/complaints', { box: 'mine' }) });
  const detail = useQuery({ queryKey: ['requests', 'complaints', selected], queryFn: () => get<Complaint>(`/requests/complaints/${selected}`), enabled: !!selected });
  const reply = useMutation({
    mutationFn: (v: { body: string }) => post(`/requests/complaints/${selected}/messages`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests', 'complaints'] }),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-dense text-muted">{recipientHint}</p>
        <NewComplaint recipientHint={recipientHint} />
      </div>
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Koi complaint nahi" />
      ) : (
        <ListAndDetail
          items={list.data.items}
          selectedId={selected}
          onSelect={setSelected}
          renderRow={(c) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="line-clamp-1 text-dense font-semibold text-ink">{c.subject}</p>
                <StatusChip status={c.status} />
              </div>
              <p className="text-[12px] text-muted">{formatDateTime(c.createdAt)}</p>
            </>
          )}
          detail={
            !selected ? (
              <EmptyState title="Complaint chunein" />
            ) : detail.isPending ? (
              <LoadingRows />
            ) : detail.isError ? (
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            ) : (
              <Card accent="ops">
                <CardHeader>
                  <CardTitle>{detail.data.subject}</CardTitle>
                  <StatusChip status={detail.data.status} />
                </CardHeader>
                <Thread messages={detail.data.thread ?? []} />
                <div className="mt-3">
                  <ReplyBox pending={reply.isPending} onSend={(body) => reply.mutateAsync({ body })} />
                </div>
              </Card>
            )
          }
        />
      )}
    </div>
  );
}
