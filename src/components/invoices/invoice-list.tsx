'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, downloadFile, get } from '@/lib/api';
import type { InvoiceList as ListData, InvoiceOptions, InvoiceRow } from '@/lib/invoice-types';
import { useRealtime } from '@/lib/realtime';
import { addDays, clinicDate, formatDate } from '@/lib/time';
import { cn, formatRs } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input, Select } from '@/components/ui/form';
import { ErrorState, LoadingRows, EmptyState } from '@/components/ui/states';
import { InvoiceTabs, Pager, saveBlob, useInvoiceAccess } from './shared';

const KIND_LABEL: Record<InvoiceRow['kind'], string> = { VISIT: 'Visit', COUNTER: 'Pharmacy', DIRECT: 'Direct' };

function Services({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-muted">—</span>;
  return (
    <ol className="list-inside list-decimal space-y-0.5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

function PatientCell({ r, href }: { r: InvoiceRow; href: (p: { id: string; phone: string }) => string }) {
  if (!r.patient) return <span>{r.buyerName ?? 'Walk-in'}</span>;
  return (
    <Link href={href(r.patient)} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-medium underline-offset-2 hover:underline">
      {r.patient.name}
    </Link>
  );
}

function NumberCell({ r }: { r: InvoiceRow }) {
  return (
    <span>
      <span className={cn('block whitespace-nowrap font-semibold', r.cancelled && 'text-muted line-through')}>{r.number}</span>
      {r.cancelled ? (
        <Chip tone="danger" className="mt-0.5">
          Cancelled
        </Chip>
      ) : (
        <span className="text-[12px] text-muted">{KIND_LABEL[r.kind]}</span>
      )}
    </span>
  );
}

function Balance({ r }: { r: InvoiceRow }) {
  return <span className={cn('whitespace-nowrap', r.balancePaisa > 0 && 'rounded-control bg-danger-bg px-1.5 py-0.5 font-semibold text-danger')}>{formatRs(r.balancePaisa)}</span>;
}

const tax = (r: InvoiceRow) => (r.taxPaisa === null ? 'N/A' : formatRs(r.taxPaisa));

function Rows({ rows, onOpen, patientHref, showDiscount }: { rows: InvoiceRow[]; onOpen: (r: InvoiceRow) => void; patientHref: (p: { id: string; phone: string }) => string; showDiscount: boolean }) {
  const money = 'whitespace-nowrap px-2 py-2.5 text-right align-top';
  const head = 'section-label whitespace-nowrap px-2 py-2 !text-muted';
  /** Balance stays in view when the table scrolls sideways on a narrower screen. */
  const pinned = 'sticky right-0 border-l border-line bg-surface';
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* Tablet and up: all columns, scrolling sideways inside the card when the screen is narrow. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-dense">
          <thead className="border-b border-line bg-canvas/60 text-left">
            <tr>
              <th scope="col" className={head}>ID</th>
              <th scope="col" className={head}>Date</th>
              <th scope="col" className={head}>Patient Name</th>
              <th scope="col" className={head}>Service(s)</th>
              <th scope="col" className={cn(head, 'text-right')}>Sub Total</th>
              {showDiscount && <th scope="col" className={cn(head, 'text-right')}>Discount</th>}
              <th scope="col" className={cn(head, 'text-right')}>Tax</th>
              <th scope="col" className={cn(head, 'text-right')}>Total</th>
              <th scope="col" className={cn(head, 'text-right')}>Paid</th>
              <th scope="col" className={cn(head, pinned, 'text-right')}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className={cn('cursor-pointer border-b border-line text-ink last:border-0 hover:bg-brand-light/60', r.cancelled && 'bg-canvas/60 text-muted')}>
                <td className="px-2 py-2.5 align-top"><NumberCell r={r} /></td>
                <td className="whitespace-nowrap px-2 py-2.5 align-top">{formatDate(`${r.date}T12:00:00+05:00`)}</td>
                <td className="px-2 py-2.5 align-top"><PatientCell r={r} href={patientHref} /></td>
                <td className="min-w-40 px-2 py-2.5 align-top"><Services items={r.services} /></td>
                <td className={money}>{formatRs(r.subtotalPaisa)}</td>
                {showDiscount && <td className={money}>{formatRs(r.discountPaisa ?? 0)}</td>}
                <td className={money}>{tax(r)}</td>
                <td className={cn(money, 'font-semibold')}>{formatRs(r.totalPaisa)}</td>
                <td className={money}>{formatRs(r.paidPaisa)}</td>
                <td className={cn(money, pinned)}><Balance r={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phone: one card per invoice. */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} onClick={() => onOpen(r)} className={cn('cursor-pointer space-y-2 px-4 py-3 text-dense', r.cancelled && 'bg-canvas/60')}>
            <div className="flex items-start justify-between gap-3">
              <NumberCell r={r} />
              <span className="whitespace-nowrap text-muted">{formatDate(`${r.date}T12:00:00+05:00`)}</span>
            </div>
            <PatientCell r={r} href={patientHref} />
            <Services items={r.services} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between gap-2"><dt className="text-muted">Sub Total</dt><dd>{formatRs(r.subtotalPaisa)}</dd></div>
              {showDiscount && <div className="flex justify-between gap-2"><dt className="text-muted">Discount</dt><dd>{formatRs(r.discountPaisa ?? 0)}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-muted">Tax</dt><dd>{tax(r)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Total</dt><dd className="font-semibold">{formatRs(r.totalPaisa)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Paid</dt><dd>{formatRs(r.paidPaisa)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Balance</dt><dd><Balance r={r} /></dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InvoiceListPage() {
  const router = useRouter();
  const { base, can, patientHref } = useInvoiceAccess();
  const { pollInterval } = useRealtime();
  const today = clinicDate();
  const [from, setFrom] = React.useState(addDays(today, -29));
  const [to, setTo] = React.useState(today);
  const [datesTouched, setDatesTouched] = React.useState(false);
  const [doctorId, setDoctorId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  // The server searches after typing pauses, so the list is not asked for on every key.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // A search with the default dates looks through every invoice, so an old one can still be found.
  const allDates = !!q && !datesTouched;
  const filters = { from: allDates ? undefined : from, to: allDates ? undefined : to, doctorId: doctorId || undefined, q: q || undefined };

  const list = useQuery({
    queryKey: ['invoices', 'list', filters, page, pageSize],
    queryFn: () => get<ListData>('/invoices', { ...filters, page, pageSize }),
    placeholderData: keepPreviousData,
    refetchInterval: pollInterval,
  });
  const options = useQuery({ queryKey: ['invoice-setup', 'options'], queryFn: () => get<InvoiceOptions>('/invoices/options'), enabled: can('create'), staleTime: 60_000 });
  const showDiscount = list.data ? list.data.items.some((r) => r.discountPaisa !== undefined) || list.data.items.length === 0 : true;

  const exporter = useMutation({
    mutationFn: async (kind: 'export.xlsx' | 'export.pdf' | 'export-all.csv') => {
      const query = kind === 'export-all.csv' ? undefined : filters;
      const blob = await downloadFile(`/invoices/${kind}`, query);
      saveBlob(blob, kind === 'export-all.csv' ? `all-invoices-${today}.csv` : `invoices-${today}.${kind.split('.')[1]}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Download nahi hua, dobara koshish karein.'),
  });
  const setDate = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setDatesTouched(true);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        label="Billing"
        title="Invoices"
        actions={
          <>
            {can('export') && (
              <>
                <Button variant="secondary" loading={exporter.isPending && exporter.variables === 'export.xlsx'} disabled={exporter.isPending} onClick={() => exporter.mutate('export.xlsx')}>
                  <FileSpreadsheet className="size-4" aria-hidden /> Export to Excel
                </Button>
                <Button variant="secondary" loading={exporter.isPending && exporter.variables === 'export.pdf'} disabled={exporter.isPending} onClick={() => exporter.mutate('export.pdf')}>
                  <FileText className="size-4" aria-hidden /> Export to PDF
                </Button>
              </>
            )}
            {can('exportAll') && (
              <Button variant="secondary" loading={exporter.isPending && exporter.variables === 'export-all.csv'} disabled={exporter.isPending} onClick={() => exporter.mutate('export-all.csv')}>
                <Download className="size-4" aria-hidden /> Download all
              </Button>
            )}
            {can('create') && (
              <Link href={`${base}/new`} className={buttonVariants()}>
                <Plus className="size-4" aria-hidden /> Add Invoice
              </Link>
            )}
          </>
        }
      />
      <InvoiceTabs />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total invoices" value={list.data ? list.data.cards.totalInvoices.toLocaleString('en-PK') : '—'} />
        <StatTile label="Today's invoices" value={list.data ? list.data.cards.todayInvoices.toLocaleString('en-PK') : '—'} />
        <StatTile label="This week's invoices" value={list.data ? list.data.cards.weekInvoices.toLocaleString('en-PK') : '—'} />
      </div>
      {list.data?.totals && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile accent="leadership" label="Billed (filtered)" value={formatRs(list.data.totals.totalPaisa)} />
          <StatTile accent="leadership" label="Paid (filtered)" value={formatRs(list.data.totals.paidPaisa)} />
          <StatTile accent="leadership" label="Balance (filtered)" value={formatRs(list.data.totals.balancePaisa)} />
          {list.data.totals.discountPaisa !== undefined && <StatTile accent="leadership" label="Discounts (filtered)" value={formatRs(list.data.totals.discountPaisa)} />}
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From" htmlFor="inv-from">
          <Input id="inv-from" type="date" max={to} value={from} onChange={setDate(setFrom)} />
        </Field>
        <Field label="To" htmlFor="inv-to">
          <Input id="inv-to" type="date" min={from} max={today} value={to} onChange={setDate(setTo)} />
        </Field>
        <Field label="Doctor" htmlFor="inv-doctor">
          <Select
            id="inv-doctor"
            value={doctorId}
            onChange={(e) => {
              setDoctorId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Doctors</option>
            {(options.data?.doctors ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search" htmlFor="inv-search" hint={allDates ? 'Sab dates mein dhoond rahe hain.' : undefined}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input id="inv-search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice ID, naam ya phone" />
          </div>
        </Field>
      </div>

      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Koi invoice nahi mili" hint="Dates ya search badal kar dekhein." />
      ) : (
        <>
          <div className={cn(list.isPlaceholderData && 'opacity-60')}>
            <Rows rows={list.data.items} onOpen={(r) => router.push(`${base}/${r.id}`)} patientHref={patientHref} showDiscount={showDiscount} />
          </div>
          <Pager
            page={page}
            pageSize={pageSize}
            total={list.data.total}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
