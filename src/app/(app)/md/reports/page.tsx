'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { addDays, clinicDate, formatDateTime, formatDay, formatTime } from '@/lib/time';
import type { StockRow } from '@/lib/inventory-types';
import { formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable, FilterBar, Segmented } from '@/components/ui/table';
import { LeadershipPerformance, PerformanceNotes } from '@/components/leadership/performance';
import { CashReportView } from '@/components/inventory/cash-report';

type Tab = 'staff' | 'lead' | 'stock' | 'purchases' | 'cash' | 'completed';

function Range({ value, onChange }: { value: { from: string; to: string }; onChange: (v: { from: string; to: string }) => void }) {
  const today = clinicDate();
  return (
    <FilterBar>
      <Field label="From" htmlFor="r-from">
        <Input id="r-from" type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </Field>
      <Field label="To" htmlFor="r-to">
        <Input id="r-to" type="date" value={value.to} min={value.from} max={today} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </Field>
    </FilterBar>
  );
}

interface StaffRow {
  user: { id: string; displayName: string; role: string };
  daysPresent: number;
  avgRating: number | null;
  reviewIssues: number;
  days?: { date: string; checkInAt: string; checkOutAt: string | null; review: { rating: number; uniformOk: boolean; hairOk: boolean; nailsOk: boolean; comment: string | null; improvementNote: string | null } | null }[];
}

function StaffReport({ range }: { range: { from: string; to: string } }) {
  const [person, setPerson] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ['md', 'staff', range], queryFn: () => get<{ items: StaffRow[] }>('/md/reports/staff', range) });
  const detail = useQuery({ queryKey: ['md', 'staff', range, person], queryFn: () => get<{ items: StaffRow[] }>('/md/reports/staff', { ...range, userId: person! }), enabled: !!person });
  return (
    <div className="space-y-3">
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi staff nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.user.id}
            selectedKey={person ?? undefined}
            onRowClick={(r) => setPerson(r.user.id)}
            columns={[
              { key: 'n', header: 'Staff', cell: (r) => <span className="font-semibold">{r.user.displayName}</span> },
              { key: 'r', header: 'Role', cell: (r) => titleCase(r.user.role), hideSm: true },
              { key: 'd', header: 'Days present', cell: (r) => r.daysPresent },
              { key: 'a', header: 'Avg review', cell: (r) => (r.avgRating === null ? '—' : `${r.avgRating}/5`) },
              { key: 'i', header: 'Review issues', cell: (r) => (r.reviewIssues ? <Chip tone="warning">{r.reviewIssues}</Chip> : '—') },
            ]}
          />
        )}
      </QueryState>
      {person && detail.data && (
        <Card>
          <CardHeader>
            <CardTitle>{detail.data.items[0]?.user.displayName} — days</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setPerson(null)}>
              Close
            </Button>
          </CardHeader>
          <ul className="divide-y divide-line text-dense">
            {(detail.data.items[0]?.days ?? []).map((d) => (
              <li key={d.date} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {formatDay(`${d.date}T12:00:00Z`)} · {formatTime(d.checkInAt)}–{d.checkOutAt ? formatTime(d.checkOutAt) : 'no check-out'}
                </span>
                <span className="text-muted">
                  {d.review ? `${d.review.rating}/5${!d.review.uniformOk || !d.review.hairOk || !d.review.nailsOk ? ' · issue' : ''}${d.review.improvementNote ? ` · ${d.review.improvementNote}` : ''}` : 'no review'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

interface Purchase {
  id: string;
  receivedAt: string;
  vendor: string | null;
  vendorInvoiceNo: string | null;
  demand: { demandNumber: string | null; approverRole: string | null } | null;
  totalPaisa: number;
  lines: { item: string; unit: string; quantity: number; unitCostPaisa: number; lotNo: string; expiryDate: string | null }[];
}

function Purchases({ range }: { range: { from: string; to: string } }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ['md', 'purchases', range], queryFn: () => get<{ totalPaisa: number; byVendor: { vendorId: string; vendor: string; receipts: number; totalPaisa: number }[]; receipts: Purchase[] }>('/md/reports/purchases', range) });
  return (
    <QueryState query={q} empty={(d) => d.receipts.length === 0} emptyTitle="Is muddat mein koi purchase nahi">
      {(d) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Purchases" value={formatRs(d.totalPaisa)} hint={`${d.receipts.length} receipts`} />
            {d.byVendor.slice(0, 3).map((v) => (
              <StatTile key={v.vendorId} label={v.vendor} value={formatRs(v.totalPaisa)} hint={`${v.receipts} receipts`} />
            ))}
          </div>
          <Card>
            <ul className="divide-y divide-line text-dense">
              {d.receipts.map((r) => (
                <li key={r.id} className="py-2">
                  <button type="button" className="flex w-full flex-wrap justify-between gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                    <span>
                      <span className="font-semibold text-ink">{r.vendor}</span> · {r.demand?.demandNumber ?? '—'} · invoice {r.vendorInvoiceNo ?? '—'}
                    </span>
                    <span>
                      {formatRs(r.totalPaisa)} <span className="text-muted">· {formatDateTime(r.receivedAt)}</span>
                    </span>
                  </button>
                  {open === r.id && (
                    <ul className="mt-1 pl-4 text-muted">
                      {r.lines.map((l, i) => (
                        <li key={i}>
                          {l.item} × {l.quantity} {l.unit} @ {formatRs(l.unitCostPaisa)} · lot {l.lotNo}
                          {l.expiryDate ? ` · exp ${l.expiryDate}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </QueryState>
  );
}

function StockReport() {
  const q = useQuery({ queryKey: ['md', 'stock'], queryFn: () => get<{ items: StockRow[] }>('/inventory/stock') });
  return (
    <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi stock item nahi">
      {(d) => (
        <DataTable
          rows={d.items}
          rowKey={(r) => r.id}
          columns={[
            { key: 'n', header: 'Item', cell: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'h', header: 'On hand', cell: (r) => `${r.onHand} ${r.baseUnit}` },
            { key: 'u', header: 'Usable', cell: (r) => r.usable },
            { key: 'm', header: 'Min', cell: (r) => r.minQty, hideSm: true },
            {
              key: 's',
              header: 'Status',
              cell: (r) => (
                <span className="flex flex-wrap gap-1">
                  {r.low && <Chip tone="danger">Low</Chip>}
                  {r.expired > 0 && <Chip tone="danger">{r.expired} expired</Chip>}
                  {r.nearExpiry > 0 && <Chip tone="warning">near expiry</Chip>}
                  {!r.low && !r.expired && !r.nearExpiry && <Chip tone="success">OK</Chip>}
                </span>
              ),
            },
          ]}
        />
      )}
    </QueryState>
  );
}

function Completed({ range }: { range: { from: string; to: string } }) {
  const [action, setAction] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ['md', 'completed', range], queryFn: () => get<{ summary: { action: string; label: string; count: number }[] }>('/md/reports/completed', range) });
  const detail = useQuery({
    queryKey: ['md', 'completed', range, action],
    queryFn: () => get<{ items: { id: string; at: string; action: string; recordType: string; recordId: string | null; actor: string | null }[] }>('/md/reports/completed', { ...range, action: action! }),
    enabled: !!action,
  });
  return (
    <div className="space-y-3">
      <p className="text-dense text-muted">Routine kaam yahan nazar aata hai; in par MD ko notification nahi bheji jati.</p>
      <QueryState query={q} empty={() => false}>
        {(d) => (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {d.summary.map((s) => (
              <StatTile key={s.action} label={s.label} value={s.count} onClick={() => setAction(s.action)} active={action === s.action} />
            ))}
          </div>
        )}
      </QueryState>
      {action && detail.data && (
        <Card>
          <CardHeader>
            <CardTitle>{q.data?.summary.find((s) => s.action === action)?.label}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
              Close
            </Button>
          </CardHeader>
          <ul className="max-h-96 divide-y divide-line overflow-auto text-dense">
            {detail.data.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-1.5">
                <span>
                  {i.actor} · {i.recordType}
                </span>
                <span className="text-muted">{formatDateTime(i.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** MD reports with drill-down (spec §15): staff, Lead, stock, purchases, cash/sales, completed actions. */
function View() {
  const params = useSearchParams();
  const today = clinicDate();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'staff');
  const [range, setRange] = React.useState({ from: addDays(today, -6), to: today });
  return (
    <div className="space-y-4">
      <PageHeader label="MD" title="Reports" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'staff', label: 'Staff' },
          { value: 'lead', label: 'Lead Team' },
          { value: 'stock', label: 'Stock' },
          { value: 'purchases', label: 'Purchases' },
          { value: 'cash', label: 'Cash / sales' },
          { value: 'completed', label: 'Completed actions' },
        ]}
      />
      {['staff', 'purchases', 'completed'].includes(tab) && <Range value={range} onChange={setRange} />}
      {tab === 'staff' && <StaffReport range={range} />}
      {tab === 'lead' && (
        <div className="space-y-4">
          <PerformanceNotes />
          <LeadershipPerformance />
        </div>
      )}
      {tab === 'stock' && <StockReport />}
      {tab === 'purchases' && <Purchases range={range} />}
      {tab === 'cash' && <CashReportView />}
      {tab === 'completed' && <Completed range={range} />}
    </div>
  );
}

export default function Page() {
  return (
    <React.Suspense>
      <View />
    </React.Suspense>
  );
}
