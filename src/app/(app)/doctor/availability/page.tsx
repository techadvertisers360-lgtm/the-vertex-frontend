'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, post } from '@/lib/api';
import { addDays, clinicDate, formatDate, formatDateTime } from '@/lib/time';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

interface Exception {
  id: string;
  kind: 'LEAVE' | 'ABSENT' | 'ALTERNATE_HOURS';
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  status: string;
  decisionReason: string | null;
}
interface Impact {
  count: number;
  items: { id: string; startAt: string; type: string; source: string; patient: { name: string; phone: string } }[];
}

/** Leave / absence / alternate hours with patient impact preview (spec §10–11). */
export default function AvailabilityPage() {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ['doctor', 'availability'],
    queryFn: () => get<{ schedules: { id: string; weekday: number; startMinute: number; endMinute: number }[]; exceptions: Exception[] }>('/doctor/availability'),
  });
  const [kind, setKind] = React.useState<Exception['kind']>('LEAVE');
  const [date, setDate] = React.useState(addDays(clinicDate(), 1));
  const [fullDay, setFullDay] = React.useState(true);
  const [from, setFrom] = React.useState('14:00');
  const [to, setTo] = React.useState('18:00');
  const [reason, setReason] = React.useState('');
  const [impact, setImpact] = React.useState<Impact | null>(null);
  const partial = kind === 'ALTERNATE_HOURS' || !fullDay;
  const body = () => ({ kind, date, reason: reason || undefined, ...(partial ? { startMinute: toMin(from), endMinute: toMin(to) } : {}) });

  const preview = useMutation({ mutationFn: () => post<Impact>('/doctor/availability/preview', body()), onSuccess: setImpact });
  const save = useMutation({
    mutationFn: () => post<{ impact: Impact }>('/doctor/availability', body()),
    onSuccess: (r) => {
      toast.success(kind === 'ALTERNATE_HOURS' ? 'Alternate hours Manager approval ke liye bheje' : `Save — Manager ko notice (${r.impact.count} affected)`);
      setImpact(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['doctor', 'availability'] });
    },
  });
  const err = (preview.error ?? save.error) as unknown;

  return (
    <div className="space-y-4">
      <PageHeader label="Doctor" title="Leave & availability" />
      <Card accent="ops">
        <CardHeader>
          <CardTitle>Leave / absence / alternate hours</CardTitle>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type" htmlFor="av-k">
            <Select
              id="av-k"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Exception['kind']);
                setImpact(null);
              }}
            >
              <option value="LEAVE">Leave</option>
              <option value="ABSENT">Absent</option>
              <option value="ALTERNATE_HOURS">Alternate hours (Manager approval)</option>
            </Select>
          </Field>
          <Field label="Date" htmlFor="av-d">
            <Input id="av-d" type="date" min={clinicDate()} value={date} onChange={(e) => { setDate(e.target.value); setImpact(null); }} />
          </Field>
          {partial && (
            <>
              <Field label="From" htmlFor="av-f">
                <Input id="av-f" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To" htmlFor="av-t">
                <Input id="av-t" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        {kind !== 'ALTERNATE_HOURS' && <Checkbox className="mt-2" label="Poora din" checked={fullDay} onChange={(e) => { setFullDay(e.target.checked); setImpact(null); }} />}
        <Field label="Reason" htmlFor="av-r" className="mt-3">
          <Textarea id="av-r" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {kind === 'ALTERNATE_HOURS' && <Notice tone="info">Alternate hours Manager approval tak booking ke liye open nahi hote.</Notice>}
        {impact && (
          <div className="mt-3">
            <Notice tone={impact.count ? 'warning' : 'success'}>{impact.count ? `${impact.count} patient(s) is waqt booked hain — Manager unhein reschedule karega:` : 'Is waqt koi booking nahi.'}</Notice>
            {impact.count > 0 && (
              <ul className="mt-2 divide-y divide-line text-dense">
                {impact.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      <span className="font-semibold">{i.patient.name}</span> · {formatPhone(i.patient.phone)}
                    </span>
                    <span className="text-muted">
                      {formatDateTime(i.startAt)} · {i.source === 'planned_procedure' ? 'planned procedure' : i.type.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {err ? <div className="mt-3"><Notice>{err instanceof ApiError ? err.message : 'Save nahi hua'}</Notice></div> : null}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {kind !== 'ALTERNATE_HOURS' && (
            <Button variant="secondary" onClick={() => preview.mutate()} loading={preview.isPending}>
              Preview affected patients
            </Button>
          )}
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={kind !== 'ALTERNATE_HOURS' && !impact}>
            {kind === 'ALTERNATE_HOURS' ? 'Send for approval' : 'Confirm'}
          </Button>
        </div>
        {kind !== 'ALTERNATE_HOURS' && !impact && <p className="mt-1 text-right text-[12px] text-muted">Confirm se pehle affected patients dekhein.</p>}
      </Card>

      <QueryState query={data} empty={() => false}>
        {(d) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle className="mb-2">Regular hours</CardTitle>
              {d.schedules.length === 0 ? (
                <p className="text-dense text-muted">Schedule set nahi — Manager se rabta karein.</p>
              ) : (
                <ul className="text-dense">
                  {d.schedules.map((s) => (
                    <li key={s.id} className="flex justify-between border-b border-line py-1 last:border-0">
                      <span>{DAYS[s.weekday]}</span>
                      <span>
                        {hm(s.startMinute)}–{hm(s.endMinute)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div>
              <DataTable
                rows={d.exceptions}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'date', header: 'Date', cell: (r) => formatDate(r.date) },
                  { key: 'kind', header: 'Type', cell: (r) => (r.kind === 'ALTERNATE_HOURS' ? 'Alternate hours' : r.kind === 'LEAVE' ? 'Leave' : 'Absent') },
                  { key: 'time', header: 'Time', cell: (r) => (r.startMinute === null ? 'Full day' : `${hm(r.startMinute)}–${hm(r.endMinute)}`) },
                  { key: 'status', header: 'Status', cell: (r) => (r.kind !== 'ALTERNATE_HOURS' && r.status === 'APPROVED' ? <Chip tone="warning">In effect</Chip> : <StatusChip status={r.status} />) },
                ]}
              />
              {d.exceptions.length === 0 && <p className="mt-2 text-dense text-muted">Koi upcoming leave / alternate hours nahi.</p>}
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
