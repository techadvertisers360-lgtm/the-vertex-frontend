'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { relativeFromNow } from '@/lib/time';
import { cn, formatRs } from '@/lib/utils';
import { Card, CardHeader, CardTitle, HeroBanner, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { AttendanceDay, LeadTeamOverview } from '@/components/leadership/overview-extras';

interface MdDashboard {
  date: string;
  cards: {
    patients: { total: number; done: number; inClinic: number };
    doctors: { working: number; onLeave: number };
    staff: { present: number; checkedIn: number; total: number };
    approvals: { total: number };
    complaints: { open: number };
    cash: { todayPaisa: number; receipts: number };
  };
  highlights: { key: string; kind: string; severity: 'danger' | 'warning' | 'info'; title: string; detail: string; href: string; at: string }[];
}

/**
 * MD overview (spec §15): clinic summary + urgent highlights only — stock above the Manager limit, Manager / leadership
 * leave, serious complaints and escalations, Doctor leave impact, escalated ops issues. Routine completions stay in
 * Reports and never notify the MD.
 */
export default function MdHome() {
  const { me } = useSession();
  const { pollInterval, connected } = useRealtime();
  const q = useQuery({ queryKey: ['md', 'dashboard'], queryFn: () => get<MdDashboard>('/md/dashboard'), refetchInterval: pollInterval || 60_000 });
  const d = q.data;
  return (
    <div className="space-y-4">
      <HeroBanner label="MD" title="Clinic overview" subtitle={me.user.displayName} actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      {q.isPending ? (
        <LoadingRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Link href="/md/today?tab=patients">
              <StatTile label="Patients today" value={d!.cards.patients.total} hint={`${d!.cards.patients.inClinic} in clinic · ${d!.cards.patients.done} done`} />
            </Link>
            <Link href="/md/today?tab=doctors">
              <StatTile label="Doctors" value={d!.cards.doctors.working} hint={`${d!.cards.doctors.onLeave} on leave`} accent={d!.cards.doctors.onLeave ? 'danger' : 'ops'} />
            </Link>
            <Link href="/md/reports?tab=staff">
              <StatTile label="Staff present" value={d!.cards.staff.present} hint={`${d!.cards.staff.checkedIn} checked in of ${d!.cards.staff.total}`} />
            </Link>
            <Link href="/md/approvals">
              <StatTile label="Approvals" value={d!.cards.approvals.total} hint="waiting for MD" accent={d!.cards.approvals.total ? 'danger' : 'ops'} />
            </Link>
            <Link href="/md/escalations">
              <StatTile label="Complaints" value={d!.cards.complaints.open} hint="addressed to MD" accent={d!.cards.complaints.open ? 'danger' : 'ops'} />
            </Link>
            <Link href="/md/reports?tab=cash">
              <StatTile label="Cash today" value={formatRs(d!.cards.cash.todayPaisa)} hint={`${d!.cards.cash.receipts} receipts`} />
            </Link>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Urgent</CardTitle>
              <Chip tone={d!.highlights.length ? 'danger' : 'success'}>{d!.highlights.length ? `${d!.highlights.length} open` : 'All clear'}</Chip>
            </CardHeader>
            {d!.highlights.length === 0 ? (
              <EmptyState title="Koi urgent cheez nahi" hint="Rs 20,000 se upar ki demand, Manager leave, serious complaint, Doctor leave impact ya escalated issue yahan aate hain." />
            ) : (
              <ul className="space-y-2">
                {d!.highlights.map((h) => (
                  <li key={h.key}>
                    <Link
                      href={h.href}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-control border border-line border-l-[length:var(--spacing-accent)] bg-surface px-3 py-2 hover:bg-canvas',
                        h.severity === 'danger' ? 'border-l-danger' : h.severity === 'warning' ? 'border-l-warning' : 'border-l-info',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-body font-semibold text-ink">
                          <AlertTriangle className={cn('size-4', h.severity === 'danger' ? 'text-danger' : 'text-warning')} />
                          {h.title}
                        </span>
                        <span className="block truncate text-dense text-muted">
                          {h.detail} · {relativeFromNow(h.at)}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      <AttendanceDay />
      <LeadTeamOverview />
    </div>
  );
}
