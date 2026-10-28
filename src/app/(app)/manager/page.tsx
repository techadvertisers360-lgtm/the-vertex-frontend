'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { relativeFromNow } from '@/lib/time';
import type { Dashboard, Highlight } from '@/lib/manager-types';
import { cn, formatRs } from '@/lib/utils';
import { Card, CardHeader, CardTitle, HeroBanner, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { ActiveOffers } from '@/components/leadership/marketing';
import { AttendanceDay, LeadTeamOverview } from '@/components/leadership/overview-extras';

const SEV: Record<Highlight['severity'], { tone: 'danger' | 'warning' | 'info'; border: string }> = {
  danger: { tone: 'danger', border: 'border-l-danger' },
  warning: { tone: 'warning', border: 'border-l-warning' },
  info: { tone: 'info', border: 'border-l-info' },
};

/**
 * Manager dashboard (spec §14): summary cards from source records and highlights that remain until resolved.
 * Each card / highlight opens the module that resolves it; the dashboard itself stays uncluttered.
 */
export default function ManagerDashboard() {
  const { me } = useSession();
  const { pollInterval, connected } = useRealtime();
  const q = useQuery({ queryKey: ['manager', 'dashboard'], queryFn: () => get<Dashboard>('/manager/dashboard'), refetchInterval: pollInterval || 60_000 });
  const d = q.data;
  const s = (st: string) => d?.cards.patients.byStatus[st] ?? 0;

  return (
    <div className="space-y-4">
      <HeroBanner label="Manager" title="Clinic today" subtitle={me.user.displayName} actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      <ActiveOffers compact />
      {q.isPending ? (
        <LoadingRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Link href="/manager/tracker">
              <StatTile label="Patients today" value={d!.cards.patients.total} hint={`${s('WAITING') + s('CHECKED_IN')} waiting · ${s('WITH_DOCTOR')} with Doctor · ${s('DONE')} done`} />
            </Link>
            <Link href="/manager/schedule">
              <StatTile label="Doctors" value={d!.cards.doctors.working} hint={`${d!.cards.doctors.onLeave} on leave · ${d!.cards.doctors.waiting} waiting`} />
            </Link>
            <Link href="/manager/staff">
              <StatTile label="Staff present" value={d!.cards.staff.present} hint={`Lead team ${d!.cards.staff.leadPresent} · reviewed ${d!.cards.staff.reviewed}/${d!.cards.staff.checkedIn}`} />
            </Link>
            <Link href="/manager/rooms">
              <StatTile label="Pending verification" value={d!.cards.verification.pending} hint={`${d!.cards.verification.withIssue} with issue`} accent={d!.cards.verification.withIssue ? 'danger' : 'ops'} />
            </Link>
            <Link href="/manager/staff?tab=rooms">
              <StatTile label="Rooms" value={d!.cards.rooms.assigned} hint={`assigned · ${d!.cards.rooms.procedureLive} procedure live`} />
            </Link>
            <Link href="/manager/requests">
              <StatTile label="Complaints / leave" value={`${d!.cards.requests.complaints} / ${d!.cards.requests.leave}`} hint="open" accent={d!.cards.requests.complaints ? 'danger' : 'ops'} />
            </Link>
            <Link href="/manager/stock">
              <StatTile label="Stock" value={d!.cards.stock.low} hint={`low · ${d!.cards.stock.demandsPending} demands pending`} accent={d!.cards.stock.low ? 'danger' : 'ops'} />
            </Link>
            <Link href="/manager/cash">
              <StatTile label="Cash today" value={formatRs(d!.cards.cash.totalPaisa)} hint={Object.entries(d!.cards.cash.byMethod).map(([k, v]) => `${k.toLowerCase().replace('_', ' ')} ${formatRs(v)}`).join(' · ') || 'no payments yet'} />
            </Link>
            <Link href="/manager/followups">
              <StatTile label="Follow-ups" value={d!.cards.followups.due} hint={`due · ${d!.cards.followups.tomorrow} tomorrow`} accent={d!.cards.followups.due ? 'danger' : 'ops'} />
            </Link>
            <Link href="/manager/approvals">
              <StatTile label="Approvals" value={d!.cards.approvals.total} hint="pending" accent={d!.cards.approvals.total ? 'danger' : 'ops'} />
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Highlights</CardTitle>
              <Chip tone={d!.highlights.length ? 'warning' : 'success'}>{d!.highlights.length ? `${d!.highlights.length} open` : 'All clear'}</Chip>
            </CardHeader>
            {d!.highlights.length === 0 ? (
              <EmptyState title="Koi open highlight nahi" hint="Leave impact, room issue, complaint, overdue report aur pending approval yahan tab tak rehte hain jab tak resolve na hon." />
            ) : (
              <ul className="space-y-2">
                {d!.highlights.map((h) => (
                  <li key={h.key}>
                    <Link href={h.href} className={cn('flex items-center justify-between gap-3 rounded-control border border-line border-l-[length:var(--spacing-accent)] bg-surface px-3 py-2 hover:bg-canvas', SEV[h.severity].border)}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-body font-semibold text-ink">
                          {h.severity === 'info' ? <Info className="size-4 text-info" /> : <AlertTriangle className={cn('size-4', h.severity === 'danger' ? 'text-danger' : 'text-warning')} />}
                          {h.title}
                        </span>
                        <span className="block truncate text-dense text-muted">
                          {h.detail}
                          {h.kind !== 'approval' && ` · ${relativeFromNow(h.at)}`}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {d!.cards.stock.lowItems.length > 0 && <p className="text-dense text-muted">Low stock: {d!.cards.stock.lowItems.join(', ')}</p>}
        </>
      )}
      <AttendanceDay />
      <LeadTeamOverview />
    </div>
  );
}
