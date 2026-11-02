'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { get } from '@/lib/api';
import type { InvoicePrintData } from '@/lib/invoice-types';
import { formatDate, formatDateTime } from '@/lib/time';
import { cn, formatPhone, formatRs } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { QueryState } from '@/components/ui/states';
import { METHOD_LABEL, taxPercent, useInvoiceAccess } from './shared';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'border-t border-ink pt-1 font-bold')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Printable invoice: A4, or a small thermal receipt 80 mm wide. Only this part of the screen prints. */
export function InvoicePrintPage({ id }: { id: string }) {
  const { base } = useInvoiceAccess();
  const size = useSearchParams().get('size') === 'thermal' ? 'thermal' : 'a4';
  const q = useQuery({ queryKey: ['invoice', id, 'print'], queryFn: () => get<InvoicePrintData>(`/invoices/${id}/print`) });
  const thermal = size === 'thermal';
  return (
    <div>
      <style>{`@media print { @page { size: ${thermal ? '80mm auto' : 'A4'}; margin: ${thermal ? '3mm' : '15mm'}; } }`}</style>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link href={`${base}/${id}`} className={buttonVariants({ variant: 'secondary' })}>
          Wapas
        </Link>
        <Link href={`${base}/${id}/print?size=a4`} className={buttonVariants({ variant: thermal ? 'secondary' : 'primary' })}>
          A4
        </Link>
        <Link href={`${base}/${id}/print?size=thermal`} className={buttonVariants({ variant: thermal ? 'primary' : 'secondary' })}>
          Thermal receipt
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Print
        </Button>
      </div>
      <QueryState query={q}>
        {({ invoice: inv, clinic }) => {
          const who = inv.patient?.name ?? inv.buyerName ?? 'Walk-in';
          const phone = inv.patient?.phone ?? inv.buyerPhone;
          const lines = inv.lines.filter((l) => !l.reversed && !l.reversesLineId);
          return (
            <article
              data-testid="invoice-print"
              className={cn('bg-surface text-ink print:shadow-none', thermal ? 'mx-auto w-[72mm] border border-line p-2 text-[11px] leading-snug print:border-0 print:p-0' : 'mx-auto max-w-[210mm] rounded-card border border-line p-8 text-body print:rounded-none print:border-0 print:p-0')}
            >
              <header className={cn('border-b border-ink pb-2', thermal ? 'text-center' : 'flex items-center justify-between gap-4')}>
                <div className={cn('flex items-center gap-3', thermal && 'flex-col gap-1')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small stored image, printed as is */}
                  {clinic.logoDataUrl && <img src={clinic.logoDataUrl} alt="" className={thermal ? 'max-h-10' : 'max-h-16'} />}
                  <p className={cn('font-bold', thermal ? 'text-[13px]' : 'text-title')}>{clinic.name}</p>
                </div>
                <div className={thermal ? 'mt-1' : 'text-right'}>
                  <p className="font-bold">Invoice {inv.number}</p>
                  <p>{formatDate(`${inv.date}T12:00:00+05:00`)}</p>
                </div>
              </header>

              {inv.cancelled && <p className="my-2 border-2 border-danger p-1 text-center font-bold text-danger">CANCELLED{inv.cancelReason ? `: ${inv.cancelReason}` : ''}</p>}

              <dl className={cn('my-2', !thermal && 'grid grid-cols-2 gap-2')}>
                <div>
                  <dt className="inline font-semibold">Patient: </dt>
                  <dd className="inline">
                    {who}
                    {phone ? ` · ${formatPhone(phone)}` : ''}
                  </dd>
                </div>
                {inv.doctor && (
                  <div>
                    <dt className="inline font-semibold">Doctor: </dt>
                    <dd className="inline">{inv.doctor.name}</dd>
                  </div>
                )}
              </dl>

              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink text-left">
                    <th className="py-1 pr-2 font-semibold">#</th>
                    <th className="py-1 pr-2 font-semibold">Service</th>
                    <th className="py-1 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-line align-top">
                      <td className="py-1 pr-2">{i + 1}</td>
                      <td className="py-1 pr-2">
                        {l.description}
                        {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                      </td>
                      <td className="whitespace-nowrap py-1 text-right">{formatRs(l.lineTotalPaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className={cn('mt-2 space-y-0.5', !thermal && 'ml-auto max-w-xs')}>
                <Row label="Sub Total" value={formatRs(inv.subtotalPaisa)} />
                {!!inv.discountPaisa && <Row label="Discount" value={`− ${formatRs(inv.discountPaisa)}`} />}
                {inv.taxRateBp !== null && <Row label={`Tax included (${taxPercent(inv.taxRateBp)})`} value={formatRs(inv.taxPaisa)} />}
                <Row label="Total" value={formatRs(inv.totalPaisa)} strong />
                <Row label="Paid" value={formatRs(inv.paidPaisa)} />
                <Row label="Balance" value={formatRs(inv.balancePaisa)} strong />
              </dl>

              {inv.payments.length > 0 && (
                <ul className={cn('mt-2 space-y-0.5 border-t border-line pt-1', thermal ? 'text-[10px]' : 'text-dense')}>
                  {inv.payments.map((p) => (
                    <li key={p.id}>
                      {p.receiptNo} · {p.reversesPaymentId ? (p.method === 'ADVANCE' ? 'Advance mein gaya' : 'Wapsi') : (p.modeName ?? METHOD_LABEL[p.method])} · {formatRs(p.amountPaisa)} · {formatDateTime(p.receivedAt)}
                      {p.cashierName ? ` · ${p.cashierName}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-center">Shukriya</p>
            </article>
          );
        }}
      </QueryState>
    </div>
  );
}
