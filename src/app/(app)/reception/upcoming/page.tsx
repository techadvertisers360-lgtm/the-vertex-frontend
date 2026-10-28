'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/time';
import type { UpcomingProcedure } from '@/lib/procedure-types';
import { formatPhone } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { MESSAGES, QueryState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';

type Range = '7' | '14' | '30';

/** Future planned procedure sessions (spec §9, §19), created by Doctors' treatment plans. */
export default function UpcomingPage() {
  const [range, setRange] = React.useState<Range>('14');
  const q = useQuery({ queryKey: ['tracker', 'upcoming', range], queryFn: () => get<{ items: UpcomingProcedure[] }>('/reception/upcoming', { days: range }) });
  return (
    <div className="space-y-4">
      <PageHeader label="Reception" title="Upcoming procedures" />
      <Segmented<Range>
        value={range}
        onChange={setRange}
        options={[
          { value: '7', label: 'Next 7 days' },
          { value: '14', label: 'Next 14 days' },
          { value: '30', label: 'Next 30 days' },
        ]}
      />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi upcoming procedure nahi" emptyHint="Doctor treatment plan mein future procedure dates set karega to woh yahan aayengi.">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'Date', cell: (r) => <span className="font-semibold">{formatDay(r.startAt)}, {formatTime(r.startAt)}</span> },
              { key: 'patient', header: 'Patient', cell: (r) => r.patient.name },
              { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.patient.phone), hideSm: true },
              { key: 'proc', header: 'Procedure', cell: (r) => (r.procedure ? `${r.procedure.procedureName} · session ${r.procedure.sessionNumber}` : '—') },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName ?? '—' },
              { key: 'room', header: 'Room', cell: (r) => r.roomCode ?? '—', hideSm: true },
              {
                key: 'reminder',
                header: 'Reminder (2 days before)',
                cell: (r) =>
                  r.reminderStatus || r.doctorReminderStatus ? (
                    <span className="flex flex-wrap gap-1">
                      {r.reminderStatus === 'FAILED' ? <Chip tone="danger">{MESSAGES.messageFailed} — call karein</Chip> : r.reminderStatus && <StatusChip status={r.reminderStatus} />}
                      {r.doctorReminderStatus && <Chip tone="neutral">Doctor: {r.doctorReminderStatus.toLowerCase()}</Chip>}
                    </span>
                  ) : (
                    <Chip>Not sent yet</Chip>
                  ),
                hideSm: true,
              },
              { key: 'stock', header: 'Stock check', cell: (r) => (r.stockCheck ? <Chip tone={r.stockCheck === 'COMPLETED' ? 'success' : 'warning'}>{r.stockCheck === 'COMPLETED' ? 'Checked' : 'Manager pending'}</Chip> : '—'), hideSm: true },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
