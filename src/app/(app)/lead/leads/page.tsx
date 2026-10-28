'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import type { LeadRow, LeadStatus, Page, Sheet } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { statusLabel } from '@/lib/status';
import { PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { DataTable, FilterBar } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_DUE', 'BOOKED', 'NOT_INTERESTED', 'UNREACHABLE'];

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function LeadsList() {
  const router = useRouter();
  const params = useSearchParams();
  const [sheetId, setSheetId] = React.useState(params.get('sheetId') ?? '');
  const [status, setStatus] = React.useState(params.get('status') ?? '');
  const [q, setQ] = React.useState('');
  const [due, setDue] = React.useState(params.get('due') === 'true');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const dq = useDebounced(q);

  const sheets = useQuery({ queryKey: ['lead', 'sheets'], queryFn: () => get<{ items: Sheet[] }>('/lead/sheets') });
  const filters = { sheetId, status, q: dq, due: due || undefined, from, to };
  const list = useInfiniteQuery({
    queryKey: ['lead', 'leads', filters],
    queryFn: ({ pageParam }) => get<Page<LeadRow>>('/lead/leads', { ...filters, limit: 25, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = !!(sheetId || status || dq || due || from || to);

  return (
    <div>
      <PageHeader label="Lead Team" title="Leads" />
      <FilterBar>
        <Field label="Sheet / campaign" htmlFor="f-sheet">
          <Select id="f-sheet" value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
            <option value="">All my sheets</option>
            {sheets.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search name / phone" htmlFor="f-q">
          <Input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="0300-1234567" />
        </Field>
        <Field label="Created from" htmlFor="f-from">
          <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="to" htmlFor="f-to">
          <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Checkbox label="Sirf follow-up due" checked={due} onChange={(e) => setDue(e.target.checked)} />
        </div>
      </FilterBar>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={filtered ? 'Koi record nahi mila' : 'Aaj koi record nahi'} hint={filtered ? 'Filters badal kar dekhein.' : 'Assigned sheets mein abhi koi lead nahi.'} />
      ) : (
        <>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/lead/leads/${r.id}`)}
            columns={[
              { key: 'name', header: 'Name', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.phone) },
              { key: 'campaign', header: 'Campaign', cell: (r) => r.sheet.campaign, hideSm: true },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => (
                  <span className="flex flex-wrap items-center gap-1">
                    <StatusChip status={r.status} />
                    {r.duplicateOfId && <Chip tone="warning">Duplicate phone</Chip>}
                  </span>
                ),
              },
              { key: 'created', header: 'Created', cell: (r) => formatDateTime(r.createdAt), hideSm: true },
              {
                key: 'next',
                header: 'Next contact',
                cell: (r) =>
                  r.nextContactAt ? (
                    <span className={new Date(r.nextContactAt) < new Date() ? 'font-semibold text-danger' : ''}>{relativeFromNow(r.nextContactAt)}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  ),
              },
            ]}
          />
          {list.hasNextPage && (
            <div className="mt-3 text-center">
              <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
                Aur leads
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <React.Suspense>
      <LeadsList />
    </React.Suspense>
  );
}
