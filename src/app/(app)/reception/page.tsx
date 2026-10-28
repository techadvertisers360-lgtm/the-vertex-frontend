'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { clinicDate, formatTime } from '@/lib/time';
import type { DoctorToday, ReceptionAppt, SearchPatient } from '@/lib/types';
import { formatPhone, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, HeroBanner, SectionLabel, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows, QueryState } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';
import { ApptActions } from '@/components/reception/appt-actions';
import { NewPatientDialog } from '@/components/reception/dialogs';
import { ActiveOffers } from '@/components/leadership/marketing';

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const dq = useDebounced(q);
  const res = useQuery({ queryKey: ['tracker', 'search', dq], queryFn: () => get<{ items: SearchPatient[] }>('/reception/search', { q: dq }), enabled: dq.trim().length >= 2 });
  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>Patient search</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" /> New patient
        </Button>
      </CardHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input aria-label="Search by name or phone" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam ya phone (0300-1234567)" />
      </div>
      {dq.trim().length >= 2 && (
        <div className="mt-3">
          {res.isPending ? (
            <LoadingRows rows={2} />
          ) : res.isError ? (
            <ErrorState error={res.error} onRetry={() => res.refetch()} />
          ) : res.data.items.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-canvas px-3 py-2 text-dense">
              <span>Koi patient nahi mila.</span>
              <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
                New patient banayein
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {res.data.items.map((p) => (
                <li key={p.id}>
                  <Link href={`/reception/patients?id=${p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-brand">
                    <span>
                      <span className="font-semibold">{p.name}</span> <span className="text-dense text-muted">· {formatPhone(p.phone)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-dense text-muted">
                      {p.upcoming[0] && <StatusChip status={p.upcoming[0].status} />}
                      {p.previousVisits} previous visit{p.previousVisits === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <NewPatientDialog
        open={creating}
        onOpenChange={setCreating}
        initialPhone={/\d{4,}/.test(q) ? q : ''}
        onCreated={(p) => router.push(`/reception/patients?id=${p.id}`)}
        onUseExisting={(id) => router.push(`/reception/patients?id=${id}`)}
      />
    </Card>
  );
}

function DoctorsToday() {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['tracker', 'doctors-today'], queryFn: () => get<{ items: DoctorToday[] }>('/reception/doctors-today'), refetchInterval: pollInterval });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Doctors today</CardTitle>
      </CardHeader>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi Doctor active nahi">
        {(d) => (
          <ul className="space-y-2">
            {d.items.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3 py-2">
                <div>
                  <p className="text-dense font-semibold text-ink">{doc.displayName}</p>
                  <p className="text-[12px] text-muted">{doc.onLeave ? 'On leave' : doc.windows.length ? doc.windows.map((w) => `${formatTime(w.start)}–${formatTime(w.end)}`).join(', ') : 'Aaj schedule nahi'}</p>
                </div>
                <div className="flex gap-1">
                  {doc.onLeave ? (
                    <Chip tone="danger">Leave</Chip>
                  ) : (
                    <>
                      <Chip tone="warning">{doc.waiting} waiting</Chip>
                      {doc.withDoctor > 0 && <Chip tone="brand">In consult</Chip>}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

export default function ReceptionDashboard() {
  const router = useRouter();
  const { pollInterval } = useRealtime();
  const [date, setDate] = React.useState(clinicDate());
  const [status, setStatus] = React.useState('');
  const [doctorId, setDoctorId] = React.useState('');
  const [q, setQ] = React.useState('');
  const dq = useDebounced(q);
  const doctors = useQuery({ queryKey: ['tracker', 'doctors-today'], queryFn: () => get<{ items: DoctorToday[] }>('/reception/doctors-today') });
  const list = useQuery({
    queryKey: ['tracker', 'appointments', date, status, doctorId, dq],
    queryFn: () => get<{ items: ReceptionAppt[] }>('/reception/appointments', { date, status, doctorId, q: dq }),
    refetchInterval: pollInterval,
  });
  const tracker = useQuery({ queryKey: ['tracker', 'board'], queryFn: () => get<{ counts: Record<string, number> }>('/reception/tracker'), refetchInterval: pollInterval });
  const c = tracker.data?.counts ?? {};
  const n = (...s: string[]) => s.reduce((t, k) => t + (c[k] ?? 0), 0);

  return (
    <div className="space-y-5">
      <HeroBanner label="Reception" title="Front desk" subtitle="Aaj ki appointments, check-in, active patients aur billing." />
      <ActiveOffers compact />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Booked today" value={n('CONFIRMED', 'CHECKED_IN', 'WAITING', 'WITH_DOCTOR', 'RECEPTION', 'PROCEDURE', 'DONE')} />
        <Link href="/reception/tracker">
          <StatTile label="Waiting" value={n('CHECKED_IN', 'WAITING')} hint="checked-in" accent={n('CHECKED_IN', 'WAITING') ? 'danger' : 'ops'} />
        </Link>
        <StatTile label="With Doctor" value={n('WITH_DOCTOR')} />
        <Link href="/reception/billing">
          <StatTile label="At reception" value={n('RECEPTION', 'PROCEDURE')} hint="billing / procedure" />
        </Link>
        <Link href="/reception/done">
          <StatTile label="Done" value={n('DONE')} />
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SearchBox />
          <section>
            <SectionLabel className="mb-2">Appointments</SectionLabel>
            <FilterBar>
              <Field label="Date" htmlFor="d-date">
                <Input id="d-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Doctor" htmlFor="d-doc">
                <Select id="d-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">All doctors</option>
                  {doctors.data?.items.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="d-st">
                <Select id="d-st" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All</option>
                  {['CONFIRMED', 'CHECKED_IN', 'WAITING', 'WITH_DOCTOR', 'RECEPTION', 'PROCEDURE', 'DONE', 'CANCELLED'].map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Patient / phone" htmlFor="d-q">
                <Input id="d-q" value={q} onChange={(e) => setQ(e.target.value)} />
              </Field>
            </FilterBar>
            <QueryState query={list} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi record nahi" emptyHint="Filters badlein ya naya patient book karein.">
              {(d) =>
                d.items.length ? (
                  <DataTable
                    rows={d.items}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => router.push(`/reception/patients?id=${r.patient.id}`)}
                    columns={[
                      { key: 'time', header: 'Time', cell: (r) => formatTime(r.startAt) },
                      { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
                      { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.patient.phone), hideSm: true },
                      { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
                      { key: 'type', header: 'Type / room', cell: (r) => `${titleCase(r.type)}${r.roomCode ? ` · ${r.roomCode}` : ''}`, hideSm: true },
                      { key: 'status', header: 'Status', cell: (r) => <StatusChip status={r.status} /> },
                      { key: 'actions', header: '', cell: (r) => <ApptActions appt={r} /> },
                    ]}
                  />
                ) : (
                  <EmptyState />
                )
              }
            </QueryState>
          </section>
        </div>
        <DoctorsToday />
      </div>
    </div>
  );
}
