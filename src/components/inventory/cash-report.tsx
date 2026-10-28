'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { addDays, clinicDate, formatDay } from '@/lib/time';
import type { CashReport } from '@/lib/inventory-types';
import { formatPhone, formatRs, titleCase } from '@/lib/utils';
import { Card, CardHeader, CardTitle, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';

/** Cash report for a date range with outstanding balances and installments (spec §14, Q7). */
export function CashReportView() {
  const today = clinicDate();
  const [range, setRange] = React.useState({ from: addDays(today, -6), to: today });
  const q = useQuery({ queryKey: ['cash', 'report', range], queryFn: () => get<CashReport>('/cash/report', range) });
  const r = q.data;
  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="From" htmlFor="cr-f">
          <Input id="cr-f" type="date" value={range.from} max={range.to} onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))} />
        </Field>
        <Field label="To" htmlFor="cr-t">
          <Input id="cr-t" type="date" value={range.to} max={today} onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))} />
        </Field>
      </FilterBar>
      {q.isPending ? (
        <LoadingRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Collected" value={formatRs(r!.totals.collectedPaisa)} hint={`cash ${formatRs(r!.totals.cashPaisa)}`} />
            <StatTile label="Discounts" value={formatRs(r!.totals.discountsPaisa)} />
            <StatTile label="Supplier paid" value={formatRs(r!.totals.supplierPaidPaisa)} />
            <StatTile label="Variance" value={formatRs(r!.totals.variancePaisa)} hint={`${r!.totals.unclosedDays} day(s) with money not closed`} accent={r!.totals.unclosedDays || r!.totals.variancePaisa ? 'danger' : 'ops'} />
          </div>
          <DataTable
            rows={r!.days}
            rowKey={(x) => x.date}
            columns={[
              { key: 'd', header: 'Date', cell: (x) => <span className="font-semibold">{formatDay(`${x.date}T12:00:00Z`)}</span> },
              { key: 'c', header: 'Collected', cell: (x) => formatRs(x.collections.totalPaisa) },
              { key: 'cash', header: 'Cash', cell: (x) => formatRs(x.collections.cashPaisa), hideSm: true },
              { key: 'cb', header: 'Card / bank / cheque', cell: (x) => `${formatRs(x.collections.cardPaisa)} / ${formatRs(x.collections.bankPaisa)} / ${formatRs(x.collections.chequePaisa)}`, hideSm: true },
              { key: 'dis', header: 'Discounts', cell: (x) => formatRs(x.discountsPaisa), hideSm: true },
              { key: 'sp', header: 'Supplier paid', cell: (x) => formatRs(x.supplierPaidPaisa), hideSm: true },
              {
                key: 'cl',
                header: 'Closing',
                cell: (x) =>
                  x.closing ? <Chip tone={x.closing.variancePaisa === 0 ? 'success' : 'danger'}>Variance {formatRs(x.closing.variancePaisa)}</Chip> : x.collections.count ? <Chip tone="warning">Not closed</Chip> : <Chip>—</Chip>,
              },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>Outstanding balances & installments</CardTitle>
              <span className="flex flex-wrap gap-1">
                <Chip tone="warning">Total {formatRs(r!.outstanding.totals.balancePaisa)}</Chip>
                <Chip tone="danger">Overdue {formatRs(r!.outstanding.totals.overduePaisa)}</Chip>
                <Chip tone="info">Next 30 days {formatRs(r!.outstanding.totals.dueNext30Paisa)}</Chip>
              </span>
            </CardHeader>
            {r!.outstanding.items.length === 0 ? (
              <p className="text-dense text-muted">Koi outstanding balance nahi.</p>
            ) : (
              <DataTable
                rows={r!.outstanding.items}
                rowKey={(x) => x.invoiceId}
                columns={[
                  {
                    key: 'p',
                    header: 'Patient',
                    cell: (x) => (
                      <span>
                        <span className="font-semibold">{x.patient?.name}</span>
                        <span className="block text-[12px] text-muted">{x.patient && formatPhone(x.patient.phone)}</span>
                      </span>
                    ),
                  },
                  { key: 'n', header: 'Invoice', cell: (x) => <span className="flex items-center gap-1">{x.number} <StatusChip status={x.status} /></span>, hideSm: true },
                  { key: 't', header: 'Total / paid', cell: (x) => `${formatRs(x.totalPaisa)} / ${formatRs(x.paidPaisa)}`, hideSm: true },
                  { key: 'b', header: 'Balance', cell: (x) => <span className="font-semibold">{formatRs(x.balancePaisa)}</span> },
                  { key: 'o', header: 'Overdue', cell: (x) => (x.overduePaisa ? <Chip tone="danger">{formatRs(x.overduePaisa)}</Chip> : '—') },
                  { key: 'nx', header: 'Next due', cell: (x) => (x.nextDue ? `${formatDay(`${x.nextDue.dueDate}T12:00:00Z`)} · ${formatRs(x.nextDue.outstandingPaisa)}` : x.unscheduledPaisa ? <Chip tone="warning">Unscheduled {formatRs(x.unscheduledPaisa)}</Chip> : '—') },
                  { key: 'i', header: 'Installments', cell: (x) => x.installments.map((i) => `#${i.seq} ${titleCase(i.state)}`).join(' · ') || '—', hideSm: true },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

