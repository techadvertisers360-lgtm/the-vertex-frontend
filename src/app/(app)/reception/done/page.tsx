'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { clinicDate, formatTime } from '@/lib/time';
import type { ReceptionAppt } from '@/lib/types';
import { formatRs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';

/** Patient Done (spec §9): completion records stay available after leaving the active queue. */
export default function DonePage() {
  const { pollInterval } = useRealtime();
  const [date, setDate] = React.useState(clinicDate());
  const q = useQuery({ queryKey: ['tracker', 'done', date], queryFn: () => get<{ items: ReceptionAppt[] }>('/reception/done', { date }), refetchInterval: pollInterval });
  return (
    <div>
      <PageHeader label="Reception" title="Patient Done" />
      <FilterBar>
        <Field label="Date" htmlFor="done-d">
          <Input id="done-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FilterBar>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi record nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient.name}</span> },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
              { key: 'done', header: 'Done at', cell: (r) => formatTime(r.doneAt) },
              { key: 'total', header: 'Total', cell: (r) => formatRs(r.invoice?.totalPaisa) },
              { key: 'balance', header: 'Balance', cell: (r) => formatRs(r.invoice?.balancePaisa) },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
