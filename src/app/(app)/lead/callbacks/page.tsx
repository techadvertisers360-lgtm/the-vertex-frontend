'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import type { LeadCallback } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';

type State = 'due' | 'upcoming' | 'all';

export default function CallbacksPage() {
  const router = useRouter();
  const { pollInterval } = useRealtime();
  const [state, setState] = React.useState<State>('due');
  const q = useQuery({
    queryKey: ['lead', 'callbacks', state],
    queryFn: () => get<{ items: LeadCallback[] }>('/lead/callbacks', { state }),
    refetchInterval: pollInterval || 60_000,
  });
  return (
    <div>
      <PageHeader label="Lead Team" title="Reminder Queue" />
      <Segmented<State>
        value={state}
        onChange={setState}
        options={[
          { value: 'due', label: 'Due now', count: state === 'due' ? q.data?.items.length : undefined },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'all', label: 'History' },
        ]}
      />
      <QueryState
        query={q}
        empty={(d) => d.items.length === 0}
        emptyTitle={state === 'due' ? 'Aaj koi follow-up due nahi' : 'Koi record nahi mila'}
        emptyHint="Lead detail se 2 ghante, 2 din ya custom follow-up set karein."
      >
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/lead/leads/${r.leadId}`)}
            columns={[
              { key: 'name', header: 'Lead', cell: (r) => <span className="font-semibold">{r.lead?.name}</span> },
              { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.lead?.phone) },
              { key: 'campaign', header: 'Campaign', cell: (r) => r.lead?.sheet.campaign, hideSm: true },
              { key: 'due', header: 'Due', cell: (r) => <span title={formatDateTime(r.dueAt)}>{relativeFromNow(r.dueAt)}</span> },
              { key: 'status', header: 'Status', cell: (r) => (r.overdue ? <Chip tone="danger">Overdue</Chip> : <StatusChip status={r.status} />) },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
