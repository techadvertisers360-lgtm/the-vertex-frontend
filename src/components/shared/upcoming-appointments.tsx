'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { clinicDate, formatDay, formatTime } from '@/lib/time';
import { formatPhone, titleCase } from '@/lib/utils';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { useDoctors } from '@/components/booking/slot-picker';

/**
 * Upcoming appointments (D-081), grouped by day, soonest first. Reception sees every Doctor (filter by Doctor) with
 * phone and who booked; a Doctor sees only their own bookings.
 */
interface Upcoming {
  id: string;
  startAt: string;
  endAt: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  reason: string | null;
  patient: { id: string; name: string; phone?: string; ageYears: number | null; gender: string | null };
  doctorName: string | null;
  procedure: string | null;
  session: number | null;
  roomCode: string | null;
  source?: string;
  bookedBy?: string | null;
  leadMemberName?: string | null;
}

type Range = '1' | '7' | '14' | '30';
type Kind = 'ALL' | 'CONSULTATION' | 'PROCEDURE';

export function UpcomingAppointments({ view }: { view: 'reception' | 'doctor' }) {
  const { pollInterval } = useRealtime();
  const [days, setDays] = React.useState<Range>('7');
  const [kind, setKind] = React.useState<Kind>('ALL');
  const [doctorId, setDoctorId] = React.useState('');
  const doctors = useDoctors();
  const path = view === 'reception' ? '/reception/upcoming-appointments' : '/doctor/upcoming';
  const q = useQuery({
    queryKey: ['upcoming-appointments', view, days, kind, doctorId],
    queryFn: () => get<{ total: number; items: Upcoming[] }>(path, { days, type: kind === 'ALL' ? undefined : kind, doctorId: view === 'reception' ? doctorId || undefined : undefined }),
    refetchInterval: pollInterval,
  });
  const today = clinicDate();
  const groups = React.useMemo(() => {
    const m = new Map<string, Upcoming[]>();
    for (const a of q.data?.items ?? []) {
      const d = clinicDate(new Date(a.startAt));
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return [...m.entries()];
  }, [q.data]);

  return (
    <div className="space-y-3">
      <PageHeader label={view === 'reception' ? 'Reception' : 'Doctor'} title="Upcoming Appointments" />
      <div className="flex flex-wrap items-end gap-3">
        <Segmented<Range>
          value={days}
          onChange={setDays}
          options={[
            { value: '1', label: 'Aaj' },
            { value: '7', label: '7 din' },
            { value: '14', label: '14 din' },
            { value: '30', label: '30 din' },
          ]}
        />
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'Sab' },
            { value: 'CONSULTATION', label: 'Consultation' },
            { value: 'PROCEDURE', label: 'Procedure' },
          ]}
        />
        {view === 'reception' && (
          <Field label="Doctor" htmlFor="up-doc" className="min-w-52">
            <Select id="up-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Sab Doctors</option>
              {doctors.data?.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi upcoming appointment nahi">
        {(d) => (
          <div className="space-y-3">
            <p className="text-dense text-muted">{d.total} appointments</p>
            {groups.map(([day, rows]) => (
              <Card key={day}>
                <CardHeader>
                  <CardTitle>
                    {day === today ? 'Aaj' : formatDay(`${day}T12:00:00Z`)} · {rows.length}
                  </CardTitle>
                </CardHeader>
                <ul className="divide-y divide-line">
                  {rows.map((a) => {
                    const late = new Date(a.startAt).getTime() < Date.now();
                    return (
                      <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">
                            {formatTime(a.startAt)} · {a.patient.name}
                            {a.patient.ageYears ? `, ${a.patient.ageYears} yrs` : ''}
                          </p>
                          <p className="text-dense text-muted">
                            {titleCase(a.type)}
                            {a.procedure ? ` (${a.procedure}${a.session ? ` · session ${a.session}` : ''})` : ''}
                            {view === 'reception' ? ` · ${a.doctorName ?? 'Doctor nahi'}` : ''}
                            {a.roomCode ? ` · Room ${a.roomCode}` : ''}
                          </p>
                          {a.reason && <p className="text-dense text-ink">{a.reason}</p>}
                          {view === 'reception' && (
                            <p className="text-[12px] text-muted">
                              {a.patient.phone ? formatPhone(a.patient.phone) : ''}
                              {a.source ? ` · ${titleCase(a.source)}` : ''}
                              {a.leadMemberName ? ` · Lead: ${a.leadMemberName}` : a.bookedBy ? ` · ${a.bookedBy}` : ''}
                            </p>
                          )}
                        </div>
                        {late ? <Chip tone="warning">Abhi nahi aaya</Chip> : <Chip tone="brand">Confirmed</Chip>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
