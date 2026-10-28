'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, idempotencyFor, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { PatientCard, ReceptionAppt, Suggestion } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { DoctorServiceFields, SlotPicker, SuggestionButtons, type SlotValue } from '@/components/booking/slot-picker';

const invalidateTracker = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['tracker'] });

function Footer({ onCancel, submitLabel, pending, disabled, danger }: { onCancel: () => void; submitLabel: string; pending?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={pending} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

// ───────────── New patient (duplicate warning + confirmation, D-010) ─────────────

interface Existing {
  id: string;
  name: string;
  ageYears: number | null;
}

export function NewPatientDialog({ open, onOpenChange, onCreated, onUseExisting, initialPhone = '' }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (p: PatientCard) => void; onUseExisting?: (id: string) => void; initialPhone?: string }) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState(initialPhone);
  const [age, setAge] = React.useState('');
  const [gender, setGender] = React.useState('');
  const [whatsapp, setWhatsapp] = React.useState(true);
  const [contact, setContact] = React.useState(true);
  const [dups, setDups] = React.useState<Existing[] | null>(null);
  const [shared, setShared] = React.useState('');
  const m = useMutation({
    mutationFn: (confirm: boolean) =>
      post<PatientCard>('/reception/patients', {
        name: name.trim(),
        phone,
        ageYears: age ? Number(age) : undefined,
        gender: gender || undefined,
        whatsappConsent: whatsapp,
        contactConsent: contact,
        confirmSharedPhone: confirm ? { reason: shared.trim() } : undefined,
      }),
    onSuccess: (p) => {
      toast.success(`Patient register: ${p.name}`);
      onCreated(p);
      onOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'DUPLICATE_PHONE') setDups((e.details as { existing: Existing[] }).existing);
    },
  });
  const fieldErr = m.error instanceof ApiError && m.error.code === 'VALIDATION_ERROR' ? m.error.message : null;
  const other = m.error instanceof ApiError && !['DUPLICATE_PHONE', 'VALIDATION_ERROR'].includes(m.error.code) ? m.error.message : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New patient" description="Phone number se duplicate check hota hai.">
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2 && phone.trim().length >= 7) m.mutate(!!dups && shared.trim().length >= 3);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required htmlFor="np-name">
              <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Phone" required htmlFor="np-phone" error={fieldErr ?? undefined}>
              <Input
                id="np-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setDups(null);
                }}
                placeholder="0300-1234567"
              />
            </Field>
            <Field label="Age" htmlFor="np-age">
              <Input id="np-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Gender" htmlFor="np-g">
              <Select id="np-g" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6">
            <Checkbox label="WhatsApp consent" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
            <Checkbox label="Contact consent" checked={contact} onChange={(e) => setContact(e.target.checked)} />
          </div>
          {dups && (
            <div className="space-y-2 rounded-card border border-warning/40 bg-warning-bg p-3">
              <p className="text-dense font-semibold text-warning">Is number par pehle se patient registered hai:</p>
              <ul className="space-y-1">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-dense">
                    <span>
                      <strong>{d.name}</strong>
                      {d.ageYears ? `, ${d.ageYears} yrs` : ''}
                    </span>
                    {onUseExisting && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onUseExisting(d.id);
                          onOpenChange(false);
                        }}
                      >
                        Yahi patient kholen
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <Field label="Alag shakhs hai? Wajah likh kar confirm karein" htmlFor="np-shared" hint="e.g. Family member — same phone. Yeh audit mein save hota hai.">
                <Input id="np-shared" value={shared} onChange={(e) => setShared(e.target.value)} />
              </Field>
            </div>
          )}
          {other && <Notice>{other}</Notice>}
          <Footer onCancel={() => onOpenChange(false)} pending={m.isPending} submitLabel={dups ? 'Confirm: naya patient' : 'Register patient'} disabled={!!dups && shared.trim().length < 3} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Book (reception) ─────────────

export function ReceptionBookDialog({ patient, open, onOpenChange }: { patient: PatientCard; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const [doctorId, setDoctorId] = React.useState('');
  const [type, setType] = React.useState<'CONSULTATION' | 'PROCEDURE'>('CONSULTATION');
  const [serviceId, setServiceId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [slot, setSlot] = React.useState<SlotValue | null>(null);
  const [conflict, setConflict] = React.useState<{ message: string; suggestions: Suggestion[] } | null>(null);
  const m = useMutation({
    mutationFn: (body: unknown) => post<{ appointment: { startAt: string } }>('/reception/appointments', body, keyFor(body)),
    onSuccess: (r) => {
      toast.success(`Appointment confirm — ${formatDateTime(r.appointment.startAt)}`);
      void invalidateTracker(qc);
      void qc.invalidateQueries({ queryKey: ['scheduling', 'slots'] });
      onOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') {
        setConflict({ message: e.message, suggestions: (e.details as { suggestions: Suggestion[] }).suggestions });
        setSlot(null);
      }
    },
  });
  const err = m.error instanceof ApiError && m.error.code !== 'SLOT_UNAVAILABLE' ? m.error.message : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Book appointment" description={`${patient.name} · ${formatPhone(patient.phone)}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!doctorId || !slot || (type === 'PROCEDURE' && !serviceId)) return;
            setConflict(null);
            m.mutate({ patientId: patient.id, doctorId, type, serviceId: serviceId || undefined, reason: reason || undefined, start: slot.start, roomId: slot.roomId });
          }}
        >
          <DoctorServiceFields
            doctorId={doctorId}
            type={type}
            serviceId={serviceId}
            onChange={(v) => {
              if (v.doctorId !== undefined) setDoctorId(v.doctorId);
              if (v.type !== undefined) setType(v.type);
              if (v.serviceId !== undefined) setServiceId(v.serviceId);
              setSlot(null);
            }}
          />
          <Field label="Reason" htmlFor="rb-reason">
            <Textarea id="rb-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {conflict && (
            <div className="space-y-2">
              <Notice tone="warning">{conflict.message} Naya waqt chunein:</Notice>
              <SuggestionButtons suggestions={conflict.suggestions} onPick={(s) => setSlot({ start: s.start, roomId: s.roomId, roomCode: s.roomCode })} />
            </div>
          )}
          <SlotPicker doctorId={doctorId} type={type} serviceId={serviceId || undefined} value={slot} onChange={setSlot} />
          {err && <Notice>{err}</Notice>}
          <Footer
            onCancel={() => onOpenChange(false)}
            pending={m.isPending}
            disabled={!doctorId || !slot || (type === 'PROCEDURE' && !serviceId)}
            submitLabel={slot ? `Confirm · ${formatDateTime(slot.start)}` : 'Confirm booking'}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Vitals (skippable) ─────────────

export function VitalsDialog({ appt, onClose }: { appt: ReceptionAppt; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ sys: '', dia: '', glucose: '', weight: '', height: '' });
  const [skipReason, setSkipReason] = React.useState('');
  const num = (s: string) => (s.trim() ? Number(s) : undefined);
  const m = useMutation({
    mutationFn: (skip: boolean) =>
      post(
        `/reception/appointments/${appt.id}/vitals`,
        skip
          ? { skip: true, skipReason: skipReason || undefined }
          : { bpSystolic: num(v.sys), bpDiastolic: num(v.dia), glucoseMgDl: num(v.glucose), weightKg: num(v.weight), heightCm: num(v.height) },
      ),
    onSuccess: (_r, skip) => {
      toast.success(skip ? 'Vitals skip — patient Doctor queue mein' : 'Vitals save — patient Doctor queue mein');
      void invalidateTracker(qc);
      onClose();
    },
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, '') });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Vitals" description={`${appt.patient.name} · ${appt.doctorName}`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="BP systolic" htmlFor="v-sys">
              <Input id="v-sys" inputMode="numeric" value={v.sys} onChange={set('sys')} placeholder="120" />
            </Field>
            <Field label="BP diastolic" htmlFor="v-dia">
              <Input id="v-dia" inputMode="numeric" value={v.dia} onChange={set('dia')} placeholder="80" />
            </Field>
            <Field label="Glucose (mg/dL)" htmlFor="v-glu">
              <Input id="v-glu" inputMode="numeric" value={v.glucose} onChange={set('glucose')} />
            </Field>
            <Field label="Weight (kg)" htmlFor="v-w">
              <Input id="v-w" inputMode="decimal" value={v.weight} onChange={set('weight')} />
            </Field>
            <Field label="Height (cm)" htmlFor="v-h">
              <Input id="v-h" inputMode="decimal" value={v.height} onChange={set('height')} />
            </Field>
          </div>
          <Field label="Skip reason (optional)" htmlFor="v-skip">
            <Input id="v-skip" value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => m.mutate(true)} disabled={m.isPending}>
              Skip vitals
            </Button>
            <Button type="submit" loading={m.isPending}>
              Save vitals
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Cancel / reschedule request / patient complaint ─────────────

export function ReasonDialog({
  title,
  description,
  label,
  submitLabel,
  danger,
  withDateTime,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  label: string;
  submitLabel: string;
  danger?: boolean;
  withDateTime?: boolean;
  onSubmit: (v: { reason: string; at?: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const [at, setAt] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reason.trim().length < 2) return setError('Wajah likhein');
            setPending(true);
            setError(null);
            try {
              await onSubmit({ reason: reason.trim(), at: at || undefined });
              onClose();
            } catch (x) {
              setError(x instanceof ApiError ? x.message : 'Save nahi hua — dobara koshish karein.');
            } finally {
              setPending(false);
            }
          }}
        >
          {withDateTime && (
            <Field label="Patient ka pasandeeda waqt (optional)" htmlFor="rd-at">
              <Input id="rd-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
            </Field>
          )}
          <Field label={label} required htmlFor="rd-reason">
            <Textarea id="rd-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Footer onCancel={onClose} submitLabel={submitLabel} pending={pending} danger={danger} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PatientComplaintDialog({ patient, appointmentId, onClose }: { patient: PatientCard; appointmentId?: string; onClose: () => void }) {
  const [subject, setSubject] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const m = useMutation({
    mutationFn: () => post('/reception/complaints', { patientId: patient.id, appointmentId, subject, detail }),
    onSuccess: () => {
      toast.success('Complaint Manager ko bhej di gayi');
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Patient complaint" description={`${patient.name} · Manager Complaints inbox mein jayegi`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (subject.trim().length >= 2 && detail.trim().length >= 2) m.mutate();
          }}
        >
          <SectionLabel>Visit {appointmentId ? 'linked' : '—'}</SectionLabel>
          <Field label="Subject" required htmlFor="pc-s">
            <Input id="pc-s" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Detail" required htmlFor="pc-d">
            <Textarea id="pc-d" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Complaint nahi gayi'}</Notice>}
          <Footer onCancel={onClose} submitLabel="Send to Manager" pending={m.isPending} disabled={subject.trim().length < 2 || detail.trim().length < 2} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Convert a datetime-local value (clinic time) to ISO. */
export function localInputToIso(v: string): string {
  return new Date(`${v}:00+05:00`).toISOString();
}
