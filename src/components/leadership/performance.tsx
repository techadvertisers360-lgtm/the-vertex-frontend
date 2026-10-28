'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { addDays, clinicDate, formatDateTime } from '@/lib/time';
import { cn, formatPhone, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';

export type Metric = 'leads' | 'contacted' | 'calls' | 'whatsapp' | 'bookings' | 'checkIns' | 'cancellations' | 'noShows' | 'callbacksDue' | 'callbacksOnTime' | 'callbacksOverdue';
export interface Metrics extends Record<Metric, number> {
  conversion: { contactedToBookingBp: number | null; bookingToCheckInBp: number | null };
  followUpCompliance: { due: number; onTime: number; overdue: number; onTimeBp: number | null; lastActionAt: string | null };
}
interface Breakdown {
  totals: Metrics;
  byMember: { member: { id: string; displayName: string; memberCode: string | null; active: boolean }; metrics: Metrics }[];
  bySheet: { sheet: { id: string; title: string; campaign: string }; metrics: Metrics }[];
}

export const pct = (bp: number | null) => (bp === null ? '—' : `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`);

const TILES: { key: Metric; label: string }[] = [
  { key: 'leads', label: 'Leads generated' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'calls', label: 'Calls' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'checkIns', label: 'Check-ins' },
  { key: 'cancellations', label: 'Cancellations' },
  { key: 'noShows', label: 'No-shows' },
];

type Row = {
  id: string;
  lead?: { id: string; name: string; phone: string; status: string; assignedMemberId?: string; sheet: { campaign: string } } | null;
  name?: string;
  phone?: string;
  sheet?: { campaign: string };
  status?: string;
  startAt?: string;
  createdAt?: string;
  dueAt?: string;
  channel?: string;
  result?: string | null;
  patient?: { name: string } | null;
};

/** Exact leads / activities / appointments behind a number (spec §16 "not just aggregate numbers"). */
function Drilldown({ metric, from, to, memberId, sheetId }: { metric: Metric; from: string; to: string; memberId?: string; sheetId?: string }) {
  const q = useQuery({
    queryKey: ['leadership', 'perf', 'drill', metric, from, to, memberId ?? '', sheetId ?? ''],
    queryFn: () => get<{ items: Row[] }>('/lead-reports/performance/drilldown', { metric, from, to, memberId, sheetId }),
  });
  if (q.isPending) return <LoadingRows />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.items.length) return <EmptyState title="Is number ke peeche koi record nahi" />;
  return (
    <ul className="max-h-[420px] divide-y divide-line overflow-auto">
      {q.data.items.map((r) => {
        const lead = r.lead ?? (r.name ? { id: r.id, name: r.name, phone: r.phone ?? '', status: r.status ?? '', sheet: r.sheet ?? { campaign: '' } } : null);
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-dense">
            <span>
              <span className="font-semibold text-ink">{lead?.name ?? r.patient?.name ?? '—'}</span>
              <span className="text-muted">
                {lead ? ` · ${formatPhone(lead.phone)} · ${lead.sheet.campaign}` : ''}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-muted">
              {r.channel && (
                <span>
                  {titleCase(r.channel)}
                  {r.result ? ` · ${titleCase(r.result)}` : ''}
                </span>
              )}
              {r.startAt && <span>Appt {formatDateTime(r.startAt)}</span>}
              {r.dueAt && <span>Due {formatDateTime(r.dueAt)}</span>}
              {!r.startAt && !r.dueAt && r.createdAt && <span>{formatDateTime(r.createdAt)}</span>}
              {r.status && <StatusChip status={r.status} />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NoteForm({ from, to, memberId, sheetId, scopeLabel }: { from: string; to: string; memberId?: string; sheetId?: string; scopeLabel: string }) {
  const qc = useQueryClient();
  const [note, setNote] = React.useState('');
  const m = useMutation({
    mutationFn: () => post('/lead-reports/notes', { from, to, memberId, sheetId, note: note.trim() }),
    onSuccess: () => {
      toast.success('Note Hamza Zafar ko bhej diya');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['leadership', 'notes'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Issue / action → Hamza Zafar</CardTitle>
        <Chip>{scopeLabel}</Chip>
      </CardHeader>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim().length >= 3) m.mutate();
        }}
      >
        <Textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kya dekha, kya action chahiye" />
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Note nahi gaya'}</Notice>}
        <Button type="submit" size="sm" loading={m.isPending} disabled={note.trim().length < 3}>
          Send to Hamza
        </Button>
      </form>
    </Card>
  );
}

/** Member and campaign performance with drill-down (spec §8, §16, §17). */
export function LeadershipPerformance({ canSendNote = false }: { canSendNote?: boolean }) {
  const today = clinicDate();
  const [from, setFrom] = React.useState(addDays(today, -29));
  const [to, setTo] = React.useState(today);
  const [scope, setScope] = React.useState<{ memberId?: string; sheetId?: string; label: string }>({ label: 'All members & campaigns' });
  const [metric, setMetric] = React.useState<Metric | null>(null);
  const all = useQuery({ queryKey: ['leadership', 'perf', from, to], queryFn: () => get<Breakdown>('/lead-reports/performance', { from, to }) });
  const scoped = useQuery({
    queryKey: ['leadership', 'perf', from, to, scope.memberId ?? '', scope.sheetId ?? ''],
    queryFn: () => get<Metrics>('/lead-reports/performance', { from, to, memberId: scope.memberId, sheetId: scope.sheetId }),
    enabled: !!(scope.memberId || scope.sheetId),
  });
  const m = scope.memberId || scope.sheetId ? scoped.data : all.data?.totals;

  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="From" htmlFor="lp-from">
          <Input id="lp-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="lp-to">
          <Input id="lp-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <span className="flex items-end gap-2 pb-1">
          <Chip tone={scope.memberId || scope.sheetId ? 'brand' : 'neutral'}>{scope.label}</Chip>
          {(scope.memberId || scope.sheetId) && (
            <Button size="sm" variant="ghost" onClick={() => setScope({ label: 'All members & campaigns' })} aria-label="Clear filter">
              <X className="size-4" />
            </Button>
          )}
        </span>
      </FilterBar>
      {all.isPending || (scoped.isPending && (scope.memberId || scope.sheetId)) || !m ? (
        all.isError ? <ErrorState error={all.error} onRetry={() => all.refetch()} /> : <LoadingRows rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TILES.map((t) => (
              <StatTile key={t.key} label={t.label} value={m[t.key]} onClick={() => setMetric(t.key)} active={metric === t.key} />
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatTile label="Contacted → Booking" value={pct(m.conversion.contactedToBookingBp)} />
            <StatTile label="Booking → Check-in" value={pct(m.conversion.bookingToCheckInBp)} />
            <StatTile
              label="Follow-up on time"
              value={pct(m.followUpCompliance.onTimeBp)}
              hint={`${m.followUpCompliance.onTime}/${m.followUpCompliance.due} due · ${m.followUpCompliance.overdue} overdue`}
              onClick={() => setMetric('callbacksOverdue')}
              active={metric === 'callbacksOverdue'}
              accent={m.followUpCompliance.overdue ? 'danger' : 'ops'}
            />
          </div>
          {metric && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {TILES.find((t) => t.key === metric)?.label ?? 'Overdue follow-ups'} — {scope.label}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setMetric(null)}>
                  Close
                </Button>
              </CardHeader>
              <Drilldown metric={metric} from={from} to={to} memberId={scope.memberId} sheetId={scope.sheetId} />
            </Card>
          )}
          {all.data && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>By member</CardTitle>
                </CardHeader>
                <DataTable
                  rows={all.data.byMember}
                  rowKey={(r) => r.member.id}
                  selectedKey={scope.memberId}
                  onRowClick={(r) => setScope({ memberId: r.member.id, label: `${r.member.memberCode ?? ''} ${r.member.displayName}` })}
                  columns={[
                    { key: 'm', header: 'Member', cell: (r) => <span className={cn('font-semibold', !r.member.active && 'text-muted line-through')}>{r.member.memberCode} · {r.member.displayName}</span> },
                    { key: 'l', header: 'Leads', cell: (r) => r.metrics.leads },
                    { key: 'c', header: 'Contacted', cell: (r) => r.metrics.contacted, hideSm: true },
                    { key: 'b', header: 'Bookings', cell: (r) => r.metrics.bookings },
                    { key: 'ci', header: 'Check-ins', cell: (r) => r.metrics.checkIns },
                    { key: 'f', header: 'Follow-up', cell: (r) => <Chip tone={r.metrics.followUpCompliance.overdue ? 'danger' : 'success'}>{pct(r.metrics.followUpCompliance.onTimeBp)}</Chip> },
                  ]}
                />
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>By campaign / sheet</CardTitle>
                </CardHeader>
                <DataTable
                  rows={all.data.bySheet}
                  rowKey={(r) => r.sheet.id}
                  selectedKey={scope.sheetId}
                  onRowClick={(r) => setScope({ sheetId: r.sheet.id, label: `${r.sheet.campaign} (${r.sheet.title})` })}
                  columns={[
                    { key: 's', header: 'Campaign', cell: (r) => <span className="font-semibold">{r.sheet.campaign}</span> },
                    { key: 'l', header: 'Leads', cell: (r) => r.metrics.leads },
                    { key: 'b', header: 'Bookings', cell: (r) => r.metrics.bookings },
                    { key: 'ci', header: 'Check-ins', cell: (r) => r.metrics.checkIns },
                    { key: 'cv', header: 'Contact→Book', cell: (r) => pct(r.metrics.conversion.contactedToBookingBp), hideSm: true },
                  ]}
                />
              </Card>
            </div>
          )}
          {canSendNote && <NoteForm from={from} to={to} memberId={scope.memberId} sheetId={scope.sheetId} scopeLabel={scope.label} />}
        </>
      )}
    </div>
  );
}

/** Notes Muaz sent (Hamza / MD read these on their performance screen). */
export function PerformanceNotes() {
  const q = useQuery({ queryKey: ['leadership', 'notes'], queryFn: () => get<{ items: { id: string; author: string | null; member: string | null; sheet: string | null; fromDate: string; toDate: string; note: string; createdAt: string }[] }>('/lead-reports/notes') });
  if (q.isPending) return <LoadingRows rows={2} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance notes</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line text-dense">
        {q.data.items.map((n) => (
          <li key={n.id} className="py-2">
            <p className="text-ink">{n.note}</p>
            <p className="text-muted">
              {n.author} · {[n.member, n.sheet, `${n.fromDate} → ${n.toDate}`].filter(Boolean).join(' · ')} · {formatDateTime(n.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
