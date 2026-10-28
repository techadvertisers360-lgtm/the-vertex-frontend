'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { addDays, clinicDate, formatDateTime } from '@/lib/time';
import { formatPhone, titleCase } from '@/lib/utils';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { FilterBar } from '@/components/ui/table';

type Metric = 'leads' | 'contacted' | 'calls' | 'whatsapp' | 'bookings' | 'checkIns' | 'cancellations' | 'noShows' | 'callbacksDue' | 'callbacksOnTime' | 'callbacksOverdue';

interface Metrics extends Record<Metric, number> {
  conversion: { contactedToBookingBp: number | null; bookingToCheckInBp: number | null };
  followUpCompliance: { due: number; onTime: number; overdue: number; onTimeBp: number | null; lastActionAt: string | null };
}

const pct = (bp: number | null) => (bp === null ? '—' : `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`);

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

type Row = Record<string, unknown> & {
  id: string;
  lead?: { id: string; name: string; phone: string; status: string; sheet: { campaign: string } } | null;
  name?: string;
  phone?: string;
  sheet?: { campaign: string };
  status?: string;
  startAt?: string;
  createdAt?: string;
  dueAt?: string;
  channel?: string;
  result?: string | null;
};

function Drilldown({ metric, from, to }: { metric: Metric; from: string; to: string }) {
  const q = useQuery({ queryKey: ['lead', 'perf', 'drill', metric, from, to], queryFn: () => get<{ items: Row[] }>('/lead/performance/drilldown', { metric, from, to }) });
  if (q.isPending) return <LoadingRows />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.items.length) return <EmptyState title="Is metric ke peeche koi record nahi" />;
  return (
    <ul className="divide-y divide-line">
      {q.data.items.map((r) => {
        const lead = r.lead ?? (r.name ? { id: r.id, name: r.name, phone: r.phone ?? '', status: r.status ?? '', sheet: r.sheet ?? { campaign: '' } } : null);
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-dense">
            <div>
              {lead ? (
                <Link href={`/lead/leads/${lead.id}`} className="font-semibold text-brand-medium hover:underline">
                  {lead.name}
                </Link>
              ) : (
                <span className="font-semibold">—</span>
              )}
              <span className="text-muted">
                {' '}
                · {lead ? formatPhone(lead.phone) : ''} · {lead?.sheet.campaign}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              {r.channel && <span>{titleCase(r.channel)}{r.result ? ` · ${titleCase(r.result)}` : ''}</span>}
              {r.startAt && <span>Appt {formatDateTime(r.startAt)}</span>}
              {r.dueAt && <span>Due {formatDateTime(r.dueAt)}</span>}
              {!r.startAt && !r.dueAt && r.createdAt && <span>{formatDateTime(r.createdAt)}</span>}
              {r.status && <StatusChip status={r.status} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function PerformancePage() {
  const today = clinicDate();
  const [from, setFrom] = React.useState(addDays(today, -29));
  const [to, setTo] = React.useState(today);
  const [metric, setMetric] = React.useState<Metric | null>(null);
  const q = useQuery({ queryKey: ['lead', 'perf', from, to], queryFn: () => get<Metrics>('/lead/performance', { from, to }) });

  return (
    <div className="space-y-4">
      <PageHeader label="Lead Team" title="My Performance" />
      <FilterBar>
        <Field label="From" htmlFor="p-from">
          <Input id="p-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="p-to">
          <Input id="p-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </FilterBar>
      {q.isPending ? (
        <LoadingRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TILES.map((t) => (
              <StatTile key={t.key} label={t.label} value={q.data[t.key]} onClick={() => setMetric(t.key)} active={metric === t.key} />
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatTile label="Contacted → Booking" value={pct(q.data.conversion.contactedToBookingBp)} />
            <StatTile label="Booking → Check-in" value={pct(q.data.conversion.bookingToCheckInBp)} />
            <StatTile
              label="Follow-up on time"
              value={pct(q.data.followUpCompliance.onTimeBp)}
              hint={`${q.data.followUpCompliance.onTime}/${q.data.followUpCompliance.due} due · ${q.data.followUpCompliance.overdue} overdue`}
              onClick={() => setMetric('callbacksOverdue')}
              active={metric === 'callbacksOverdue'}
              accent={q.data.followUpCompliance.overdue ? 'danger' : 'ops'}
            />
          </div>
          {metric && (
            <Card>
              <CardHeader>
                <CardTitle>{TILES.find((t) => t.key === metric)?.label ?? 'Overdue follow-ups'} — detail</CardTitle>
              </CardHeader>
              <Drilldown metric={metric} from={from} to={to} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
