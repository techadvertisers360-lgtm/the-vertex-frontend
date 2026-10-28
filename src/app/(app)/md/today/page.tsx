'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { clinicDate, formatDay, formatTime } from '@/lib/time';
import type { DoctorToday, ReceptionAppt } from '@/lib/types';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';

/**
 * MD "Aaj" (D-053): the overview's "Patients today" and "Doctors" tiles open here — every appointment of the day with
 * its step, and each Doctor's timing, leave and load, plus leave coming up. Read-only.
 */
type Tab = 'patients' | 'doctors';

interface Leave {
  id: string;
  doctor: string;
  kind: 'LEAVE' | 'ABSENT';
  status: 'APPROVED' | 'PENDING';
  date: string;
  from: string | null;
  to: string | null;
  reason: string | null;
  impactOpen: boolean;
}

const IN_CLINIC = ['CHECKED_IN', 'WAITING', 'WITH_DOCTOR', 'RECEPTION', 'PROCEDURE'];

function Patients() {
  const today = clinicDate();
  const [date, setDate] = React.useState(today);
  const [filter, setFilter] = React.useState<'all' | 'in' | 'done' | 'booked'>('all');
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['md', 'day-appointments', date], queryFn: () => get<{ items: ReceptionAppt[] }>('/reception/appointments', { date }), refetchInterval: date === today ? pollInterval || 60_000 : false });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Patients</CardTitle>
        <Input aria-label="Date" type="date" className="h-8 w-[150px]" value={date} onChange={(e) => setDate(e.target.value || today)} />
      </CardHeader>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi record nahi">
        {(d) => {
          const rows = d.items.filter((a) => (filter === 'all' ? true : filter === 'in' ? IN_CLINIC.includes(a.status) : filter === 'done' ? a.status === 'DONE' : a.status === 'CONFIRMED'));
          return (
            <>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Sab', count: d.items.length },
                  { value: 'in', label: 'Clinic mein', count: d.items.filter((a) => IN_CLINIC.includes(a.status)).length },
                  { value: 'booked', label: 'Abhi nahi aaye', count: d.items.filter((a) => a.status === 'CONFIRMED').length },
                  { value: 'done', label: 'Done', count: d.items.filter((a) => a.status === 'DONE').length },
                ]}
              />
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                columns={[
                  { key: 't', header: 'Time', cell: (r) => formatTime(r.startAt) },
                  { key: 'p', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
                  { key: 'd', header: 'Doctor', cell: (r) => r.doctorName ?? '—' },
                  {
                    key: 's',
                    header: 'Step',
                    cell: (r) => (
                      <span className="flex items-center gap-2">
                        <StatusChip status={r.status} />
                        <span className="hidden text-muted lg:inline">{r.stage.label}</span>
                      </span>
                    ),
                  },
                  { key: 'r', header: 'Room', cell: (r) => r.roomCode ?? '—', hideSm: true },
                  { key: 'a', header: 'Arrived', cell: (r) => (r.checkedInAt ? formatTime(r.checkedInAt) : '—'), hideSm: true },
                ]}
              />
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}

function Doctors() {
  const { pollInterval } = useRealtime();
  const docs = useQuery({ queryKey: ['md', 'doctors-today'], queryFn: () => get<{ items: (DoctorToday & { leave?: { kind: string; startMinute?: number | null; endMinute?: number | null }[] })[] }>('/reception/doctors-today'), refetchInterval: pollInterval || 60_000 });
  const leaves = useQuery({ queryKey: ['md', 'doctor-leaves'], queryFn: () => get<{ items: Leave[] }>('/md/doctor-leaves') });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Doctors aaj</CardTitle>
        </CardHeader>
        <QueryState query={docs} empty={(d) => d.items.length === 0} emptyTitle="Koi Doctor nahi">
          {(d) => (
            <DataTable
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'n', header: 'Doctor', cell: (r) => <span className="font-semibold">{r.displayName}</span> },
                {
                  key: 'h',
                  header: 'Timing aaj',
                  cell: (r) => (r.onLeave ? <Chip tone="danger">Leave</Chip> : r.windows.length ? r.windows.map((w) => `${formatTime(w.start)}–${formatTime(w.end)}`).join(', ') : <Chip>Off</Chip>),
                },
                { key: 'b', header: 'Booked', cell: (r) => r.booked },
                { key: 'w', header: 'Waiting', cell: (r) => r.waiting },
                { key: 'x', header: 'With Doctor', cell: (r) => r.withDoctor, hideSm: true },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Doctor leave (agle 30 din)</CardTitle>
        </CardHeader>
        <QueryState query={leaves} empty={(d) => d.items.length === 0} emptyTitle="Koi leave nahi">
          {(d) => (
            <ul className="divide-y divide-line text-dense">
              {d.items.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-semibold text-ink">{l.doctor}</span> · {formatDay(l.date)}
                    {l.from ? ` · ${l.from}–${l.to}` : ' · poora din'}
                    {l.reason && <span className="block text-[12px] text-muted">{l.reason}</span>}
                  </span>
                  <span className="flex gap-1">
                    <Chip tone={l.kind === 'LEAVE' ? 'warning' : 'danger'}>{l.kind === 'LEAVE' ? 'Leave' : 'Absent'}</Chip>
                    {l.status === 'PENDING' && <Chip>Pending</Chip>}
                    {l.impactOpen && <Chip tone="danger">Patients reschedule baqi</Chip>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
    </div>
  );
}

function View() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>(params.get('tab') === 'doctors' ? 'doctors' : 'patients');
  return (
    <div className="space-y-4">
      <PageHeader label="MD" title="Aaj — patients & doctors" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'patients', label: 'Patients' },
          { value: 'doctors', label: 'Doctors & leave' },
        ]}
      />
      {tab === 'patients' ? <Patients /> : <Doctors />}
    </div>
  );
}

export default function MdTodayPage() {
  return (
    <React.Suspense>
      <View />
    </React.Suspense>
  );
}
