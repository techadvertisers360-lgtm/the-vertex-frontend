'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** hide on small screens */
  hideSm?: boolean;
}

/** Dense data table that turns into stacked cards on mobile. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, selectedKey }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; selectedKey?: string }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <table className="hidden w-full text-dense md:table">
        <thead className="border-b border-line bg-canvas/60 text-left">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('section-label px-3 py-2 !text-muted', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-brand-light/60', selectedKey === k && 'bg-brand-light')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2.5 align-middle text-ink', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('space-y-1 px-4 py-3', onRowClick && 'active:bg-brand-light')}>
            {columns
              .filter((c) => !c.hideSm)
              .map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 text-dense">
                  <span className="text-muted">{c.header}</span>
                  <span className="text-right text-ink">{c.cell(r)}</span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal filter row above lists. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end [&>*]:lg:min-w-44">{children}</div>;
}

/** Simple segmented tabs with counts. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-card border border-line bg-surface p-1 shadow-card">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-control shrink-0 items-center gap-2 rounded-control px-3 text-dense font-semibold',
            value === o.value ? 'bg-brand text-on-brand' : 'text-muted hover:bg-brand-light hover:text-brand',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-[11px]', value === o.value ? 'bg-on-brand/20' : 'bg-canvas text-ink')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
