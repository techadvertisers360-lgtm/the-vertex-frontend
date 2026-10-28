/**
 * API client. Same-origin `/api/*` (rewritten to the backend), cookies included, CSRF header always sent.
 * On 401 it refreshes the session once and retries; if that fails the app is signed out (spec §2).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export const NETWORK_MESSAGE = 'Network ya server se rabta nahi hua. Aap ka data mehfooz hai — dobara koshish karein.';

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  idempotencyKey?: string;
  /** internal: do not attempt refresh */
  noRefresh?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = path.startsWith('/api') ? path : `/api${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'x-vh-client': 'web' } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export const SESSION_EXPIRED_EVENT = 'vh:session-expired';

function signalExpired(code: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code } }));
}

/** A clinic-only user without a live on-site check (D-062): the location gate asks again. */
export const GEOFENCE_EVENT = 'vh:geofence-required';

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-vh-client': 'web' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      credentials: 'include',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return data as T;

  const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
  const code = err?.code ?? `HTTP_${res.status}`;
  if (res.status === 401 && !opts.noRefresh && !path.includes('/auth/')) {
    if (code === 'UNAUTHENTICATED' && (await refreshSession())) return api<T>(path, { ...opts, noRefresh: true });
    signalExpired(code);
  }
  if (res.status === 403 && code === 'GEOFENCE_REQUIRED' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GEOFENCE_EVENT));
  if (res.status >= 500 || res.status === 502 || res.status === 504) {
    throw new ApiError(res.status, code, err?.message ?? NETWORK_MESSAGE, err?.details);
  }
  throw new ApiError(res.status, code, err?.message ?? 'Kuch ghalat ho gaya.', err?.details);
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body?: unknown, idempotencyKey?: string) => api<T>(path, { method: 'POST', body: body ?? {}, idempotencyKey });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/**
 * Idempotency key that stays the same across retries of the *same* payload (network failure → retry is safe)
 * and changes when the payload changes (the server treats a reused key with a different body as an error).
 */
export function idempotencyFor() {
  let last: { hash: string; key: string } | null = null;
  return (payload: unknown) => {
    const hash = JSON.stringify(payload);
    if (!last || last.hash !== hash) last = { hash, key: crypto.randomUUID() };
    return last.key;
  };
}
