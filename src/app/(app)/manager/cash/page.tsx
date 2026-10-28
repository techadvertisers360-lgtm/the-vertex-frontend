'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { clinicDate, formatDateTime, formatTime } from '@/lib/time';
import { rupeesToPaisa } from '@/lib/money';
import type { CashDay } from '@/lib/inventory-types';
import { cn, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { DataTable, FilterBar, Segmented } from '@/components/ui/table';
import { CashReportView } from '@/components/inventory/cash-report';

type Tab = 'closing' | 'report';

function CloseForm({ d }: { d: CashDay }) {
  const qc = useQueryClient();
  const [counted, setCounted] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [cashier, setCashier] = React.useState(d.perCashier[0]?.cashierId ?? '');
  const paisa = rupeesToPaisa(counted);
  const variance = paisa === null ? null : paisa - d.cash.expectedPaisa;
  const m = useMutation({
    mutationFn: () => post('/cash/closings', { date: d.date, countedCashPaisa: paisa, notes: notes.trim() || undefined, cashierId: cashier || undefined }),
    onSuccess: () => {
      toast.success(`${d.date} cash closing sign-off ho gaya`);
      void qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
  const needsNote = variance !== null && variance !== 0 && !notes.trim();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (paisa !== null && !needsNote) m.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Counted cash (Rs)" required htmlFor="cc-c">
          <Input id="cc-c" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={String(d.cash.expectedPaisa / 100)} />
        </Field>
        <Field label="Cashier" htmlFor="cc-k">
          <Select id="cc-k" value={cashier} onChange={(e) => setCashier(e.target.value)}>
            <option value="">—</option>
            {d.perCashier.map((c) => (
              <option key={c.cashierId} value={c.cashierId}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          {variance !== null && (
            <Chip tone={variance === 0 ? 'success' : 'danger'}>
              Variance {variance > 0 ? '+' : ''}
              {formatRs(variance)}
            </Chip>
          )}
        </div>
      </div>
      <Field label="Notes" required={needsNote} htmlFor="cc-n" hint={variance ? 'Variance ki wajah zaroori' : undefined}>
        <Textarea id="cc-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Closing save nahi hui'}</Notice>}
      <Button type="submit" loading={m.isPending} disabled={paisa === null || needsNote}>
        <Lock className="size-4" /> Sign off closing
      </Button>
      <p className="text-dense text-muted">Sign-off ke baad closing badli nahi ja sakti.</p>
    </form>
  );
}

function ClosingTab() {
  const [date, setDate] = React.useState(clinicDate());
  const q = useQuery({ queryKey: ['cash', 'day', date], queryFn: () => get<CashDay>('/cash/day', { date }) });
  const d = q.data;
  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="Date" htmlFor="cd-d">
          <Input id="cd-d" type="date" max={clinicDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FilterBar>
      {q.isPending ? (
        <LoadingRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Collections" value={formatRs(d!.collections.totalPaisa)} hint={`${d!.collections.count} receipts`} />
            <StatTile label="Cash" value={formatRs(d!.collections.cashPaisa)} />
            <StatTile label="Card" value={formatRs(d!.collections.cardPaisa)} />
            <StatTile label="Bank / online" value={formatRs(d!.collections.bankPaisa)} />
            <StatTile label="Cheque" value={formatRs(d!.collections.chequePaisa)} />
            <StatTile label="Discounts" value={formatRs(d!.discountsPaisa)} hint="invoices opened this day" />
          </div>
          {d!.counterSales.count > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Counter sales (pharmacy, walk-in)</CardTitle>
                <span className="text-dense text-muted">{d!.counterSales.count} sales · upar collections mein shamil</span>
              </CardHeader>
              <dl className="grid grid-cols-3 gap-2 text-dense">
                <div>
                  <dt className="text-muted">Total</dt>
                  <dd className="text-card-title text-ink">{formatRs(d!.counterSales.totalPaisa)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Cash</dt>
                  <dd className="text-card-title text-ink">{formatRs(d!.counterSales.cashPaisa)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Bank / card</dt>
                  <dd className="text-card-title text-ink">{formatRs(d!.counterSales.bankPaisa)}</dd>
                </div>
              </dl>
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card accent={d!.closing ? 'ops' : 'danger'}>
              <CardHeader>
                <CardTitle>Cash in hand</CardTitle>
                {d!.closing ? <Chip tone="success">Signed off</Chip> : <Chip tone="warning">Not closed</Chip>}
              </CardHeader>
              <dl className="mb-3 grid grid-cols-3 gap-2 text-dense">
                <div>
                  <dt className="text-muted">Cash in</dt>
                  <dd className="text-card-title text-ink">{formatRs(d!.cash.inPaisa)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Cash out (suppliers)</dt>
                  <dd className="text-card-title text-ink">{formatRs(d!.cash.outPaisa)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Expected</dt>
                  <dd className="text-card-title text-brand">{formatRs(d!.cash.expectedPaisa)}</dd>
                </div>
              </dl>
              {d!.closing ? (
                <div className="space-y-1 text-dense">
                  <p>
                    Counted <span className="font-semibold">{formatRs(d!.closing.countedCashPaisa)}</span> · variance{' '}
                    <span className={cn('font-semibold', d!.closing.variancePaisa === 0 ? 'text-success' : 'text-danger')}>{formatRs(d!.closing.variancePaisa)}</span>
                  </p>
                  <p className="text-muted">
                    Signed off by {d!.closing.managerName} · {formatDateTime(d!.closing.signedOffAt)}
                    {d!.closing.cashierName ? ` · cashier ${d!.closing.cashierName}` : ''}
                  </p>
                  {d!.closing.notes && <p className="text-ink">{d!.closing.notes}</p>}
                </div>
              ) : (
                <CloseForm key={d!.date} d={d!} />
              )}
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By cashier</CardTitle>
              </CardHeader>
              {d!.perCashier.length === 0 ? (
                <p className="text-dense text-muted">Is din koi collection nahi.</p>
              ) : (
                <ul className="divide-y divide-line text-dense">
                  {d!.perCashier.map((c) => (
                    <li key={c.cashierId} className="flex justify-between py-1.5">
                      <span>
                        {c.name} · {c.count} receipts
                      </span>
                      <span>
                        {formatRs(c.totalPaisa)} <span className="text-muted">(cash {formatRs(c.cashPaisa)})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {d!.supplierPayments.length > 0 && (
                <>
                  <p className="mt-3 text-dense font-semibold text-ink">Supplier payments</p>
                  <ul className="text-dense text-muted">
                    {d!.supplierPayments.map((s) => (
                      <li key={s.id}>
                        {s.vendorName} · {titleCase(s.method)} {s.reference ?? ''} · {formatRs(s.amountPaisa)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
          {d!.payments.length > 0 && (
            <DataTable
              rows={d!.payments}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'r',
                  header: 'Receipt',
                  cell: (r) => (
                    <span>
                      <span className="font-semibold">{r.receiptNo}</span>
                      {r.invoiceNumber && <span className="block text-[12px] text-muted">{r.invoiceNumber}</span>}
                      {r.counterSale && (
                        <Chip tone="gold" className="mt-0.5">
                          Counter sale
                        </Chip>
                      )}
                    </span>
                  ),
                },
                { key: 't', header: 'Time', cell: (r) => formatTime(r.receivedAt) },
                { key: 'm', header: 'Method', cell: (r) => `${titleCase(r.method)}${r.reference ? ` · ${r.reference}` : ''}` },
                { key: 'c', header: 'Cashier', cell: (r) => r.cashierName ?? '—', hideSm: true },
                { key: 'a', header: 'Amount', cell: (r) => formatRs(r.amountPaisa) },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function CashPage() {
  const [tab, setTab] = React.useState<Tab>('closing');
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Cash closing & reports" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'closing', label: 'Daily closing' },
          { value: 'report', label: 'Cash reports & outstanding' },
        ]}
      />
      {tab === 'closing' ? <ClosingTab /> : <CashReportView />}
    </div>
  );
}
