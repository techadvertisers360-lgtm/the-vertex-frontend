'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, idempotencyFor, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { Suggestion } from '@/lib/types';
import type { ApptCard } from '@/lib/manager-types';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Notice, Textarea } from '@/components/ui/form';
import { SlotPicker, SuggestionButtons, type SlotValue } from '@/components/booking/slot-picker';

/**
 * Manager reschedule (spec §6, §25 #14): pick a slot for the same Doctor, record that the patient and the Doctor
 * confirmed, then save. The server re-checks the slot and releases the old one only after the new one is saved.
 */
export function ManagerRescheduleDialog({ appt, requestId, defaultReason = '', onClose }: { appt: ApptCard; requestId?: string; defaultReason?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const [slot, setSlot] = React.useState<SlotValue | null>(null);
  const [reason, setReason] = React.useState(defaultReason);
  const [patientOk, setPatientOk] = React.useState(false);
  const [doctorOk, setDoctorOk] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ message: string; suggestions: Suggestion[] } | null>(null);
  const m = useMutation({
    mutationFn: (body: object) => post<{ appointment: { startAt: string } }>(`/manager/appointments/${appt.id}/reschedule`, body, keyFor(body)),
    onSuccess: (r) => {
      toast.success(`Reschedule ho gaya — ${formatDateTime(r.appointment.startAt)}. Patient, Doctor, Reception aur Lead ko update gaya.`);
      void qc.invalidateQueries({ queryKey: ['manager'] });
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') setConflict({ message: e.message, suggestions: (e.details as { suggestions: Suggestion[] }).suggestions ?? [] });
    },
  });
  const ready = !!slot && reason.trim().length >= 2 && patientOk && doctorOk;
  const error = m.error instanceof ApiError && m.error.code !== 'SLOT_UNAVAILABLE' ? m.error.message : m.error && !(m.error instanceof ApiError) ? 'Save nahi hua — dobara koshish karein.' : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="Reschedule" description={`${appt.patient.name} · ${formatPhone(appt.patient.phone)} · ${appt.doctorName} · abhi ${formatDateTime(appt.startAt)}${appt.roomCode ? ` · ${appt.roomCode}` : ''}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            setConflict(null);
            m.mutate({ start: slot!.start, roomId: slot!.roomId, reason: reason.trim(), patientConfirmed: patientOk, doctorConfirmed: doctorOk, requestId });
          }}
        >
          <SlotPicker doctorId={appt.doctorId} type={appt.type} value={slot} onChange={setSlot} />
          {conflict && (
            <div className="space-y-2">
              <Notice tone="warning">{conflict.message}</Notice>
              <SuggestionButtons suggestions={conflict.suggestions} onPick={(s) => setSlot({ start: s.start, roomId: s.roomId, roomCode: s.roomCode })} />
            </div>
          )}
          <Field label="Wajah" required htmlFor="mr-reason">
            <Textarea id="mr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="grid gap-1 rounded-card border border-line p-3">
            <SectionLabel>Confirmation (zaroori)</SectionLabel>
            <Checkbox label="Patient se baat ho gayi — naya waqt confirm" checked={patientOk} onChange={(e) => setPatientOk(e.target.checked)} />
            <Checkbox label="Doctor ne naya waqt confirm kiya" checked={doctorOk} onChange={(e) => setDoctorOk(e.target.checked)} />
          </div>
          {error && <Notice>{error}</Notice>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={!ready}>
              Confirm reschedule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
