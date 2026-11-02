'use client';
import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import type { AuditItem } from '@/lib/invoice-types';
import { formatDateTime } from '@/lib/time';
import { titleCase } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryState } from '@/components/ui/states';
import { Pager } from './shared';

interface AuditPage {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Who did what and when, with the old and new values. One invoice's history, or all billing history (MD). */
export function AuditList({ invoiceId }: { invoiceId?: string }) {
  const [page, setPage] = React.useState(1);
  const q = useQuery({
    queryKey: ['invoices', 'audit', invoiceId ?? 'all', page],
    queryFn: () => get<AuditPage>(invoiceId ? `/invoices/${invoiceId}/history` : '/invoices/audit-log', { page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card className="print:hidden">
      {invoiceId && (
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
      )}
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi record nahi">
        {(d) => (
          <>
            <ul className="divide-y divide-line text-dense">
              {d.items.map((a) => (
                <li key={a.id} className="py-2">
                  <p className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-ink">{titleCase(a.action.replace(/_/g, ' '))}</span>
                    <span className="text-muted">
                      {a.actorName ?? 'System'} · {formatDateTime(a.at)}
                    </span>
                  </p>
                  {a.reason && <p className="text-muted">Wajah: {a.reason}</p>}
                  {(a.before !== null || a.after !== null) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-brand-medium">Purani aur nayi values</summary>
                      <div className="mt-1 grid gap-2 md:grid-cols-2">
                        <pre className="overflow-x-auto rounded-control bg-canvas p-2 text-[12px]">{a.before === null ? 'Pehle kuch nahi' : json(a.before)}</pre>
                        <pre className="overflow-x-auto rounded-control bg-canvas p-2 text-[12px]">{a.after === null ? '—' : json(a.after)}</pre>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  );
}
