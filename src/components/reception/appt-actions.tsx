'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { ApiError, post } from '@/lib/api';
import { clinicDate } from '@/lib/time';
import type { ReceptionAppt } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { localInputToIso, PatientComplaintDialog, ReasonDialog, VitalsDialog } from './dialogs';

/**
 * The next action for a visit at the front desk (spec §9 "Receptionist ko ek waqt mein active patient ka agla
 * action samajh aaye"). Server enforces every transition; buttons only reflect the current stage.
 */
export function ApptActions({ appt, compact }: { appt: ReceptionAppt; compact?: boolean }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = React.useState<null | 'vitals' | 'cancel' | 'reschedule' | 'complaint'>(null);
  const isToday = clinicDate(new Date(appt.startAt)) === clinicDate();
  const checkIn = useMutation({
    mutationFn: () => post(`/reception/appointments/${appt.id}/check-in`),
    onSuccess: () => {
      toast.success(`${appt.patient.name} checked in — Doctor ko notice chala gaya`);
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      setDialog('vitals');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Check-in nahi hua'),
  });

  let primary: React.ReactNode = null;
  if (appt.status === 'CONFIRMED' && isToday)
    primary = (
      <Button size="sm" onClick={() => checkIn.mutate()} loading={checkIn.isPending}>
        Check-in
      </Button>
    );
  else if (appt.status === 'CHECKED_IN' || (appt.status === 'WAITING' && !appt.vitalsRecorded))
    primary = (
      <Button size="sm" variant={appt.status === 'CHECKED_IN' ? 'primary' : 'secondary'} onClick={() => setDialog('vitals')}>
        Vitals
      </Button>
    );
  else if (appt.status === 'RECEPTION' || appt.status === 'PROCEDURE')
    primary = (
      <Button asChild size="sm" variant={appt.status === 'RECEPTION' ? 'primary' : 'secondary'}>
        <Link href={`/reception/billing/${appt.id}`}>Billing</Link>
      </Button>
    );

  const canChange = appt.status === 'CONFIRMED';
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {primary}
      <DM.Root>
        <DM.Trigger asChild>
          <Button size="sm" variant="ghost" aria-label="More actions">
            <MoreHorizontal className="size-4" />
            {!compact && <span className="sr-only">More</span>}
          </Button>
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-card border border-line bg-surface p-1 shadow-overlay">
            {canChange && (
              <DM.Item onSelect={() => setDialog('reschedule')} className="cursor-pointer rounded-control px-3 py-2 text-dense outline-none data-[highlighted]:bg-brand-light">
                Reschedule request → Manager
              </DM.Item>
            )}
            {canChange && (
              <DM.Item onSelect={() => setDialog('cancel')} className="cursor-pointer rounded-control px-3 py-2 text-dense text-danger outline-none data-[highlighted]:bg-danger-bg">
                Cancel appointment
              </DM.Item>
            )}
            <DM.Item onSelect={() => setDialog('complaint')} className="cursor-pointer rounded-control px-3 py-2 text-dense outline-none data-[highlighted]:bg-brand-light">
              Patient complaint
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>

      {dialog === 'vitals' && <VitalsDialog appt={appt} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && (
        <ReasonDialog
          title="Cancel appointment"
          description={`${appt.patient.name} · ${appt.doctorName}`}
          label="Cancel reason"
          submitLabel="Cancel appointment"
          danger
          onClose={() => setDialog(null)}
          onSubmit={async ({ reason }) => {
            await post(`/reception/appointments/${appt.id}/cancel`, { reason });
            toast.success('Appointment cancel — slot release ho gaya');
            void qc.invalidateQueries({ queryKey: ['tracker'] });
          }}
        />
      )}
      {dialog === 'reschedule' && (
        <ReasonDialog
          title="Reschedule request"
          description="Manager Doctor aur patient se confirm kar ke naya slot set karega."
          label="Reason / patient ki request"
          submitLabel="Send to Manager"
          withDateTime
          onClose={() => setDialog(null)}
          onSubmit={async ({ reason, at }) => {
            await post(`/reception/appointments/${appt.id}/reschedule-request`, { reason, requestedStartAt: at ? localInputToIso(at) : undefined });
            toast.success('Reschedule request Manager ko bhej di');
          }}
        />
      )}
      {dialog === 'complaint' && <PatientComplaintDialog patient={appt.patient} appointmentId={appt.id} onClose={() => setDialog(null)} />}
    </div>
  );
}
