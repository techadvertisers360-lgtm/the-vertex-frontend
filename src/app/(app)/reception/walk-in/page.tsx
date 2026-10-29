'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, Pill, Stethoscope, UserPlus } from 'lucide-react';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import { formatDateTime, formatTime } from '@/lib/time';
import type { PatientCard, SearchPatient, Suggestion } from '@/lib/types';
import type { PendingProcedure } from '@/lib/procedure-types';
import { cn, formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, SectionLabel } from '@/components/ui/card';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { SearchSelect, useDoctors } from '@/components/booking/slot-picker';
import { NewPatientDialog } from '@/components/reception/dialogs';
import { AssignProcedureDialog } from '@/components/procedures/assign-dialog';

/**
 * Walk-in desk (D-075): a patient (old or new) walks in. Reception picks the patient, then what they want:
 *  - Consultation → sent to the chosen Doctor's queue at the earliest free time today (checked in);
 *  - Procedure → the Doctor does it (same as consultation) or an Assistant does it (assign Assistant + room now);
 *  - Pharmacy → the counter sale with the patient's name and phone filled in.
 * Billing then follows the normal flow: invoice → payment → close, and it shows in the cash closing.
 */
type Want = 'CONSULTATION' | 'PROCEDURE' | 'PHARMACY';
interface ServiceRow {
  id: string;
  name: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  active: boolean;
  defaultPricePaisa: number | null;
}
interface WalkInResult {
  appointment: { id: string; startAt: string; status: string; type: string; doctorId: string | null };
  planItemId: string | null;
}

const WANTS: { value: Want; label: string; hint: string; icon: React.ElementType }[] = [
  { value: 'CONSULTATION', label: 'Consultation', hint: 'Doctor ko dikhana hai', icon: Stethoscope },
  { value: 'PROCEDURE', label: 'Procedure', hint: 'Doctor ya Assistant karega', icon: FlaskConical },
  { value: 'PHARMACY', label: 'Pharmacy product', hint: 'Sirf product lena hai', icon: Pill },
];

function PatientPicker({ onPick }: { onPick: (p: PatientCard) => void }) {
  const [q, setQ] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const res = useQuery({ queryKey: ['tracker', 'search', q], queryFn: () => get<{ items: SearchPatient[] }>('/reception/search', { q }), enabled: q.trim().length >= 2 });
  const pickExisting = async (id: string) => {
    try {
      onPick(await get<PatientCard>(`/reception/patients/${id}`));
    } catch {
      toast.error('Patient load nahi hua — dobara koshish karein');
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Patient</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" aria-hidden /> Naya patient
        </Button>
      </CardHeader>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Purana patient: naam ya phone likhein" aria-label="Patient search" autoFocus />
      {q.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-line rounded-control border border-line">
          {res.isPending ? (
            <li className="px-3 py-2 text-dense text-muted">Dhoond rahe hain…</li>
          ) : !res.data?.items.length ? (
            <li className="px-3 py-2 text-dense text-muted">
              Koi patient nahi mila —{' '}
              <button type="button" className="font-semibold text-brand-medium hover:underline" onClick={() => setCreating(true)}>
                naya patient banayein
              </button>
            </li>
          ) : (
            res.data.items.slice(0, 8).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-dense hover:bg-brand-light">
                  <span className="font-semibold text-ink">{p.name}</span>
                  <span className="text-muted">{formatPhone(p.phone)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {creating && <NewPatientDialog open={creating} onOpenChange={setCreating} initialPhone={/\d{4,}/.test(q) ? q : ''} onCreated={onPick} onUseExisting={(id) => void pickExisting(id)} />}
    </Card>
  );
}

function DoctorField({ value, onChange, label = 'Doctor', hint, optional }: { value: string; onChange: (v: string) => void; label?: string; hint?: string; optional?: boolean }) {
  const doctors = useDoctors();
  return (
    <Field label={label} required={!optional} hint={hint} htmlFor="wi-doctor">
      <Select id="wi-doctor" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional ? 'Koi Doctor nahi' : 'Doctor chunein…'}</option>
        {doctors.data?.items.map((d) => (
          <option key={d.id} value={d.id}>
            {d.displayName}
            {d.doctorProfile?.specialty ? ` — ${d.doctorProfile.specialty}` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function VisitForm({ patient, want, onDone }: { patient: PatientCard; want: 'CONSULTATION' | 'PROCEDURE'; onDone: (r: WalkInResult, assistant: boolean, label: string) => void }) {
  const doctors = useDoctors();
  const services = useQuery({ queryKey: ['reception', 'services'], queryFn: () => get<{ items: ServiceRow[] }>('/reception/services') });
  const procedures = (services.data?.items ?? []).filter((s) => s.active && s.type === 'PROCEDURE');
  const keyFor = React.useRef(idempotencyFor()).current;
  const [doctorId, setDoctorId] = React.useState('');
  const [serviceId, setServiceId] = React.useState('');
  const [by, setBy] = React.useState<'DOCTOR' | 'ASSISTANT'>('ASSISTANT');
  const [price, setPrice] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [nextAvailable, setNextAvailable] = React.useState<Suggestion[] | null>(null);
  const svc = procedures.find((s) => s.id === serviceId);
  const assistant = want === 'PROCEDURE' && by === 'ASSISTANT';
  const pricePaisa = price.trim() === '' ? undefined : rupeesToPaisa(price);

  const m = useMutation({
    mutationFn: (body: object) => post<WalkInResult>('/reception/walk-in', body, keyFor(body)),
    onSuccess: (r) => {
      const doctor = doctors.data?.items.find((d) => d.id === doctorId)?.displayName ?? 'Doctor';
      onDone(r, assistant, assistant ? (svc?.name ?? 'Procedure') : doctor);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'NO_SLOT_TODAY') setNextAvailable((e.details as { nextAvailable: Suggestion[] }).nextAvailable ?? []);
    },
  });
  const valid = (assistant || !!doctorId) && (want === 'CONSULTATION' || !!serviceId) && (!assistant || pricePaisa !== null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setNextAvailable(null);
        m.mutate({
          patientId: patient.id,
          intent: want === 'CONSULTATION' ? 'CONSULTATION' : assistant ? 'PROCEDURE_ASSISTANT' : 'PROCEDURE_DOCTOR',
          doctorId: doctorId || undefined,
          serviceId: want === 'PROCEDURE' ? serviceId : undefined,
          pricePaisa: assistant ? (pricePaisa ?? undefined) : undefined,
          reason: reason.trim() || undefined,
        });
      }}
    >
      {want === 'PROCEDURE' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Procedure" required htmlFor="wi-svc" hint="Naam likh kar search karein">
              <SearchSelect
                id="wi-svc"
                value={serviceId}
                options={procedures}
                emptyLabel="Procedure chunein…"
                onChange={(v) => {
                  setServiceId(v);
                  setPrice(paisaToRupeesInput(procedures.find((s) => s.id === v)?.defaultPricePaisa ?? null));
                }}
              />
            </Field>
            <Field label="Kaun karega?" required htmlFor="wi-by">
              <div id="wi-by" className="grid grid-cols-2 gap-2">
                {(['ASSISTANT', 'DOCTOR'] as const).map((k) => (
                  <Button key={k} type="button" variant={by === k ? 'primary' : 'secondary'} onClick={() => setBy(k)}>
                    {k === 'ASSISTANT' ? 'Assistant' : 'Doctor'}
                  </Button>
                ))}
              </div>
            </Field>
          </div>
          {assistant && (
            <Field label="Amount (Rs)" required htmlFor="wi-price" hint={svc?.defaultPricePaisa ? 'Service ki price — zaroorat ho to badlein' : 'Is procedure ki price set nahi — amount likhein'}>
              <Input id="wi-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          )}
        </>
      )}
      <DoctorField
        value={doctorId}
        onChange={setDoctorId}
        optional={assistant}
        label={assistant ? 'Doctor (optional)' : 'Doctor'}
        hint={assistant ? 'Chahein to Doctor add karein, warna khaali chhor dein — patient Doctor ki queue mein nahi jayega, Assistant seedha karega' : 'Doctor ke aaj ke sab se pehle khaali waqt par queue mein jayega'}
      />
      <Field label="Note" htmlFor="wi-reason">
        <Textarea id="wi-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
      </Field>
      {nextAvailable && (
        <Notice tone="warning">
          Doctor ke paas aaj koi khaali waqt nahi.
          {nextAvailable.length > 0 && ` Agla khaali waqt: ${nextAvailable.map((s) => formatDateTime(s.start)).join(', ')} — Patients se appointment book karein ya doosra Doctor chunein.`}
        </Notice>
      )}
      {m.error && !(m.error instanceof ApiError && m.error.code === 'NO_SLOT_TODAY') && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" disabled={!valid} loading={m.isPending}>
          {assistant ? 'Save — Assistant assign karein' : 'Doctor ko bhejein'}
        </Button>
      </div>
    </form>
  );
}

export default function WalkInPage() {
  const qc = useQueryClient();
  const [patient, setPatient] = React.useState<PatientCard | null>(null);
  const [want, setWant] = React.useState<Want | null>(null);
  const [done, setDone] = React.useState<{ r: WalkInResult; assistant: boolean; label: string } | null>(null);
  const [assign, setAssign] = React.useState<PendingProcedure | null>(null);
  const [round, setRound] = React.useState(0);
  const reset = () => {
    setPatient(null);
    setWant(null);
    setDone(null);
    setRound((n) => n + 1);
  };

  return (
    <div className="space-y-4">
      <PageHeader label="Reception" title="Walk-in / Create Invoice" />
      {!patient ? (
        <PatientPicker key={round} onPick={setPatient} />
      ) : (
        <Card accent="ops">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <SectionLabel>Patient</SectionLabel>
              <p className="text-card-title text-ink">{patient.name}</p>
              <p className="text-dense text-muted">{formatPhone(patient.phone)}</p>
            </div>
            {!done && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Patient badlein
              </Button>
            )}
          </div>
        </Card>
      )}

      {patient && !done && (
        <Card>
          <CardHeader>
            <CardTitle>2. Patient kya chahta hai?</CardTitle>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {WANTS.map((w) => (
              <button
                key={w.value}
                type="button"
                aria-pressed={want === w.value}
                onClick={() => setWant(w.value)}
                className={cn('flex items-center gap-3 rounded-card border bg-surface p-4 text-left transition-colors', want === w.value ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand-medium')}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-light text-brand">
                  <w.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold text-ink">{w.label}</span>
                  <span className="text-dense text-muted">{w.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {want === 'PHARMACY' ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <p className="text-dense text-muted">Counter Sale khulegi — patient ka naam aur phone pehle se bhara hoga. Products chunein, amount aur payment daal kar Save karein; invoice close ho kar cash closing mein aa jati hai.</p>
              <Button asChild>
                <Link href={`/reception/counter-sale?name=${encodeURIComponent(patient.name)}&phone=${encodeURIComponent(patient.phone)}`}>
                  <Pill className="size-4" aria-hidden /> Pharmacy Counter Sale kholen
                </Link>
              </Button>
            </div>
          ) : want ? (
            <div className="mt-4 border-t border-line pt-4">
              <VisitForm
                key={want}
                patient={patient}
                want={want}
                onDone={(r, assistant, label) => {
                  setDone({ r, assistant, label });
                  void qc.invalidateQueries({ queryKey: ['tracker'] });
                  if (assistant && r.planItemId) {
                    setAssign({
                      kind: 'same_day',
                      planItemId: r.planItemId,
                      appointmentId: r.appointment.id,
                      patient: { id: patient.id, name: patient.name },
                      doctorId: r.appointment.doctorId,
                      doctorName: null,
                      procedureName: label,
                      sessionNumber: 1,
                      bookedRoomId: null,
                      advanceRequiredPaisa: 0,
                      paidPaisa: 0,
                      paymentOk: true,
                    });
                  }
                }}
              />
            </div>
          ) : null}
        </Card>
      )}

      {done && (
        <Card accent="ops">
          <CardHeader>
            <CardTitle>Ho gaya</CardTitle>
          </CardHeader>
          <div className="space-y-3 text-dense">
            {done.assistant ? (
              <p className="text-ink">
                {done.label}: patient Reception par hai. Assistant + room assign karein — Assistant ka kaam khatam hone par patient wapas Reception aata hai, phir Billing se invoice, payment aur close.
              </p>
            ) : (
              <p className="text-ink">
                {done.label} ki queue mein bhej diya (check-in ho gaya) — waqt {formatTime(done.r.appointment.startAt)}. Doctor ke Reception bhejne ke baad Billing se invoice, payment aur close.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {done.assistant && (
                <Button variant="secondary" asChild>
                  <Link href="/reception/procedures">Procedures</Link>
                </Button>
              )}
              <Button variant="secondary" asChild>
                <Link href="/reception/billing">Billing</Link>
              </Button>
              <Button onClick={reset}>Naya walk-in</Button>
            </div>
          </div>
        </Card>
      )}
      {assign && <AssignProcedureDialog item={assign} onClose={() => setAssign(null)} />}
    </div>
  );
}
