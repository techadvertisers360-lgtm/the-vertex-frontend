'use client';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, get, post, SESSION_EXPIRED_EVENT } from './api';
import { forgetDeviceOnSignOut } from './push';
import type { Me } from './types';

interface SessionValue {
  me: Me;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = React.useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export const meQueryKey = ['me'] as const;

/**
 * Loads the signed-in user (role, nav, home) from the server. When the session expires or the account is
 * disabled, all cached data is cleared and the user is sent to sign-in with a clear message (spec §2).
 */
export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const q = useQuery({ queryKey: meQueryKey, queryFn: () => get<Me>('/me'), retry: false, staleTime: 60_000 });
  // While the user is deliberately signing out, in-flight requests may get 401 — that is not an "expired" session.
  const signingOut = React.useRef(false);

  const expire = React.useCallback(
    (code = 'UNAUTHENTICATED') => {
      if (signingOut.current) return;
      qc.clear();
      const reason = code === 'ACCOUNT_DISABLED' ? 'disabled' : 'expired';
      router.replace(`/login?reason=${reason}&next=${encodeURIComponent(pathname)}`);
    },
    [qc, router, pathname],
  );

  React.useEffect(() => {
    const onExpired = (e: Event) => expire((e as CustomEvent<{ code: string }>).detail?.code);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [expire]);

  React.useEffect(() => {
    if (q.error instanceof ApiError && q.error.status === 401) expire(q.error.code);
  }, [q.error, expire]);

  const signOut = React.useCallback(async () => {
    signingOut.current = true;
    await forgetDeviceOnSignOut(); // this phone stops getting this person's notifications
    await post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.replace('/login?reason=signed-out');
  }, [qc, router]);

  if (!q.data) return <>{fallback}</>;
  return <SessionContext.Provider value={{ me: q.data, signOut }}>{children}</SessionContext.Provider>;
}
