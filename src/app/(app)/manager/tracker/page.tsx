'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime, relativeFromNow } from '@/lib/time';
import type { ReceptionAppt } from '@/lib/types';
import { PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';

/** Operational patient tracker for the Manager (spec §3, §14): stage, owner, Doctor, room, last update — live, read-only. */
export default function ManagerTrackerPage() {
  const { pollInterval, connected } = useRealtime();
  const q = useQuery({ queryKey: ['tracker', 'board'], queryFn: () => get<{ items: ReceptionAppt[] }>('/reception/tracker'), refetchInterval: pollInterval });
  return (
    <div>
      <PageHeader label="Manager" title="Patient tracker" actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi active patient nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
              {
                key: 'stage',
                header: 'Current step',
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <StatusChip status={r.status} />
                    <span className="hidden text-muted lg:inline">{r.stage.label}</span>
                  </span>
                ),
              },
              { key: 'owner', header: 'Owner', cell: (r) => r.stage.owner },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
              { key: 'room', header: 'Room', cell: (r) => r.roomCode ?? '—', hideSm: true },
              { key: 'arrived', header: 'Arrived', cell: (r) => (r.checkedInAt ? formatTime(r.checkedInAt) : '—'), hideSm: true },
              { key: 'updated', header: 'Last update', cell: (r) => relativeFromNow(r.lastUpdateAt) },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
