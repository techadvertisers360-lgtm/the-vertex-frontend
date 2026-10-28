'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/links';
import { useRealtime } from '@/lib/realtime';
import { clinicDate, formatTime } from '@/lib/time';
import type { Role } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { LeadershipPerformance } from './performance';

/** MD / Manager overview extras (D-050): the day's attendance and the Lead team's numbers. */

interface AttendanceRow {
  user: { id: string; displayName: string; role: Role; memberCode: string | null };
  status: 'IN' | 'OUT' | 'NOT_IN' | 'OFF';
  checkInAt: string | null;
  checkOutAt: string | null;
}

const STATUS: Record<AttendanceRow['status'], { label: string; tone: 'success' | 'neutral' | 'warning' | 'info' }> = {
  IN: { label: 'On duty', tone: 'success' },
  OUT: { label: 'Checked out', tone: 'neutral' },
  NOT_IN: { label: 'Nahi aaye', tone: 'warning' },
  OFF: { label: 'Check-in off', tone: 'info' },
};

/** Who checked in / out and at what time, for any day. */
export function AttendanceDay() {
  const today = clinicDate();
  const [date, setDate] = React.useState(today);
  const { pollInterval } = useRealtime();
  const q = useQuery({
    queryKey: ['attendance-day', date],
    queryFn: () => get<{ date: string; counts: { in: number; out: number; notIn: number; off: number }; items: AttendanceRow[] }>('/md/attendance', { date }),
    refetchInterval: date === today ? pollInterval || 60_000 : false,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
        <Input aria-label="Date" type="date" className="h-8 w-[150px]" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
      </CardHeader>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi staff nahi">
        {(d) => (
          <div className="space-y-2">
            <p className="flex flex-wrap gap-2 text-dense">
              <Chip tone="success">{d.counts.in} on duty</Chip>
              <Chip>{d.counts.out} checked out</Chip>
              <Chip tone={d.counts.notIn ? 'warning' : 'neutral'}>{d.counts.notIn} nahi aaye</Chip>
              {d.counts.off > 0 && <Chip tone="info">{d.counts.off} check-in off</Chip>}
            </p>
            <DataTable
              rows={d.items}
              rowKey={(r) => r.user.id}
              columns={[
                {
                  key: 'n',
                  header: 'Staff',
                  cell: (r) => (
                    <span>
                      <span className="font-semibold text-ink">{r.user.displayName}</span>
                      <span className="block text-[12px] text-muted">{ROLE_LABEL[r.user.role] ?? r.user.role}</span>
                    </span>
                  ),
                },
                { key: 's', header: 'Status', cell: (r) => <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip> },
                { key: 'in', header: 'Check-in', cell: (r) => (r.checkInAt ? formatTime(r.checkInAt) : '—') },
                { key: 'out', header: 'Check-out', cell: (r) => (r.checkOutAt ? formatTime(r.checkOutAt) : '—') },
              ]}
            />
          </div>
        )}
      </QueryState>
    </Card>
  );
}

/** The Lead team's numbers (totals, by member, by campaign); click a member for that person alone. */
export function LeadTeamOverview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead team</CardTitle>
        <span className="text-dense text-muted">Member par click karein — sirf us ka data</span>
      </CardHeader>
      <LeadershipPerformance />
    </Card>
  );
}
