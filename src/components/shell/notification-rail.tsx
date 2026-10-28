'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, X } from 'lucide-react';
import { get, post } from '@/lib/api';
import { recordHref } from '@/lib/links';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import type { Notification } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';

type Filter = 'unread' | 'all';
interface NotificationsPage {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

/** Live unread count for the header badge (shares the cache with the rail). */
export function useUnreadCount(): number {
  const { pollInterval } = useRealtime();
  const q = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => get<NotificationsPage>('/notifications', { filter: 'unread', limit: 30 }),
    refetchInterval: pollInterval,
  });
  return q.data?.unreadCount ?? 0;
}

/**
 * Right notification rail (spec §3): sender, date/time, subject, status and action; click opens the source
 * record and marks it read. The read/unread filter is applied by the API query (spec §22).
 */
export function NotificationRail({ onClose }: { onClose?: () => void }) {
  const [filter, setFilter] = React.useState<Filter>('unread');
  const { me } = useSession();
  const { pollInterval, connected } = useRealtime();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => get<NotificationsPage>('/notifications', { filter, limit: 30 }),
    refetchInterval: pollInterval,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = recordHref(me.user.role, n.recordType, n.recordId);
    if (href) {
      router.push(href);
      onClose?.();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="section-label">Notifications</p>
          <p className="text-dense text-muted">
            {connected ? 'Live' : 'Offline — har 30 sec refresh'}
            {q.data ? ` · ${q.data.unreadCount} unread` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={!q.data?.unreadCount} loading={markAll.isPending} title="Mark all read">
            <CheckCheck className="size-4" />
            <span className="sr-only sm:not-sr-only">Sab read</span>
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close notifications">
              <X className="size-5" />
            </Button>
          )}
        </div>
      </div>
      <div className="px-3 pt-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'unread', label: 'Unread', count: q.data?.unreadCount },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {q.isPending ? (
          <LoadingRows rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <p className="px-2 py-8 text-center text-dense text-muted">{filter === 'unread' ? 'Koi unread notification nahi.' : 'Koi notification nahi.'}</p>
        ) : (
          <ul className="space-y-2">
            {q.data.items.map((n) => {
              const href = recordHref(me.user.role, n.recordType, n.recordId);
              return (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={cn(
                      'w-full rounded-card border border-line bg-surface p-3 text-left shadow-card transition-colors hover:bg-brand-light',
                      !n.readAt && 'border-l-[length:var(--spacing-accent)] border-l-brand-medium',
                      n.priority >= 2 && !n.readAt && 'border-l-danger',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-dense text-ink', !n.readAt && 'font-semibold')}>{n.subject}</p>
                      <Chip tone={n.readAt ? 'neutral' : n.priority >= 2 ? 'danger' : 'brand'}>{n.readAt ? 'Read' : n.priority >= 2 ? 'Urgent' : 'New'}</Chip>
                    </div>
                    {n.body && <p className="mt-1 line-clamp-2 text-dense text-muted">{n.body}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-muted">
                      <span>
                        {n.senderLabel} · <time title={formatDateTime(n.createdAt)}>{relativeFromNow(n.createdAt)}</time>
                      </span>
                      {href && <span className="font-semibold text-brand-medium">{n.actionLabel ?? 'Open'} →</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
