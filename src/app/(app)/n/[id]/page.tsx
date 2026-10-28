'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { recordHref } from '@/lib/links';
import { useSession } from '@/lib/session';

/**
 * Where a tapped phone notification lands (D-046): marks it read and opens its exact record for this user's role
 * (e.g. the Doctor's queue item), or the home screen when it has none.
 */
export default function NotificationRedirect() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  React.useEffect(() => {
    let gone = false;
    void (async () => {
      let href: string | null = null;
      try {
        const n = await get<{ id: string; recordType: string | null; recordId: string | null }>(`/notifications/${id}`);
        href = recordHref(me.user.role, n.recordType, n.recordId);
        await post(`/notifications/${id}/read`).catch(() => undefined);
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      } catch {
        /* not mine / gone — go home */
      }
      if (!gone) router.replace(href ?? me.home);
    })();
    return () => {
      gone = true;
    };
  }, [id, me.user.role, me.home, router, qc]);
  return <p className="text-dense text-muted">Khul raha hai…</p>;
}
