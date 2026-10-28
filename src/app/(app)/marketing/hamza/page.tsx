'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useSession } from '@/lib/session';
import { addDays, clinicDate } from '@/lib/time';
import type { AdRequest, Complaint } from '@/lib/types';
import { HeroBanner, StatTile } from '@/components/ui/card';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { SyncHealth } from '@/components/leadership/sheet-sync';
import { pct, type Metrics } from '@/components/leadership/performance';
import { PerformanceNotes } from '@/components/leadership/performance';

interface Breakdown {
  totals: Metrics;
  byMember: { member: { id: string; active: boolean } }[];
  bySheet: unknown[];
}

/**
 * Hamza Zafar — Marketing & Development Director (spec §16). Not Dr Hamza Rasool. Home: Lead Team, Meta sheets,
 * performance and escalations; KPI cards open the drill-down screens. No clinical data anywhere on this role.
 */
export default function HamzaHome() {
  const { me } = useSession();
  const today = clinicDate();
  const from = addDays(today, -29);
  const perf = useQuery({ queryKey: ['leadership', 'perf', from, today], queryFn: () => get<Breakdown>('/lead-reports/performance', { from, to: today }) });
  const ads = useQuery({ queryKey: ['requests', 'ad', 'inbox'], queryFn: () => get<{ items: AdRequest[] }>('/requests/ad') });
  const complaints = useQuery({ queryKey: ['requests', 'complaints', 'inbox'], queryFn: () => get<{ items: Complaint[] }>('/requests/complaints', { box: 'inbox' }) });
  const t = perf.data?.totals;
  const openAds = ads.data?.items.filter((a) => !['COMPLETED', 'REJECTED'].includes(a.status)).length ?? 0;
  const openComplaints = complaints.data?.items.filter((c) => !['RESOLVED', 'REJECTED'].includes(c.status)).length ?? 0;
  return (
    <div className="space-y-4">
      <HeroBanner label="Marketing & Development Director" title="Lead Team overview" subtitle={`${me.user.displayName} · last 30 days`} />
      <SyncHealth manageHref="/marketing/hamza/sheets" />
      {perf.isPending ? (
        <LoadingRows rows={3} />
      ) : perf.isError ? (
        <ErrorState error={perf.error} onRetry={() => perf.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link href="/marketing/hamza/members">
            <StatTile label="Active members" value={perf.data.byMember.filter((m) => m.member.active).length} hint={`${perf.data.bySheet.length} sheets`} />
          </Link>
          <Link href="/marketing/hamza/performance">
            <StatTile label="Leads" value={t!.leads} hint={`${t!.contacted} contacted`} />
          </Link>
          <Link href="/marketing/hamza/performance">
            <StatTile label="Bookings" value={t!.bookings} hint={`${t!.checkIns} check-ins · ${pct(t!.conversion.contactedToBookingBp)} conv.`} />
          </Link>
          <Link href="/marketing/hamza/performance">
            <StatTile label="Follow-up on time" value={pct(t!.followUpCompliance.onTimeBp)} hint={`${t!.followUpCompliance.overdue} overdue`} accent={t!.followUpCompliance.overdue ? 'danger' : 'ops'} />
          </Link>
          <Link href="/marketing/hamza/requests">
            <StatTile label="Ad / issue requests" value={openAds} hint="open" accent={openAds ? 'danger' : 'ops'} />
          </Link>
          <Link href="/marketing/hamza/escalations">
            <StatTile label="Complaints & escalations" value={openComplaints} hint="open" accent={openComplaints ? 'danger' : 'ops'} />
          </Link>
          <Link href="/marketing/hamza/sheets">
            <StatTile label="Calls / WhatsApp" value={`${t!.calls} / ${t!.whatsapp}`} />
          </Link>
          <Link href="/marketing/hamza/performance">
            <StatTile label="Cancel / no-show" value={`${t!.cancellations} / ${t!.noShows}`} />
          </Link>
        </div>
      )}
      <PerformanceNotes />
    </div>
  );
}
