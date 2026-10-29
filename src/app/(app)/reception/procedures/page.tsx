'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime, relativeFromNow } from '@/lib/time';
import { stepLabel, type PendingProcedure, type ProcedureTaskView } from '@/lib/procedure-types';
import { formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, PageHeader, SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { AssignProcedureDialog } from '@/components/procedures/assign-dialog';
import { PlannedTodayCard } from '@/components/procedures/planned-today';

/**
 * Reception procedures (spec §9): same-day procedures and checked-in planned sessions waiting for an Assistant +
 * room, and procedures in progress with their live step. Updates arrive via Socket.IO (30 s polling offline).
 */
export default function ReceptionProceduresPage() {
  const { pollInterval, connected } = useRealtime();
  const pending = useQuery({ queryKey: ['tracker', 'procedures', 'pending'], queryFn: () => get<{ items: PendingProcedure[] }>('/reception/procedures/pending'), refetchInterval: pollInterval });
  const active = useQuery({ queryKey: ['tracker', 'procedures', 'active'], queryFn: () => get<{ items: ProcedureTaskView[] }>('/reception/procedures/active'), refetchInterval: pollInterval });
  const [assigning, setAssigning] = React.useState<PendingProcedure | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader label="Reception" title="Procedures" actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />

      <PlannedTodayCard endpoint="/reception/procedures/planned-today" emptyHidden hint="Patient check-in hote hi yeh session neeche 'Assistant + room chahiye' mein aa jata hai." />

      <section className="space-y-3">
        <SectionLabel>Assistant + room chahiye</SectionLabel>
        <QueryState query={pending} empty={(d) => d.items.length === 0} emptyTitle="Koi procedure assign ke liye baqi nahi" emptyHint="Doctor same-day procedure plan kare ya planned session ka patient check-in ho to yahan aata hai.">
          {(d) => (
            <div className="grid gap-3 lg:grid-cols-2">
              {d.items.map((p) => (
                <Card key={p.planItemId} accent={p.paymentOk ? 'ops' : 'danger'} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-card-title text-ink">{p.patient.name}</p>
                      <Chip tone={p.kind === 'same_day' ? 'gold' : 'info'}>{p.kind === 'same_day' ? 'Same day' : 'Planned session'}</Chip>
                    </div>
                    <p className="mt-1 text-dense text-muted">
                      {p.procedureName} · session {p.sessionNumber} · {p.doctorName ?? 'Doctor nahi'}
                    </p>
                    {p.kind === 'same_day' && (
                      <p className={p.paymentOk ? 'mt-1 text-dense text-success' : 'mt-1 text-dense text-danger'}>
                        {p.paymentOk ? `Advance received (${formatRs(p.paidPaisa)})` : `Advance baqi: ${formatRs(p.advanceRequiredPaisa - p.paidPaisa)} — pehle payment lein`}
                      </p>
                    )}
                  </div>
                  <Button className="shrink-0" variant={p.paymentOk ? 'primary' : 'secondary'} onClick={() => setAssigning(p)}>
                    Assign
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </QueryState>
      </section>

      <section className="space-y-3">
        <SectionLabel>Procedure chal rahe hain</SectionLabel>
        <QueryState query={active} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi procedure nahi chal raha">
          {(d) => (
            <DataTable
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient?.name}</span> },
                { key: 'proc', header: 'Procedure', cell: (r) => r.procedure?.procedureName ?? '—' },
                { key: 'assistant', header: 'Assistant', cell: (r) => r.assistantName ?? '—' },
                { key: 'room', header: 'Room', cell: (r) => r.roomCode ?? '—' },
                {
                  key: 'step',
                  header: 'Step',
                  cell: (r) =>
                    r.status === 'BLOCKED' ? (
                      <Chip tone="danger">Emergency</Chip>
                    ) : r.sentToReceptionAt ? (
                      <Chip tone="success">Patient at Reception · room clean pending</Chip>
                    ) : (
                      <Chip tone={r.currentStep === 'ACCEPT' ? 'warning' : 'info'}>{stepLabel(r.currentStep)}</Chip>
                    ),
                },
                { key: 'assigned', header: 'Assigned', cell: (r) => (r.assignedAt ? `${formatTime(r.assignedAt)} (${relativeFromNow(r.assignedAt)})` : '—'), hideSm: true },
                { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName ?? '—', hideSm: true },
              ]}
            />
          )}
        </QueryState>
        <p className="text-dense text-muted">Items used ke baad Assistant patient ko Reception bhejta hai (2 min mein auto). Room clean us ke baad hota hai; billing close karne ke liye room clean ka intezar nahi.</p>
      </section>

      {assigning && <AssignProcedureDialog item={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}
