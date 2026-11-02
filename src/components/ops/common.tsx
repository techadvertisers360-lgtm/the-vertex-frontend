'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { clinicDate } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Input, Field, Notice } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';

/** Shared parts of the clinic operations screens (D-089). */

export const OPS_KEY = 'ops';

export function useOps<T>(path: string, fn: () => Promise<T>, enabled = true) {
  return useQuery({ queryKey: [OPS_KEY, path], queryFn: fn, enabled });
}

/** A save: refreshes every operations screen, reports success, and leaves the form as it is if it fails. */
export function useAct<V>(fn: (v: V) => Promise<unknown>, done?: string, after?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [OPS_KEY] });
      if (done) toast.success(done);
      after?.();
    },
  });
}

export function ActError({ error }: { error: unknown }) {
  if (!error) return null;
  return <Notice>{error instanceof ApiError ? error.message : 'Save nahi hua. Dobara koshish karein.'}</Notice>;
}

export function Loaded<T>({ q, children, empty, emptyTitle = 'Koi record nahi mila' }: { q: UseQueryResult<T>; children: (d: T) => React.ReactNode; empty?: (d: T) => boolean; emptyTitle?: string }) {
  if (q.isPending) return <LoadingRows rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (empty?.(q.data)) return <EmptyState title={emptyTitle} />;
  return <>{children(q.data)}</>;
}

export const thisMonth = () => clinicDate().slice(0, 7);

export function MonthField({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="max-w-xs">
      <Field label="Mahina" htmlFor="ops-month">
        <Input id="ops-month" type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </Field>
    </div>
  );
}

export function useDebounced(text: string) {
  const [v, setV] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setV(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  return v;
}

/** 12.5 → 1250 basis points, read the same way as money so no float is stored. */
export function percentToBp(s: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return bp <= 10_000 ? bp : null;
}
export const bpText = (bp: number) => `${bp / 100}%`;

/** Rows as tab-separated text, which pastes straight into Excel. Amounts are plain rupees so Excel can add them. */
export function CopyForExcel({ rows }: { rows: (string | number | null)[][] }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="print:hidden"
      onClick={() => {
        const text = rows.map((r) => r.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
        void navigator.clipboard.writeText(text).then(
          () => toast.success('Copy ho gaya: Excel mein paste karein'),
          () => toast.error('Copy nahi hua. Browser ko ijazat dein.'),
        );
      }}
    >
      Copy for Excel
    </Button>
  );
}
export const rupees = (paisa: number | null | undefined) => (paisa === null || paisa === undefined ? '' : paisa / 100);
