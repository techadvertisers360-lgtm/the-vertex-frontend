'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Phone } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime } from '@/lib/time';
import type { BucketCounts, LeadAppointment, LeadRow, Page, Suggestion } from '@/lib/types';
import { formatPhone, telHref, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Notice, Textarea } from '@/components/ui/form';
import { EmptyState, QueryState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';
import { SlotPicker, SuggestionButtons, type SlotValue } from '@/components/booking/slot-picker';

type Tab = 'today' | 'after2' | 'after7' | 'total' | 'leads';
const ACTIVE = ['CONFIRMED', 'DRAFT'];

function RescheduleDialog({ appt, onClose }: { appt: LeadAppointment; onClose: () => void }) {
  const qc = useQueryClient();
  const [slot, setSlot] = React.useState<SlotValue | null>(null);
  const [reason, setReason] = React.useState('');
  const [conflict, setConflict] = React.useState<Suggestion[] | null>(null);
  const m = useMutation({
    mutationFn: () => post(`/lead/appointments/${appt.id}/reschedule`, { start: slot!.start, roomId: slot!.roomId, reason }),
    onSuccess: () => {
      toast.success('Appointment reschedule ho gayi', { description: 'Patient, Doctor aur Reception ko update bhej diya.' });
      void qc.invalidateQueries({ queryKey: ['lead'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') setConflict((e.details as { suggestions: Suggestion[] }).suggestions);
    },
  });
  const err = m.error instanceof ApiError && m.error.code !== 'SLOT_UNAVAILABLE' ? m.error.message : null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide title="Reschedule" description={`${appt.patient.name} · ${appt.doctorName} · abhi ${formatDateTime(appt.startAt)}`}>
        <div className="space-y-4">
          {conflict && (
            <div className="space-y-2">
              <Notice tone="warning">Yeh slot ab available nahi. Naya waqt chunein:</Notice>
              <SuggestionButtons suggestions={conflict} onPick={(s) => setSlot({ start: s.start, roomId: s.roomId, roomCode: s.roomCode })} />
            </div>
          )}
          <SlotPicker doctorId={appt.doctorId ?? ''} type={appt.type} value={slot} onChange={setSlot} />
          <Field label="Reschedule reason" required htmlFor="rs-reason">
            <Textarea id="rs-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {err && <Notice>{err}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!slot || reason.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>
              Naya slot confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ appt, onClose }: { appt: LeadAppointment; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = React.useState('');
  const m = useMutation({
    mutationFn: () => post(`/lead/appointments/${appt.id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Appointment cancel ho gayi');
      void qc.invalidateQueries({ queryKey: ['lead'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Cancel appointment" description={`${appt.patient.name} · ${formatDateTime(appt.startAt)}`}>
        <div className="space-y-3">
          <Field label="Cancel reason" required htmlFor="c-reason" hint="Lead ka outcome is se nahi badalta.">
            <Textarea id="c-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Cancel nahi hua'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Wapas
            </Button>
            <Button variant="danger" disabled={reason.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>
              Cancel appointment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadsTab() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['lead', 'leads', 'tab'], queryFn: () => get<Page<LeadRow>>('/lead/leads', { limit: 50 }) });
  return (
    <QueryState query={q} empty={(d) => d.items.length === 0}>
      {(d) => (
        <DataTable
          rows={d.items}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/lead/leads/${r.id}`)}
          columns={[
            { key: 'name', header: 'Lead', cell: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.phone) },
            { key: 'campaign', header: 'Campaign', cell: (r) => r.sheet.campaign, hideSm: true },
            { key: 'status', header: 'Status', cell: (r) => <StatusChip status={r.status} /> },
          ]}
        />
      )}
    </QueryState>
  );
}

function AppointmentsView() {
  const params = useSearchParams();
  const focus = params.get('focus') ?? undefined;
  const [tab, setTab] = React.useState<Tab>((params.get('bucket') as Tab) || 'today');
  const [resched, setResched] = React.useState<LeadAppointment | null>(null);
  const [cancel, setCancel] = React.useState<LeadAppointment | null>(null);
  const { pollInterval } = useRealtime();
  const bucket = tab === 'leads' ? 'today' : tab;
  const q = useQuery({
    queryKey: ['lead', 'appointments', bucket],
    queryFn: () => get<{ counts: BucketCounts; items: LeadAppointment[] }>('/lead/appointments', { bucket }),
    refetchInterval: pollInterval,
  });
  const c = q.data?.counts;

  return (
    <div>
      <PageHeader label="Lead Team" title="Appointments" actions={<Button asChild variant="secondary"><Link href="/lead/leads">Book from a lead</Link></Button>} />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'today', label: 'Today', count: c?.today },
          { value: 'after2', label: 'After 2 Days', count: c?.after2 },
          { value: 'after7', label: 'After 7 Days', count: c?.after7 },
          { value: 'total', label: 'Total Appointments', count: c?.total },
          { value: 'leads', label: 'Leads', count: c?.leads },
        ]}
      />
      {tab === 'leads' ? (
        <LeadsTab />
      ) : (
        <QueryState
          query={q}
          empty={(d) => d.items.length === 0}
          emptyTitle="Aaj koi record nahi"
          emptyHint="Is list mein koi appointment nahi. Leads se booking karein."
          emptyAction={
            <Button asChild size="sm">
              <Link href="/lead/leads">Leads kholen</Link>
            </Button>
          }
        >
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState />
            ) : (
              <DataTable
                rows={d.items}
                rowKey={(r) => r.id}
                selectedKey={focus}
                columns={[
                  { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
                  { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.patient.phone), hideSm: true },
                  { key: 'when', header: 'Date / time', cell: (r) => formatDateTime(r.startAt) },
                  { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
                  { key: 'type', header: 'Type', cell: (r) => `${titleCase(r.type)}${r.roomCode ? ` · ${r.roomCode}` : ''}`, hideSm: true },
                  { key: 'status', header: 'Status', cell: (r) => <StatusChip status={r.status} /> },
                  {
                    key: 'actions',
                    header: 'Actions',
                    cell: (r) => (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button asChild size="sm" variant="ghost" aria-label="Call patient">
                          <a href={telHref(r.patient.phone)}>
                            <Phone className="size-4" />
                          </a>
                        </Button>
                        {ACTIVE.includes(r.status) && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setResched(r)}>
                              Reschedule
                            </Button>
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCancel(r)}>
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )
          }
        </QueryState>
      )}
      {resched && <RescheduleDialog appt={resched} onClose={() => setResched(null)} />}
      {cancel && <CancelDialog appt={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <React.Suspense>
      <AppointmentsView />
    </React.Suspense>
  );
}
