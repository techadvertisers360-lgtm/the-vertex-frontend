'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, idempotencyFor, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { LeadDetail, Suggestion } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Textarea } from '@/components/ui/form';
import { SectionLabel } from '@/components/ui/card';
import { DoctorServiceFields, SlotPicker, SuggestionButtons, type SlotValue } from '@/components/booking/slot-picker';

interface ExistingPatient {
  id: string;
  name: string;
  ageYears: number | null;
  gender: string | null;
  createdAt: string;
}

type PatientChoice = { mode: 'new' } | { mode: 'existing'; id: string } | { mode: 'shared'; reason: string };

/**
 * Book an appointment for a lead (spec §7) — or, without a lead, for one of the member's own contacts ("Connection
 * booking", D-071: name and phone typed here). The form keeps every entered value on any failure; retries of the
 * same payload reuse the same Idempotency-Key, so a timeout can never create two bookings.
 */
export function BookingDialog({ lead, open, onOpenChange, onBooked }: { lead?: LeadDetail; open: boolean; onOpenChange: (v: boolean) => void; onBooked?: () => void }) {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const [name, setName] = React.useState(lead?.name ?? '');
  const [phone, setPhone] = React.useState('');
  const [whatsappConsent, setWhatsapp] = React.useState(true);
  const [contactConsent, setContact] = React.useState(true);
  const [doctorId, setDoctorId] = React.useState('');
  const [type, setType] = React.useState<'CONSULTATION' | 'PROCEDURE'>('CONSULTATION');
  const [serviceId, setServiceId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [slot, setSlot] = React.useState<SlotValue | null>(null);
  const [choice, setChoice] = React.useState<PatientChoice>({ mode: 'new' });
  const [duplicates, setDuplicates] = React.useState<ExistingPatient[] | null>(null);
  const [conflict, setConflict] = React.useState<{ message: string; suggestions: Suggestion[] } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: (body: unknown) => post<{ appointment: { id: string; startAt: string } }>(lead ? `/lead/leads/${lead.id}/book` : '/lead/connection-book', body, keyFor(body)),
    onSuccess: (r) => {
      toast.success(`Appointment confirm — ${formatDateTime(r.appointment.startAt)}`, { description: 'Patient aur Doctor ko booking details bhej di gayi hain.' });
      void qc.invalidateQueries({ queryKey: ['lead'] });
      void qc.invalidateQueries({ queryKey: ['scheduling', 'slots'] });
      onOpenChange(false);
      onBooked?.();
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return;
      if (e.code === 'DUPLICATE_PHONE') {
        setDuplicates((e.details as { existing: ExistingPatient[] }).existing);
        setChoice({ mode: 'existing', id: (e.details as { existing: ExistingPatient[] }).existing[0]?.id ?? '' });
      } else if (e.code === 'SLOT_UNAVAILABLE') {
        setConflict({ message: e.message, suggestions: (e.details as { suggestions: Suggestion[] }).suggestions });
        setSlot(null);
        void qc.invalidateQueries({ queryKey: ['scheduling', 'slots'] });
      }
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (choice.mode !== 'existing' && name.trim().length < 2) errs.name = 'Patient ka naam likhein';
    if (!lead && phone.replace(/\D/g, '').length < 10) errs.phone = 'Phone number likhein';
    if (!doctorId) errs.doctor = 'Doctor chunein';
    if (type === 'PROCEDURE' && !serviceId) errs.service = 'Procedure chunein';
    if (!slot) errs.slot = 'Slot chunein';
    if (choice.mode === 'shared' && choice.reason.trim().length < 3) errs.shared = 'Wajah likhein (e.g. family member)';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setConflict(null);
    const typedPhone = lead ? {} : { phone: phone.trim() };
    const patient =
      choice.mode === 'existing'
        ? { existingPatientId: choice.id, ...typedPhone }
        : { name: name.trim(), ...typedPhone, whatsappConsent, contactConsent, ...(choice.mode === 'shared' ? { confirmSharedPhone: { reason: choice.reason.trim() } } : {}) };
    m.mutate({ patient, doctorId, type, serviceId: serviceId || undefined, reason: reason.trim() || undefined, start: slot!.start, roomId: slot!.roomId });
  };

  const genericError = m.error instanceof ApiError && !['DUPLICATE_PHONE', 'SLOT_UNAVAILABLE'].includes(m.error.code) ? m.error : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title={lead ? 'Book appointment' : 'Connection booking'}
        description={lead ? `${lead.name} · ${formatPhone(lead.phone)} · ${lead.sheet.campaign}` : 'Apne jaan-pehchan wale patient ka naam aur phone likhein, Doctor ki available timing dekh kar booking karein.'}
      >
        <form onSubmit={submit} className="space-y-5" noValidate>
          <section className="space-y-3">
            <SectionLabel>Patient</SectionLabel>
            {duplicates ? (
              <div className="space-y-2 rounded-card border border-warning/40 bg-warning-bg p-3">
                <p className="text-dense font-semibold text-warning">Is phone number par pehle se patient mojood hai. Sahi option chunein:</p>
                {duplicates.map((p) => (
                  <label key={p.id} className="flex min-h-control items-center gap-2 text-body">
                    <input type="radio" name="dup" className="accent-brand" checked={choice.mode === 'existing' && choice.id === p.id} onChange={() => setChoice({ mode: 'existing', id: p.id })} />
                    Yahi patient hai: <strong>{p.name}</strong>
                    {p.ageYears ? `, ${p.ageYears} yrs` : ''}
                  </label>
                ))}
                <label className="flex min-h-control items-center gap-2 text-body">
                  <input type="radio" name="dup" className="accent-brand" checked={choice.mode === 'shared'} onChange={() => setChoice({ mode: 'shared', reason: '' })} />
                  Alag shakhs hai, same phone (naya patient banayein)
                </label>
                {choice.mode === 'shared' && (
                  <Field label="Confirm reason" required error={errors.shared} htmlFor="shared-reason">
                    <Input id="shared-reason" placeholder="e.g. Family member — mother" value={choice.reason} onChange={(e) => setChoice({ mode: 'shared', reason: e.target.value })} />
                  </Field>
                )}
              </div>
            ) : null}
            {choice.mode !== 'existing' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Patient name" required error={errors.name} htmlFor="pname">
                  <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
                </Field>
                {lead ? (
                  <Field label="Phone" htmlFor="pphone" hint="Lead ka number">
                    <Input id="pphone" value={formatPhone(lead.phone)} readOnly />
                  </Field>
                ) : (
                  <Field label="Phone" required error={errors.phone} htmlFor="pphone">
                    <Input
                      id="pphone"
                      inputMode="tel"
                      placeholder="03XX XXXXXXX"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setDuplicates(null);
                        setChoice({ mode: 'new' });
                      }}
                      aria-invalid={!!errors.phone}
                    />
                  </Field>
                )}
                <div className="flex flex-wrap gap-x-6 sm:col-span-2">
                  <Checkbox label="WhatsApp messages ki ijazat" checked={whatsappConsent} onChange={(e) => setWhatsapp(e.target.checked)} />
                  <Checkbox label="Contact consent" checked={contactConsent} onChange={(e) => setContact(e.target.checked)} />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>Doctor & service</SectionLabel>
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
            {(errors.doctor || errors.service) && <p className="text-dense text-danger">{errors.doctor ?? errors.service}</p>}
            <Field label="Reason / service detail" htmlFor="reason">
              <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Acne scars consultation" />
            </Field>
          </section>

          <section className="space-y-3">
            <SectionLabel>Date & time</SectionLabel>
            {conflict && (
              <div className="space-y-2">
                <Notice tone="warning">{conflict.message} Naya available waqt chunein:</Notice>
                <SuggestionButtons suggestions={conflict.suggestions} onPick={(s) => setSlot({ start: s.start, roomId: s.roomId, roomCode: s.roomCode })} />
              </div>
            )}
            <SlotPicker doctorId={doctorId} type={type} serviceId={serviceId || undefined} value={slot} onChange={setSlot} />
            {errors.slot && <p className="text-dense text-danger">{errors.slot}</p>}
          </section>

          {genericError && (
            <Notice action={genericError.isNetwork ? <Button size="sm" variant="secondary" type="submit">Retry</Button> : undefined}>{genericError.message}</Notice>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending}>
              {slot ? `Confirm · ${formatDateTime(slot.start)}` : 'Confirm booking'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
