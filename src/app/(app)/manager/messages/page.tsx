'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { clinicDate, formatDateTime, relativeFromNow } from '@/lib/time';
import { formatPhone, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows, MESSAGES, QueryState } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';
import { ReasonDialog } from '@/components/reception/dialogs';

const STATUSES = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;

interface Row {
  id: string;
  createdAt: string;
  template: string;
  templateLabel: string;
  toPhone: string;
  recipient: { kind: 'patient'; id: string; name: string; optedOut: boolean } | { kind: 'staff'; id: string; name: string; role: string } | null;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  errorClass: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

interface Detail {
  id: string;
  templateLabel: string;
  toPhone: string;
  status: string;
  attempts: number;
  lastError: string | null;
  errorClass: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  sensitive: boolean;
  text: string | null;
  patientId: string | null;
  failureTask: { status: string } | null;
  history: { id: string; action: string; at: string; by: string | null; reason: string | null }[];
}

interface Summary {
  today: Partial<Record<(typeof STATUSES)[number], number>>;
  openFailures: number;
  config: {
    provider: string;
    providerInstalled: boolean;
    mock: boolean;
    senderNumber: string;
    quietHours: string | null;
    maxRetries: number;
    retryBaseSec: number;
    terminalFailureRoles: string[];
    webhookSecretSet: boolean;
    templates: { key: string; label: string; audience: string; variables: string[]; providerTemplate: string | null }[];
  };
}

function SetupCard({ s }: { s: Summary }) {
  const c = s.config;
  const unmapped = c.templates.filter((t) => !t.providerTemplate).length;
  return (
    <Card accent={c.mock || !c.providerInstalled ? 'danger' : 'ops'}>
      <CardHeader>
        <CardTitle>WhatsApp setup</CardTitle>
        {c.mock ? <Chip tone="warning">Console (mock) — messages asal mein nahi jate</Chip> : c.providerInstalled ? <Chip tone="success">{c.provider}</Chip> : <Chip tone="danger">Provider install nahi</Chip>}
      </CardHeader>
      <dl className="grid grid-cols-2 gap-2 text-dense sm:grid-cols-4">
        <div>
          <dt className="text-muted">Sender number</dt>
          <dd className="text-ink">{c.senderNumber ? formatPhone(c.senderNumber) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Quiet hours (patients)</dt>
          <dd className="text-ink">{c.quietHours ?? 'none'}</dd>
        </div>
        <div>
          <dt className="text-muted">Retries</dt>
          <dd className="text-ink">
            {c.maxRetries} · {c.retryBaseSec}s backoff ×2
          </dd>
        </div>
        <div>
          <dt className="text-muted">Delivery webhook secret</dt>
          <dd className="text-ink">{c.webhookSecretSet ? 'set' : 'not set'}</dd>
        </div>
      </dl>
      <details className="mt-3 text-dense">
        <summary className="cursor-pointer font-semibold text-ink">
          Templates ({c.templates.length}){unmapped ? ` · ${unmapped} approved template mapping baqi` : ''}
        </summary>
        <ul className="mt-2 divide-y divide-line">
          {c.templates.map((t) => (
            <li key={t.key} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <span className="font-semibold text-ink">{t.label}</span> <span className="text-muted">({t.key}) · {t.audience.replace(/_/g, ' ')}</span>
              </span>
              {t.providerTemplate ? <Chip tone="success">{t.providerTemplate}</Chip> : <Chip tone="warning">not mapped</Chip>}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-2 text-dense text-muted">
        Provider, sender number, template mapping, quiet hours aur retries <Link className="font-semibold text-brand" href="/manager/settings">Settings</Link> mein (whatsapp.*, notify.*). Failure par{' '}
        {c.terminalFailureRoles.map((r) => titleCase(r)).join(', ')} ko alert jata hai.
      </p>
    </Card>
  );
}

function DetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['messages', 'detail', id], queryFn: () => get<Detail>(`/manager/messages/${id}`) });
  const [dialog, setDialog] = React.useState<'cancel' | 'handled' | 'optout' | 'optin' | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['messages'] });
    void qc.invalidateQueries({ queryKey: ['manager'] });
  };
  const retry = useMutation({
    mutationFn: () => post(`/manager/messages/${id}/retry`),
    onSuccess: () => {
      toast.success('Message dobara queue ho gaya');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Retry nahi hua'),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{q.data?.templateLabel ?? 'Message'}</CardTitle>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      {q.isPending ? (
        <LoadingRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-3 text-dense">
          <p className="flex flex-wrap items-center gap-2">
            <StatusChip status={q.data.status} /> {formatPhone(q.data.toPhone)} · {q.data.attempts} attempt{q.data.attempts === 1 ? '' : 's'}
            {q.data.nextAttemptAt && <span className="text-muted">· next {relativeFromNow(q.data.nextAttemptAt)}</span>}
          </p>
          {q.data.lastError && (
            <Notice tone={q.data.status === 'FAILED' ? 'danger' : 'warning'}>
              {q.data.status === 'FAILED' ? `${MESSAGES.messageFailed}: ${q.data.lastError} — retry karein ya patient ko call karein.` : q.data.lastError}
            </Notice>
          )}
          {q.data.sensitive ? (
            <p className="text-muted">Password-reset link — text log mein nahi dikhaya jata.</p>
          ) : (
            q.data.text && <p className="rounded-control bg-canvas px-3 py-2 text-ink">{q.data.text}</p>
          )}
          <dl className="grid grid-cols-2 gap-1">
            <dt className="text-muted">Queued</dt>
            <dd>{formatDateTime(q.data.createdAt)}</dd>
            <dt className="text-muted">Sent</dt>
            <dd>{q.data.sentAt ? formatDateTime(q.data.sentAt) : '—'}</dd>
            <dt className="text-muted">Delivered</dt>
            <dd>{q.data.deliveredAt ? formatDateTime(q.data.deliveredAt) : '—'}</dd>
            <dt className="text-muted">Failed</dt>
            <dd>{q.data.failedAt ? formatDateTime(q.data.failedAt) : '—'}</dd>
          </dl>
          {q.data.history.length > 0 && (
            <ol className="space-y-0.5 text-muted">
              {q.data.history.map((h) => (
                <li key={h.id}>
                  {formatDateTime(h.at)} · {h.action.replace(/_/g, ' ').toLowerCase()} · {h.by ?? 'System'}
                  {h.reason ? ` — ${h.reason}` : ''}
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            {q.data.status === 'FAILED' && (
              <>
                <Button size="sm" loading={retry.isPending} onClick={() => retry.mutate()}>
                  <RotateCcw className="size-4" /> Retry
                </Button>
                {q.data.failureTask?.status === 'PENDING' && (
                  <Button size="sm" variant="secondary" onClick={() => setDialog('handled')}>
                    Call kar liya (handled)
                  </Button>
                )}
              </>
            )}
            {q.data.status === 'QUEUED' && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('cancel')}>
                Cancel
              </Button>
            )}
            {q.data.patientId && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialog('optout')}>
                  Patient opt-out
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog('optin')}>
                  Opt back in
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {dialog && q.data && (
        <ReasonDialog
          title={{ cancel: 'Message cancel karein', handled: 'Failed message handled', optout: 'Patient WhatsApp opt-out', optin: 'Patient dobara WhatsApp par' }[dialog]}
          description={
            {
              cancel: 'Yeh message nahi bheja jayega.',
              handled: 'Patient ko call / doosre tareeqe se bata diya — failure task band ho jayega.',
              optout: 'Is patient ko aage koi WhatsApp nahi jayega; queued messages cancel.',
              optin: 'Sirf jab patient ne khud dobara consent diya ho. Wajah audit mein jati hai.',
            }[dialog]
          }
          label={dialog === 'handled' ? 'Note' : 'Wajah'}
          submitLabel="Save"
          danger={dialog === 'cancel' || dialog === 'optout'}
          onSubmit={async ({ reason }) => {
            if (dialog === 'cancel') await post(`/manager/messages/${id}/cancel`, { reason });
            if (dialog === 'handled') await post(`/manager/messages/${id}/handled`, { note: reason });
            if (dialog === 'optout' || dialog === 'optin') await post(`/manager/messages/patients/${q.data!.patientId}/whatsapp`, { optIn: dialog === 'optin', reason });
            toast.success('Save ho gaya');
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}

/** Message log (spec §20): every WhatsApp message with status, attempts, errors; retry / cancel / call fallback; opt-out. */
function View() {
  const params = useSearchParams();
  const { pollInterval } = useRealtime();
  const [f, setF] = React.useState({ status: params.get('status') ?? '', template: '', q: '', from: '', to: '' });
  const [open, setOpen] = React.useState<string | null>(params.get('id'));
  const summary = useQuery({ queryKey: ['messages', 'summary'], queryFn: () => get<Summary>('/manager/messages/summary'), refetchInterval: pollInterval || 60_000 });
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;
  const list = useInfiniteQuery({
    queryKey: ['messages', 'list', filters],
    queryFn: ({ pageParam }) => get<{ items: Row[]; nextCursor: string | null }>('/manager/messages', { ...filters, limit: '50', ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: pollInterval || 60_000,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const today = summary.data?.today ?? {};

  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Message log" />
      <QueryState query={summary} empty={() => false}>
        {(s) => (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Queued today" value={(today.QUEUED ?? 0) + (today.SENDING ?? 0)} />
              <StatTile label="Sent" value={today.SENT ?? 0} hint="delivery receipt ka intezar" />
              <StatTile label="Delivered" value={today.DELIVERED ?? 0} />
              <StatTile label="Failed today" value={today.FAILED ?? 0} accent={today.FAILED ? 'danger' : 'ops'} onClick={() => setF((x) => ({ ...x, status: 'FAILED' }))} />
              <StatTile label="Cancelled" value={today.CANCELLED ?? 0} hint="consent / opt-out / reschedule" />
              <StatTile label="Open failures" value={s.openFailures} hint="retry ya call baqi" accent={s.openFailures ? 'danger' : 'ops'} onClick={() => setF((x) => ({ ...x, status: 'FAILED' }))} />
            </div>
            <SetupCard s={s} />
          </>
        )}
      </QueryState>

      <FilterBar>
        <Field label="Status" htmlFor="m-s">
          <Select id="m-s" value={f.status} onChange={set('status')}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Template" htmlFor="m-t">
          <Select id="m-t" value={f.template} onChange={set('template')}>
            <option value="">All</option>
            {summary.data?.config.templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Patient / phone" htmlFor="m-q">
          <Input id="m-q" value={f.q} onChange={set('q')} placeholder="Naam ya 0300…" />
        </Field>
        <Field label="From" htmlFor="m-f">
          <Input id="m-f" type="date" max={clinicDate()} value={f.from} onChange={set('from')} />
        </Field>
        <Field label="To" htmlFor="m-to">
          <Input id="m-to" type="date" max={clinicDate()} value={f.to} onChange={set('to')} />
        </Field>
      </FilterBar>

      <div className={open ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]' : 'space-y-4'}>
        <div className="min-w-0 space-y-2">
          {list.isPending ? (
            <LoadingRows rows={6} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Aaj koi record nahi" hint="Filters badal kar dekhein." />
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={open ?? undefined}
              onRowClick={(r) => setOpen(r.id)}
              columns={[
                { key: 't', header: 'Time', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
                { key: 'tp', header: 'Message', cell: (r) => r.templateLabel },
                {
                  key: 'to',
                  header: 'To',
                  cell: (r) => (
                    <span>
                      {r.recipient ? r.recipient.name : formatPhone(r.toPhone)}
                      {r.recipient?.kind === 'staff' && <span className="text-muted"> · {titleCase(r.recipient.role)}</span>}
                      {r.recipient?.kind === 'patient' && r.recipient.optedOut && <Chip tone="warning"> opted out</Chip>}
                    </span>
                  ),
                },
                { key: 'p', header: 'Phone', cell: (r) => formatPhone(r.toPhone), hideSm: true },
                { key: 's', header: 'Status', cell: (r) => <StatusChip status={r.status} /> },
                { key: 'a', header: 'Tries', cell: (r) => r.attempts, hideSm: true },
                { key: 'e', header: 'Error / note', cell: (r) => <span className="line-clamp-2 text-muted">{r.lastError ?? '—'}</span>, hideSm: true },
              ]}
            />
          )}
          {list.hasNextPage && (
            <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
        {open && <DetailPanel key={open} id={open} onClose={() => setOpen(null)} />}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <React.Suspense>
      <View />
    </React.Suspense>
  );
}
