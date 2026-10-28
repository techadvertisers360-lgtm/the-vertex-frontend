'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, SESSION_EXPIRED_EVENT } from './api';

/**
 * Live updates for one signed-in tab (D-024 / D-042). Two transports behind the same interface:
 *   socketio — local API process; the handshake uses the session cookie (default)
 *   supabase — Vercel; Supabase Realtime Broadcast on the user's PRIVATE channel `user:<id>`, joined with a
 *              short-lived token from GET /api/realtime/token (session-checked, refreshed before expiry)
 * Incoming events invalidate the relevant queries; urgent notifications raise a toast. While not connected,
 * `connected` is false and live screens poll every 30 s instead.
 */
export const POLL_FALLBACK_MS = 30_000;

interface RealtimeValue {
  connected: boolean;
  /** use as TanStack Query `refetchInterval` for live screens */
  pollInterval: number | false;
}

const RealtimeContext = React.createContext<RealtimeValue>({ connected: false, pollInterval: POLL_FALLBACK_MS });

export const useRealtime = () => React.useContext(RealtimeContext);

export interface LiveNotification {
  id: string;
  subject: string;
  body: string | null;
  senderLabel: string;
  recordType: string | null;
  recordId: string | null;
  urgent: boolean;
}

interface Handlers {
  onStatus: (connected: boolean) => void;
  onEvent: (event: string, payload: unknown) => void;
  /** the session is gone — let the app sign the user out */
  onRevoked: (reason?: string) => void;
}

type Transport = (h: Handlers) => () => void;

const socketTransport: Transport = (h) => {
  let closed = false;
  let cleanup = () => {};
  void import('socket.io-client').then(({ io }) => {
    if (closed) return;
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    const socket = io(url, { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
    socket.on('connect', () => h.onStatus(true));
    socket.on('disconnect', () => h.onStatus(false));
    socket.on('connect_error', (err) => {
      h.onStatus(false);
      // Access token may simply have expired; a REST call refreshes it and the socket retries.
      if (err.message === 'UNAUTHENTICATED') h.onEvent('me:refresh', null);
    });
    socket.onAny((event: string, payload: unknown) => h.onEvent(event, payload));
    cleanup = () => {
      socket.removeAllListeners();
      socket.close();
    };
  });
  return () => {
    closed = true;
    cleanup();
  };
};

interface RealtimeToken {
  provider: 'supabase' | 'socketio';
  token?: string;
  topic?: string;
  expiresAt?: string;
}

const supabaseTransport: Transport = (h) => {
  let closed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let teardown = () => {};

  const fetchToken = () => get<RealtimeToken>('/realtime/token');

  async function start() {
    try {
      const [{ createClient }, first] = await Promise.all([import('@supabase/supabase-js'), fetchToken()]);
      if (closed) return;
      if (first.provider !== 'supabase' || !first.token || !first.topic) throw new Error('Server is not in Supabase realtime mode');
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      await client.realtime.setAuth(first.token);
      const channel = client.channel(first.topic, { config: { private: true } });
      channel.on('broadcast', { event: '*' }, (m: { event: string; payload: unknown }) => h.onEvent(m.event, m.payload));
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') h.onStatus(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          h.onStatus(false);
          if (!closed) retry();
        }
      });
      // Renew the token a minute before it expires; a refused renewal means the session ended.
      const schedule = (expiresAt?: string) => {
        const ms = expiresAt ? Math.max(15_000, new Date(expiresAt).getTime() - Date.now() - 60_000) : 240_000;
        refreshTimer = setTimeout(async () => {
          try {
            const t = await fetchToken();
            if (t.token) await client.realtime.setAuth(t.token);
            schedule(t.expiresAt);
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) h.onRevoked(e.code);
            else {
              h.onStatus(false);
              retry();
            }
          }
        }, ms);
      };
      schedule(first.expiresAt);
      teardown = () => {
        void client.removeChannel(channel);
        void client.realtime.disconnect();
      };
    } catch (e) {
      h.onStatus(false);
      if (e instanceof ApiError && e.status === 401) return; // signed out; the API layer handles redirect
      retry();
    }
  }

  function retry() {
    teardown();
    teardown = () => {};
    clearTimeout(refreshTimer);
    clearTimeout(retryTimer);
    if (!closed) retryTimer = setTimeout(() => void start(), POLL_FALLBACK_MS);
  }

  void start();
  return () => {
    closed = true;
    clearTimeout(refreshTimer);
    clearTimeout(retryTimer);
    teardown();
  };
};

const TRANSPORT: Transport = process.env.NEXT_PUBLIC_REALTIME_PROVIDER === 'supabase' ? supabaseTransport : socketTransport;

export function RealtimeProvider({ children, onOpenRecord }: { children: React.ReactNode; onOpenRecord?: (n: LiveNotification) => void }) {
  const qc = useQueryClient();
  const [connected, setConnected] = React.useState(false);
  const openRef = React.useRef(onOpenRecord);
  openRef.current = onOpenRecord;

  React.useEffect(() => {
    const revoke = (reason?: string) =>
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: reason === 'ACCOUNT_DISABLED' ? 'ACCOUNT_DISABLED' : 'UNAUTHENTICATED' } }));
    return TRANSPORT({
      onStatus: (up) => {
        setConnected(up);
        // Catch up on anything missed while offline.
        if (up) void qc.invalidateQueries({ queryKey: ['notifications'] });
      },
      onRevoked: revoke,
      onEvent: (event, payload) => {
        if (event === 'me:refresh') void qc.invalidateQueries({ queryKey: ['me'] });
        else if (event === 'notification:new') {
          const n = payload as LiveNotification;
          void qc.invalidateQueries({ queryKey: ['notifications'] });
          if (n.urgent) {
            toast.error(n.subject, {
              description: n.body ?? `From ${n.senderLabel}`,
              duration: 12_000,
              action: openRef.current ? { label: 'Open', onClick: () => openRef.current?.(n) } : undefined,
            });
          } else {
            toast(n.subject, { description: n.body ?? undefined, duration: 5_000 });
          }
        } else if (event === 'appointment:updated' || event === 'queue:changed' || event === 'tracker:changed') {
          void qc.invalidateQueries({ queryKey: [event.split(':')[0]] });
        } else if (event === 'session:revoked') {
          revoke((payload as { reason?: string } | null)?.reason);
        }
      },
    });
  }, [qc]);

  const value = React.useMemo(() => ({ connected, pollInterval: connected ? (false as const) : POLL_FALLBACK_MS }), [connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
