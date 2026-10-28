'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarX2 } from 'lucide-react';
import { ApiError, get, post, put } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, formatDay, formatTime } from '@/lib/time';
import type { DoctorToday } from '@/lib/types';
import type { ApptCard, LeaveImpact, RescheduleReq } from '@/lib/manager-types';
import { formatPhone, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { QueryState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';
import { ReasonDialog } from '@/components/reception/dialogs';
import { ManagerRescheduleDialog } from '@/components/manager/reschedule-dialog';
import { RoomsAdmin } from '@/components/manager/rooms-admin';
import { DoctorsAdmin } from '@/components/manager/doctors-admin';

type Tab = 'hours' | 'staff' | 'rooms' | 'doctors' | 'leave' | 'requests';
const hm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

function AffectedRow({ a, onReschedule, onCancel }: { a: ApptCard; onReschedule: () => void; onCancel: () => void }) {
  const preArrival = a.status === 'CONFIRMED' || a.status === 'DRAFT';
  return (
    <li className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0 text-dense">
        <span className="font-semibold text-ink">{a.patient.name}</span> · {formatPhone(a.patient.phone)} · {formatTime(a.startAt)} · {titleCase(a.type)}
        {a.plannedProcedure && ` · ${a.plannedProcedure.procedureName} (session ${a.plannedProcedure.sessionNumber})`}
        {a.roomCode && ` · ${a.roomCode}`}
        {a.leadMemberName && <span className="text-muted"> · Lead: {a.leadMemberName}</span>}
      </span>
      <span className="flex shrink-0 gap-2">
        <StatusChip status={a.status} />
        {preArrival && (
          <Button size="sm" onClick={onReschedule}>
            Reschedule
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </span>
    </li>
  );
}

function LeaveTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['manager', 'leave-impacts'], queryFn: () => get<{ items: LeaveImpact[] }>('/manager/leave-impacts') });
  const [res, setRes] = React.useState<ApptCard | null>(null);
  const [cancel, setCancel] = React.useState<ApptCard | null>(null);
  const resolve = useMutation({
    mutationFn: (id: string) => post(`/manager/leave-impacts/${id}/resolve`),
    onSuccess: () => {
      toast.success('Leave impact resolve — highlight band');
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Resolve nahi hua'),
  });
  return (
    <>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi open leave impact nahi" emptyHint="Doctor leave/absence mein booked patients yahan aate hain jab tak reschedule ya cancel na hon.">
        {(d) => (
          <div className="space-y-3">
            {d.items.map((l) => (
              <Card key={l.id} accent={l.affected.length ? 'danger' : 'ops'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <CalendarX2 className="size-4 text-danger" /> {l.doctorName} — {l.kind === 'LEAVE' ? 'Leave' : 'Absent'} {formatDay(`${l.date}T12:00:00Z`)}
                      {l.startMinute !== null && ` ${hm(l.startMinute)}–${hm(l.endMinute)}`}
                    </CardTitle>
                    {l.reason && <p className="text-dense text-muted">{l.reason}</p>}
                  </div>
                  <Chip tone={l.affected.length ? 'danger' : 'success'}>{l.affected.length ? `${l.affected.length} pending` : 'All handled'}</Chip>
                </CardHeader>
                {l.affected.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {l.affected.map((a) => (
                      <AffectedRow key={a.id} a={a} onReschedule={() => setRes(a)} onCancel={() => setCancel(a)} />
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-dense text-muted">Sab patients handle ho gaye. Ab impact close karein.</p>
                    <Button onClick={() => resolve.mutate(l.id)} loading={resolve.isPending && resolve.variables === l.id}>
                      Mark resolved
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {res && <ManagerRescheduleDialog appt={res} defaultReason="Doctor leave" onClose={() => setRes(null)} />}
      {cancel && (
        <ReasonDialog
          title="Appointment cancel"
          description={`${cancel.patient.name} · ${formatDateTime(cancel.startAt)}`}
          label="Wajah (patient ko bataya gaya)"
          submitLabel="Cancel appointment"
          danger
          onSubmit={async ({ reason }) => {
            await post(`/manager/appointments/${cancel.id}/cancel`, { reason });
            toast.success('Appointment cancel — patient, Doctor, Reception aur Lead ko update gaya');
            void qc.invalidateQueries({ queryKey: ['manager'] });
          }}
          onClose={() => setCancel(null)}
        />
      )}
    </>
  );
}

function RequestsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['manager', 'reschedule-requests'], queryFn: () => get<{ items: RescheduleReq[] }>('/manager/reschedule-requests') });
  const [res, setRes] = React.useState<RescheduleReq | null>(null);
  const [reject, setReject] = React.useState<RescheduleReq | null>(null);
  return (
    <>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi reschedule request nahi">
        {(d) => (
          <div className="space-y-3">
            {d.items.map((r) => (
              <Card key={r.id} accent="ops" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-dense">
                  <p className="text-card-title text-ink">{r.appointment?.patient.name}</p>
                  <p className="text-muted">
                    {r.appointment && `${formatDateTime(r.appointment.startAt)} · ${r.appointment.doctorName} · ${titleCase(r.appointment.type)}`}
                    {r.requestedStartAt && ` → requested ${formatDateTime(r.requestedStartAt)}`}
                  </p>
                  <p className="text-ink">
                    {r.reason} <span className="text-muted">— {r.requestedBy?.displayName}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button disabled={!r.appointment} onClick={() => setRes(r)}>
                    Reschedule
                  </Button>
                  <Button variant="secondary" onClick={() => setReject(r)}>
                    Reject
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {res?.appointment && <ManagerRescheduleDialog appt={res.appointment} requestId={res.id} defaultReason={res.reason} onClose={() => setRes(null)} />}
      {reject && (
        <ReasonDialog
          title="Reschedule request reject"
          label="Wajah"
          submitLabel="Reject"
          danger
          onSubmit={async ({ reason }) => {
            await post(`/manager/reschedule-requests/${reject.id}/reject`, { reason });
            toast.success('Request reject — requester ko bata diya');
            void qc.invalidateQueries({ queryKey: ['manager'] });
          }}
          onClose={() => setReject(null)}
        />
      )}
    </>
  );
}

function DoctorsTab() {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['tracker', 'doctors-today'], queryFn: () => get<{ items: DoctorToday[] }>('/manager/doctors-today'), refetchInterval: pollInterval });
  return (
    <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi Doctor nahi">
      {(d) => (
        <DataTable
          rows={d.items}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Doctor', cell: (r) => <span className="font-semibold">{r.displayName}</span> },
            { key: 'hours', header: 'Hours today', cell: (r) => (r.onLeave ? <Chip tone="danger">On leave</Chip> : r.windows.length ? r.windows.map((w) => `${formatTime(w.start)}–${formatTime(w.end)}`).join(', ') : <Chip>Off</Chip>) },
            { key: 'booked', header: 'Booked', cell: (r) => r.booked },
            { key: 'waiting', header: 'Waiting', cell: (r) => r.waiting },
            { key: 'with', header: 'With Doctor', cell: (r) => r.withDoctor, hideSm: true },
          ]}
        />
      )}
    </QueryState>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface HoursWindow {
  weekday: number;
  start: string;
  end: string;
}

interface DoctorHours {
  id: string;
  displayName: string;
  specialty: string | null;
  roomId: string | null;
  roomCode: string | null;
  current: HoursWindow[];
  upcoming: { from: string; days: HoursWindow[] } | null;
}

interface HoursData {
  today: string;
  rooms: { id: string; code: string; name: string; kind: 'CONSULT' | 'CONSULT_PROCEDURE' }[];
  doctors: DoctorHours[];
}

const summary = (w: HoursWindow[]) =>
  w.length
    ? WEEKDAYS.map((d, i) => {
        const day = w.filter((x) => x.weekday === i + 1);
        return day.length ? `${d} ${day.map((x) => `${x.start}–${x.end}`).join(', ')}` : null;
      })
        .filter(Boolean)
        .join(' · ')
    : null;

/** Edit one Doctor's weekly hours (D-049): per day on/off with up to two shifts, from a chosen date. */
function HoursDialog({ doctor, today, onClose }: { doctor: DoctorHours; today: string; onClose: () => void }) {
  const qc = useQueryClient();
  const base = doctor.upcoming?.days ?? doctor.current;
  const [from, setFrom] = React.useState(today);
  const [days, setDays] = React.useState(() =>
    WEEKDAYS.map((_, i) => {
      const w = base.filter((x) => x.weekday === i + 1);
      return { on: w.length > 0, shifts: w.length ? w.map((x) => ({ start: x.start, end: x.end })) : [{ start: '11:00', end: '19:00' }] };
    }),
  );
  const [outside, setOutside] = React.useState<{ id: string; startAt: string; patientName: string }[] | null>(null);
  const body = { effectiveFrom: from, days: days.flatMap((d, i) => (d.on ? d.shifts.map((s) => ({ weekday: i + 1, start: s.start, end: s.end })) : [])) };
  const m = useMutation({
    mutationFn: () => put<{ outsideHours: { id: string; startAt: string; patientName: string }[] }>(`/manager/doctor-hours/${doctor.id}`, body),
    onSuccess: (r) => {
      toast.success(`${doctor.displayName} ke hours save — bookings ab inhi hours mein hongi`);
      void qc.invalidateQueries({ queryKey: ['manager', 'doctor-hours'] });
      void qc.invalidateQueries({ queryKey: ['tracker', 'doctors-today'] });
      if (r.outsideHours.length) setOutside(r.outsideHours);
      else onClose();
    },
  });
  const upd = (i: number, fn: (d: (typeof days)[number]) => (typeof days)[number]) => setDays((xs) => xs.map((d, j) => (j === i ? fn(d) : d)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Weekly hours — ${doctor.displayName}`} description="Jin dino Doctor aate hain, un ka waqt. Leave / absent / alternate hours inhi par lagte hain.">
        {outside ? (
          <div className="space-y-3">
            <Notice tone="warning">Yeh {outside.length} booking(s) naye hours se bahar hain — Patient Tracker se reschedule karein:</Notice>
            <ul className="space-y-1 text-dense">
              {outside.map((o) => (
                <li key={o.id}>
                  {formatDateTime(o.startAt)} · {o.patientName}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={onClose}>Theek hai</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <Field label="Kis tareekh se" required htmlFor="hrs-from">
              <Input id="hrs-from" type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <div className="space-y-2">
              {days.map((d, i) => (
                <div key={WEEKDAYS[i]} className="flex flex-wrap items-center gap-2 rounded-control border border-line px-2 py-1.5">
                  <label className="flex w-20 items-center gap-2 text-dense font-semibold text-ink">
                    <input type="checkbox" checked={d.on} onChange={(e) => upd(i, (x) => ({ ...x, on: e.target.checked }))} />
                    {WEEKDAYS[i]}
                  </label>
                  {d.on ? (
                    <>
                      {d.shifts.map((s, k) => (
                        <span key={k} className="flex items-center gap-1">
                          <Input aria-label={`${WEEKDAYS[i]} start`} type="time" className="h-8 w-[104px]" value={s.start} onChange={(e) => upd(i, (x) => ({ ...x, shifts: x.shifts.map((y, z) => (z === k ? { ...y, start: e.target.value } : y)) }))} />
                          –
                          <Input aria-label={`${WEEKDAYS[i]} end`} type="time" className="h-8 w-[104px]" value={s.end} onChange={(e) => upd(i, (x) => ({ ...x, shifts: x.shifts.map((y, z) => (z === k ? { ...y, end: e.target.value } : y)) }))} />
                        </span>
                      ))}
                      {d.shifts.length < 2 ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => upd(i, (x) => ({ ...x, shifts: [...x.shifts, { start: '17:00', end: '21:00' }] }))}>
                          + Shift
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" onClick={() => upd(i, (x) => ({ ...x, shifts: x.shifts.slice(0, 1) }))}>
                          − Shift
                        </Button>
                      )}
                    </>
                  ) : (
                    <span className="text-dense text-muted">Off</span>
                  )}
                </div>
              ))}
            </div>
            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={m.isPending}>
                Save hours
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Weekly hours and assigned consultation room per Doctor (D-049). */
function HoursTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['manager', 'doctor-hours'], queryFn: () => get<HoursData>('/manager/doctor-hours') });
  const [editing, setEditing] = React.useState<DoctorHours | null>(null);
  const room = useMutation({
    mutationFn: (v: { doctorId: string; roomId: string | null }) => put(`/manager/doctor-hours/${v.doctorId}/room`, { roomId: v.roomId }),
    onSuccess: () => {
      toast.success('Room save — bookings mein yahi room pehle diya jayega');
      void qc.invalidateQueries({ queryKey: ['manager', 'doctor-hours'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Room save nahi hua'),
  });
  return (
    <QueryState query={q} empty={(d) => d.doctors.length === 0} emptyTitle="Koi Doctor nahi">
      {(d) => (
        <div className="space-y-3">
          {d.doctors.some((x) => !x.current.length && !x.upcoming) && <Notice tone="warning">Jin Doctors ke hours set nahi, un ki booking nahi ho sakti — &ldquo;Set hours&rdquo; dabayein.</Notice>}
          <div className="grid gap-3 xl:grid-cols-2">
            {d.doctors.map((doc) => (
              <Card key={doc.id} accent={doc.current.length || doc.upcoming ? 'ops' : 'danger'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{doc.displayName}</CardTitle>
                    {doc.specialty && <p className="text-dense text-muted">{doc.specialty}</p>}
                  </div>
                  <Button size="sm" onClick={() => setEditing(doc)}>
                    {doc.current.length || doc.upcoming ? 'Edit hours' : 'Set hours'}
                  </Button>
                </CardHeader>
                <p className="text-dense text-ink">{summary(doc.current) ?? <span className="text-danger">Hours set nahi — booking band</span>}</p>
                {doc.upcoming && (
                  <p className="mt-1 text-dense text-muted">
                    {formatDay(doc.upcoming.from)} se: {summary(doc.upcoming.days) ?? 'Off'}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Doctor ka room" htmlFor={`room-${doc.id}`} hint="Booking mein yahi room pehle (agar free ho)">
                    <Select id={`room-${doc.id}`} value={doc.roomId ?? ''} onChange={(e) => room.mutate({ doctorId: doc.id, roomId: e.target.value || null })} disabled={room.isPending}>
                      <option value="">Koi bhi free room</option>
                      {d.rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code}
                          {r.name && r.name !== r.code ? ` — ${r.name}` : ''}
                          {r.kind === 'CONSULT_PROCEDURE' ? ' (Consultation + Procedure)' : ''}
                          {d.doctors.some((o) => o.id !== doc.id && o.roomId === r.id) ? ' (doosre Doctor ka)' : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </Card>
            ))}
          </div>
          {editing && <HoursDialog doctor={editing} today={d.today} onClose={() => setEditing(null)} />}
        </div>
      )}
    </QueryState>
  );
}

function ScheduleView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'hours');
  const leave = useQuery({ queryKey: ['manager', 'leave-impacts'], queryFn: () => get<{ items: LeaveImpact[] }>('/manager/leave-impacts') });
  const reqs = useQuery({ queryKey: ['manager', 'reschedule-requests'], queryFn: () => get<{ items: RescheduleReq[] }>('/manager/reschedule-requests') });
  const pendingLeave = leave.data?.items.reduce((s, l) => s + l.affected.length, 0) ?? 0;
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Doctors, timing & rooms" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'hours', label: 'Doctor timing & room' },
          { value: 'staff', label: 'Doctors' },
          { value: 'rooms', label: 'Rooms' },
          { value: 'doctors', label: 'Doctors today' },
          { value: 'leave', label: 'Leave impact', count: pendingLeave },
          { value: 'requests', label: 'Reschedule requests', count: reqs.data?.items.length ?? 0 },
        ]}
      />
      {tab === 'leave' && (
        <>
          <Notice tone="info">Patient aur Doctor se baat kar ke naya slot confirm karein. Impact tab tak open rehta hai jab tak har patient reschedule ya cancel na ho.</Notice>
          <LeaveTab />
        </>
      )}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'doctors' && <DoctorsTab />}
      {tab === 'hours' && <HoursTab />}
      {tab === 'staff' && <DoctorsAdmin />}
      {tab === 'rooms' && <RoomsAdmin />}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <React.Suspense>
      <ScheduleView />
    </React.Suspense>
  );
}

