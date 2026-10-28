'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime, relativeFromNow } from '@/lib/time';
import type { ReceptionAppt } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { ApptActions } from '@/components/reception/appt-actions';

/** Active patient tracker (spec §3, §9): stage, current owner, room, Doctor and last update — live. */
function TrackerView() {
  const focus = useSearchParams().get('focus') ?? undefined;
  const { pollInterval, connected } = useRealtime();
  const q = useQuery({ queryKey: ['tracker', 'board'], queryFn: () => get<{ items: ReceptionAppt[] }>('/reception/tracker'), refetchInterval: pollInterval });
  return (
    <div>
      <PageHeader label="Reception" title="Active patient tracker" actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi active patient nahi" emptyHint="Check-in ke baad patient yahan nazar aata hai.">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            selectedKey={focus}
            columns={[
              { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
              { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.patient.phone), hideSm: true },
              { key: 'stage', header: 'Current step', cell: (r) => <span className="flex items-center gap-2"><StatusChip status={r.status} /><span className="hidden text-muted lg:inline">{r.stage.label}</span></span> },
              { key: 'owner', header: 'Owner', cell: (r) => r.stage.owner },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
              { key: 'room', header: 'Room', cell: (r) => r.roomCode ?? '—', hideSm: true },
              { key: 'arrived', header: 'Arrived', cell: (r) => (r.checkedInAt ? formatTime(r.checkedInAt) : '—'), hideSm: true },
              { key: 'updated', header: 'Last update', cell: (r) => relativeFromNow(r.lastUpdateAt) },
              { key: 'vitals', header: 'Vitals', cell: (r) => (r.vitalsStatus === 'recorded' ? <Chip tone="success">Recorded</Chip> : r.vitalsStatus === 'skipped' ? <Chip>Skipped</Chip> : <Chip>—</Chip>), hideSm: true },
              { key: 'actions', header: '', cell: (r) => <ApptActions appt={r} compact /> },
            ]}
          />
        )}
      </QueryState>
      <p className="mt-3 text-dense text-muted">Invoice close hone par patient yahan se hat kar &quot;Patient Done&quot; list mein chala jata hai.</p>
    </div>
  );
}

export default function TrackerPage() {
  return (
    <React.Suspense>
      <TrackerView />
    </React.Suspense>
  );
}
