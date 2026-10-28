'use client';
import * as React from 'react';
import { AlertTriangle, Inbox, Lock, WifiOff } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from './button';
import { cn } from '@/lib/utils';

/** Spec §24 wording (Roman Urdu kept verbatim). */
export const MESSAGES = {
  noRecordToday: 'Aaj koi record nahi',
  noTask: 'Aaj koi task nahi',
  noData: 'Koi record nahi mila',
  permissionDenied: 'Aap ko is screen ki ijazat nahi hai.',
  messageFailed: 'Message pending/failed',
  prescriptionRequired: 'Prescription upload required',
  roomClosing: 'Pehle room closing complete karein',
  sessionExpired: 'Session expire ho gaya. Dobara sign in karein.',
  accountDisabled: 'Aap ka account disable hai. Clinic admin se rabta karein.',
} as const;

export function EmptyState({ title = MESSAGES.noRecordToday, hint, action, className }: { title?: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center', className)}>
      <Inbox className="size-8 text-brand-medium" aria-hidden />
      <p className="text-card-title text-ink">{title}</p>
      {hint && <p className="max-w-md text-dense text-muted">{hint}</p>}
      {action}
    </div>
  );
}

/** Error with retry. Network errors keep the user's entered data (forms are never reset on failure). */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = error instanceof ApiError ? error : null;
  const forbidden = e?.status === 403;
  const network = e?.isNetwork || (e && e.status >= 500);
  const Icon = forbidden ? Lock : network ? WifiOff : AlertTriangle;
  const message = forbidden ? MESSAGES.permissionDenied : (e?.message ?? 'Kuch ghalat ho gaya.');
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 rounded-card border border-danger/30 bg-danger-bg px-6 py-8 text-center', className)}>
      <Icon className="size-7 text-danger" aria-hidden />
      <p className="text-body font-semibold text-danger">{message}</p>
      {!forbidden && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Dobara koshish karein
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-control bg-line/70', className)} />;
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

/** Render loading / error / empty / data for a query in one place. */
export function QueryState<T>({
  query,
  empty,
  emptyTitle,
  emptyHint,
  emptyAction,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  empty?: (d: T) => boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  children: (d: T) => React.ReactNode;
}) {
  if (query.isPending) return <LoadingRows />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data as T;
  if (empty?.(d)) return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  return <>{children(d)}</>;
}
