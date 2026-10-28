'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useSession } from '@/lib/session';
import { addDays, clinicDate } from '@/lib/time';
import type { AdRequest } from '@/lib/types';
import { titleCase } from '@/lib/utils';
import { Card, CardHeader, CardTitle, HeroBanner, StatTile } from '@/components/ui/card';
import { DataTable } from '@/components/ui/table';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { SyncHealth } from '@/components/leadership/sheet-sync';
import { pct, type Metrics } from '@/components/leadership/performance';
import type { Offer } from '@/components/leadership/marketing';

interface Breakdown {
  totals: Metrics;
  bySheet: { sheet: { id: string; title: string; campaign: string }; metrics: Metrics }[];
}

/** Muaz Tahir — Marketing & Lead Performance (spec §17): ads/offers, pending requests, campaign performance. */
export default function MuazHome() {
  const { me } = useSession();
  const today = clinicDate();
  const from = addDays(today, -29);
  const ads = useQuery({ queryKey: ['requests', 'ad', 'inbox'], queryFn: () => get<{ items: AdRequest[] }>('/requests/ad') });
  const offers = useQuery({ queryKey: ['offers', 'all'], queryFn: () => get<{ items: Offer[] }>('/offers') });
  const perf = useQuery({ queryKey: ['leadership', 'perf', from, today], queryFn: () => get<Breakdown>('/lead-reports/performance', { from, to: today }) });
  const open = ads.data?.items.filter((a) => !['COMPLETED', 'REJECTED'].includes(a.status)) ?? [];
  const byKind = (k: string) => open.filter((a) => a.kind === k).length;
  return (
    <div className="space-y-4">
      <HeroBanner label="Marketing & Lead Performance" title="Campaigns & requests" subtitle={me.user.displayName} />
      <SyncHealth />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/marketing/muaz/offers">
          <StatTile label="Active offers / posters" value={offers.data?.items.filter((o) => o.state === 'ACTIVE').length ?? '—'} hint={`${offers.data?.items.filter((o) => o.state === 'SCHEDULED').length ?? 0} scheduled`} />
        </Link>
        <Link href="/marketing/muaz/requests">
          <StatTile label="Pending requests" value={open.length} hint={`radius ${byKind('RADIUS_CHANGE')} · edit ${byKind('EDIT_AD')} · new ${byKind('NEW_AD')} · issue ${byKind('ISSUE')}`} accent={open.length ? 'danger' : 'ops'} />
        </Link>
        <Link href="/marketing/muaz/performance">
          <StatTile label="Leads (30 days)" value={perf.data?.totals.leads ?? '—'} hint={perf.data ? `${perf.data.totals.bookings} bookings` : undefined} />
        </Link>
        <Link href="/marketing/muaz/performance">
          <StatTile label="Check-ins" value={perf.data?.totals.checkIns ?? '—'} hint={perf.data ? `${perf.data.totals.followUpCompliance.overdue} follow-ups overdue` : undefined} />
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance (30 days)</CardTitle>
        </CardHeader>
        {perf.isPending ? (
          <LoadingRows rows={3} />
        ) : perf.isError ? (
          <ErrorState error={perf.error} onRetry={() => perf.refetch()} />
        ) : (
          <DataTable
            rows={perf.data.bySheet}
            rowKey={(r) => r.sheet.id}
            columns={[
              { key: 'c', header: 'Campaign', cell: (r) => <span className="font-semibold">{r.sheet.campaign}</span> },
              { key: 'l', header: 'Leads', cell: (r) => r.metrics.leads },
              { key: 'k', header: 'Contacted', cell: (r) => r.metrics.contacted, hideSm: true },
              { key: 'b', header: 'Bookings', cell: (r) => r.metrics.bookings },
              { key: 'ci', header: 'Check-ins', cell: (r) => r.metrics.checkIns },
              { key: 'cv', header: 'Contact→Book', cell: (r) => pct(r.metrics.conversion.contactedToBookingBp), hideSm: true },
            ]}
          />
        )}
      </Card>
      {open.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Latest open requests</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-line text-dense">
            {open.slice(0, 5).map((a) => (
              <li key={a.id} className="py-1.5">
                <Link href={`/marketing/muaz/requests?id=${a.id}`} className="font-semibold text-brand-medium hover:underline">
                  {titleCase(a.kind)}
                </Link>{' '}
                · {a.campaign ?? 'General'} · <span className="text-muted">{a.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
