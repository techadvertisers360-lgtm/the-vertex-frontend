'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Megaphone, Plus } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useSession } from '@/lib/session';
import { clinicDate, formatDateTime, formatDay } from '@/lib/time';
import type { AdRequest } from '@/lib/types';
import { titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows, QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { UploadButton } from '@/components/ui/upload';
import { ViewFileButton } from '@/components/ui/file-view';
import { ListAndDetail, Thread } from '@/components/requests/panels';
import { ReasonDialog } from '@/components/reception/dialogs';

const AD_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'NEED_DETAILS'];
type Filter = 'open' | 'all';

/**
 * Ad / issue requests for Muaz + Hamza (spec §16–17): one shared thread per request (same ID in both inboxes);
 * reply, set status, attach a revised creative. The Lead member sees the same thread.
 */
export function AdInbox({ initialId }: { initialId?: string | null }) {
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<Filter>('open');
  const [kind, setKind] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(initialId ?? null);
  const [body, setBody] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [files, setFiles] = React.useState<string[]>([]);
  const list = useQuery({ queryKey: ['requests', 'ad', 'inbox'], queryFn: () => get<{ items: (AdRequest & { requesterId: string })[] }>('/requests/ad') });
  const detail = useQuery({ queryKey: ['requests', 'ad', selected], queryFn: () => get<AdRequest>(`/requests/ad/${selected}`), enabled: !!selected });
  const reply = useMutation({
    mutationFn: () => post(`/requests/ad/${selected}/messages`, { body: body.trim(), status: status || undefined, attachmentIds: files }),
    onSuccess: () => {
      toast.success('Reply bheji — Lead member aur co-recipient ko notice');
      setBody('');
      setStatus('');
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ['requests', 'ad'] });
    },
  });
  const items = (list.data?.items ?? []).filter((r) => (filter === 'all' || !['COMPLETED', 'REJECTED'].includes(r.status)) && (!kind || r.kind === kind));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'Open', count: (list.data?.items ?? []).filter((r) => !['COMPLETED', 'REJECTED'].includes(r.status)).length },
            { value: 'all', label: 'All' },
          ]}
        />
        <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-48">
          <option value="">All kinds</option>
          {['RADIUS_CHANGE', 'EDIT_AD', 'NEW_AD', 'ISSUE'].map((k) => (
            <option key={k} value={k}>
              {titleCase(k)}
            </option>
          ))}
        </Select>
      </div>
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Koi request nahi" />
      ) : (
        <ListAndDetail
          items={items}
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
                {r.campaign ?? 'General'} · #{r.id.slice(-6)} · {formatDateTime(r.updatedAt)}
              </p>
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
              <Card accent="leadership">
                <CardHeader>
                  <div className="min-w-0">
                    <SectionLabel>Shared with Muaz Tahir & Hamza Zafar · #{detail.data.id.slice(-6)}</SectionLabel>
                    <CardTitle>
                      {titleCase(detail.data.kind)} · {detail.data.campaign ?? 'General'}
                    </CardTitle>
                    <p className="text-dense text-ink">{detail.data.detail}</p>
                    {detail.data.reason && <p className="text-dense text-muted">Reason: {detail.data.reason}</p>}
                  </div>
                  <StatusChip status={detail.data.status} />
                </CardHeader>
                <Thread messages={detail.data.thread ?? []} />
                {(detail.data.thread ?? []).some((m) => Array.isArray(m.attachmentIds) && m.attachmentIds.length) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(detail.data.thread ?? []).flatMap((m) => (Array.isArray(m.attachmentIds) ? (m.attachmentIds as string[]) : [])).map((id, i) => (
                      <ViewFileButton key={id} attachmentId={id} label={`Creative ${i + 1}`} />
                    ))}
                  </div>
                )}
                <form
                  className="mt-3 space-y-2 border-t border-line pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (body.trim()) reply.mutate();
                  }}
                >
                  <Textarea aria-label="Reply" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply / decision / kya badla" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <UploadButton route="adCreative" recordType="AdRequest" recordId={detail.data.id} label={files.length ? `${files.length} creative ✓` : 'Revised creative'} onUploaded={(id) => setFiles((f) => [...f, id])} />
                    <span className="flex gap-2">
                      <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48">
                        <option value="">Status same</option>
                        {AD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {titleCase(s)}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" loading={reply.isPending} disabled={!body.trim()}>
                        Send
                      </Button>
                    </span>
                  </div>
                  {reply.error && <Notice>{reply.error instanceof ApiError ? reply.error.message : 'Reply nahi gayi'}</Notice>}
                </form>
              </Card>
            )
          }
        />
      )}
    </div>
  );
}

export interface Offer {
  id: string;
  title: string;
  serviceName: string | null;
  description: string | null;
  validFrom: string;
  validTo: string;
  attachmentId: string | null;
  sheet: { id: string; title: string; campaign: string } | null;
  createdBy: string | null;
  withdrawnAt: string | null;
  state: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'WITHDRAWN';
}

const STATE_TONE = { ACTIVE: 'success', SCHEDULED: 'info', EXPIRED: 'neutral', WITHDRAWN: 'warning' } as const;

/** Active offers card for Lead Team, Reception and Manager (spec §17). */
export function ActiveOffers({ compact = false }: { compact?: boolean }) {
  const q = useQuery({ queryKey: ['offers', 'active'], queryFn: () => get<{ items: Offer[] }>('/offers/active'), staleTime: 60_000 });
  if (q.isPending || q.isError || !q.data.items.length) return null;
  return (
    <Card accent="leadership">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-gold" /> Active offers
        </CardTitle>
        <Chip tone="gold">{q.data.items.length}</Chip>
      </CardHeader>
      <ul className="space-y-2">
        {q.data.items.slice(0, compact ? 3 : 20).map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-dense">
            <span>
              <span className="font-semibold text-ink">{o.title}</span>
              {o.serviceName && <span className="text-muted"> · {o.serviceName}</span>}
              <span className="block text-[12px] text-muted">{formatDay(o.validTo)} tak</span>
            </span>
            {o.attachmentId && <ViewFileButton attachmentId={o.attachmentId} label="Poster" />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OfferDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const today = clinicDate();
  const [f, setF] = React.useState({ title: '', serviceName: '', description: '', validFrom: today, validTo: '' });
  const [creative, setCreative] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      post('/offers', {
        title: f.title,
        serviceName: f.serviceName || undefined,
        description: f.description || undefined,
        validFrom: new Date(`${f.validFrom}T00:00:00+05:00`).toISOString(),
        validTo: new Date(`${f.validTo}T23:59:59+05:00`).toISOString(),
        attachmentId: creative,
      }),
    onSuccess: () => {
      toast.success('Offer publish — Lead Team, Reception aur Manager ko dikhega');
      void qc.invalidateQueries({ queryKey: ['offers'] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const invalid = f.title.trim().length < 2 || !f.validTo || f.validTo < f.validFrom || !creative;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Naya creative / offer" description="Final poster ya ad upload karein; validity khatam hone par offer active list se hat jata hai (history mein rehta hai).">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) m.mutate();
          }}
        >
          <Field label="Offer title" required htmlFor="of-t">
            <Input id="of-t" value={f.title} onChange={set('title')} />
          </Field>
          <Field label="Service" htmlFor="of-s">
            <Input id="of-s" value={f.serviceName} onChange={set('serviceName')} />
          </Field>
          <Field label="Details" htmlFor="of-d">
            <Textarea id="of-d" rows={2} value={f.description} onChange={set('description')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valid from" required htmlFor="of-f">
              <Input id="of-f" type="date" value={f.validFrom} onChange={set('validFrom')} />
            </Field>
            <Field label="Valid to" required htmlFor="of-to">
              <Input id="of-to" type="date" min={f.validFrom} value={f.validTo} onChange={set('validTo')} />
            </Field>
          </div>
          <UploadButton route="adCreative" recordType="Pending" recordId={me.user.id} label={creative ? 'Creative uploaded ✓' : 'Upload poster / ad'} onUploaded={setCreative} />
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Publish nahi hua'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={invalid}>
              Publish
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Creatives & offers manager (Muaz / Hamza). */
export function OffersManager() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['offers', 'all'], queryFn: () => get<{ items: Offer[] }>('/offers') });
  const [adding, setAdding] = React.useState(false);
  const [withdraw, setWithdraw] = React.useState<Offer | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" /> New offer
        </Button>
      </div>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi offer nahi">
        {(d) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.items.map((o) => (
              <Card key={o.id} accent={o.state === 'ACTIVE' ? 'leadership' : 'none'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{o.title}</CardTitle>
                    <p className="text-dense text-muted">{[o.serviceName, o.sheet?.campaign].filter(Boolean).join(' · ') || 'All services'}</p>
                  </div>
                  <Chip tone={STATE_TONE[o.state]}>{titleCase(o.state)}</Chip>
                </CardHeader>
                {o.description && <p className="text-dense text-ink">{o.description}</p>}
                <p className="mt-1 text-dense text-muted">
                  {formatDay(o.validFrom)} → {formatDay(o.validTo)} · {o.createdBy}
                </p>
                <div className="mt-3 flex gap-2">
                  {o.attachmentId && <ViewFileButton attachmentId={o.attachmentId} label="Creative" />}
                  {(o.state === 'ACTIVE' || o.state === 'SCHEDULED') && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setWithdraw(o)}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {adding && <OfferDialog onClose={() => setAdding(false)} />}
      {withdraw && (
        <ReasonDialog
          title={`Withdraw: ${withdraw.title}`}
          description="Offer active list se foran hat jayega; history mein rahega."
          label="Wajah"
          submitLabel="Withdraw"
          danger
          onSubmit={async ({ reason }) => {
            await post(`/offers/${withdraw.id}/withdraw`, { reason });
            toast.success('Offer withdraw');
            void qc.invalidateQueries({ queryKey: ['offers'] });
          }}
          onClose={() => setWithdraw(null)}
        />
      )}
    </div>
  );
}
