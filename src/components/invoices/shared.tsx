'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { INVOICE_PERMS } from '@/lib/invoice-types';
import { cn, formatRs } from '@/lib/utils';

/** Where this role's invoice pages live (each role's screens sit under its own home) and what it may do. */
export function useInvoiceAccess() {
  const { me } = useSession();
  const base = `${me.home}/invoices`;
  const can = (p: keyof typeof INVOICE_PERMS) => me.permissions.includes(INVOICE_PERMS[p]);
  /** Reception opens a patient inside its patient list; Manager and MD have a record page. */
  const patientHref = (patient: { id: string; phone: string }) => (me.user.role === 'RECEPTIONIST' ? `/reception/patients?id=${patient.id}` : `${me.home}/patients/${patient.id}`);
  return { base, can, patientHref };
}

/** The pages under Invoice. The left menu is one flat list, so these are tabs inside the Invoices page (D-084). */
export function InvoiceTabs() {
  const { base, can } = useInvoiceAccess();
  const pathname = usePathname();
  const tabs = [
    { href: base, label: 'Invoices', show: true },
    { href: `${base}/advances`, label: 'Advance Payments', show: can('advance') },
    { href: `${base}/payment-modes`, label: 'Payment Modes', show: can('settings') },
    { href: `${base}/categories`, label: 'Invoice Categories', show: can('settings') },
    { href: `${base}/settings`, label: 'Settings', show: can('settings') },
    { href: `${base}/history`, label: 'History', show: can('audit') },
  ].filter((t) => t.show);
  const sections = tabs.filter((t) => t.href !== base);
  const active = sections.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? base;
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Invoice pages" className="mb-4 flex gap-1 overflow-x-auto rounded-card border border-line bg-surface p-1 shadow-card print:hidden">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? 'page' : undefined}
          className={cn('inline-flex min-h-control shrink-0 items-center rounded-control px-3 text-dense font-semibold', active === t.href ? 'bg-brand text-on-brand' : 'text-muted hover:bg-brand-light hover:text-brand')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** A label and an amount in a totals box. */
export function MoneyRow({ label, paisa, strong, tone, text }: { label: string; paisa?: number; strong?: boolean; tone?: 'danger' | 'success'; text?: string }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'border-t border-line pt-1 text-card-title')}>
      <dt className={strong ? 'text-ink' : 'text-muted'}>{label}</dt>
      <dd className={cn(strong && 'text-ink', tone === 'danger' && 'font-semibold text-danger', tone === 'success' && 'text-success')}>{text ?? formatRs(paisa ?? 0)}</dd>
    </div>
  );
}

export const taxPercent = (bp: number | null) => (bp === null ? '' : `${bp / 100}%`);

export const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', BANK_ONLINE: 'Online transfer', CHEQUE: 'Cheque', ADVANCE: 'Advance' };

/** Previous / next and the rows-per-page choice under a list. */
export function Pager({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100] }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (s: number) => void; sizes?: number[] }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-dense text-muted print:hidden">
      <div className="flex items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-2">
            Rows
            <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="min-h-control rounded-control border border-line bg-surface px-2 text-ink">
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <span>
          {first}–{last} of {total.toLocaleString('en-PK')}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-control rounded-control border border-line bg-surface px-3 font-semibold text-brand disabled:opacity-40">
          Previous
        </button>
        <span>
          Page {page} of {pages.toLocaleString('en-PK')}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="min-h-control rounded-control border border-line bg-surface px-3 font-semibold text-brand disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}

/** Save a file the API returned. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
