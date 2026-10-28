'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime } from '@/lib/time';
import type { ReceptionAppt } from '@/lib/types';
import { formatRs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';

/** Patients sent to Reception by the Doctor (or in procedure) — collection and invoice close. */
export default function BillingQueuePage() {
  const router = useRouter();
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['tracker', 'board'], queryFn: () => get<{ items: ReceptionAppt[] }>('/reception/tracker'), refetchInterval: pollInterval });
  return (
    <div>
      <PageHeader label="Reception" title="Billing" />
      <QueryState
        query={{ ...q, data: q.data ? { items: q.data.items.filter((a) => a.status === 'RECEPTION' || a.status === 'PROCEDURE') } : undefined }}
        empty={(d) => d.items.length === 0}
        emptyTitle="Aaj koi record nahi"
        emptyHint="Doctor jab patient ko Reception bhejega to yahan collection aur invoice aayegi."
      >
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/reception/billing/${r.id}`)}
            columns={[
              { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
              { key: 'sent', header: 'Sent', cell: (r) => (r.sentToReceptionAt ? formatTime(r.sentToReceptionAt) : '—'), hideSm: true },
              { key: 'status', header: 'Stage', cell: (r) => <StatusChip status={r.status} /> },
              { key: 'total', header: 'Total', cell: (r) => (r.invoice ? formatRs(r.invoice.totalPaisa) : <Chip>Invoice pending</Chip>) },
              { key: 'balance', header: 'Balance', cell: (r) => (r.invoice ? formatRs(r.invoice.balancePaisa) : '—') },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
