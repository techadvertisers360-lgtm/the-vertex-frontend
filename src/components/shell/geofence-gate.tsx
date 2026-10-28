'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, RefreshCw } from 'lucide-react';
import { ApiError, get, GEOFENCE_EVENT, post } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * Clinic location gate (D-062). For people the developer marked "Sirf clinic par chale" (while the geofence is on):
 * ask for location at sign-in and every 10 minutes; the server decides and grants a 15-minute on-site claim. Outside,
 * location denied or unavailable → the app is covered with "Yeh app sirf clinic par khulti hai" and a Retry button.
 * Any API answer GEOFENCE_REQUIRED (claim expired, switch just turned on) brings the gate back at once.
 */
const OUTSIDE = 'Yeh app sirf clinic par khulti hai';
const ASKED_KEY = 'vh-geo-explained';

type Status = { required: boolean; claimUntil: string | null; recheckMs: number };
type CheckResult = { ok: true; required: boolean } | { ok: false; message: string };
type State = { kind: 'idle' } | { kind: 'intro' } | { kind: 'checking' } | { kind: 'blocked'; message: string };

function readPosition(): Promise<{ latitude: number; longitude: number; accuracyM: number } | { error: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ error: 'unsupported' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (e) => resolve({ error: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  });
}

const explained = () => {
  try {
    return sessionStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
};

export function GeofenceGate() {
  const qc = useQueryClient();
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const required = React.useRef(false);
  const busy = React.useRef(false);

  const check = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => (s.kind === 'blocked' || s.kind === 'intro' ? { kind: 'checking' } : s));
    try {
      const fix = await readPosition();
      const r = await post<CheckResult>('/geofence/check', fix);
      if (r.ok) {
        required.current = r.required;
        setState({ kind: 'idle' });
        void qc.invalidateQueries(); // reload whatever was refused while off site
      } else setState({ kind: 'blocked', message: r.message });
    } catch (e) {
      setState({ kind: 'blocked', message: e instanceof ApiError ? e.message : `${OUTSIDE} — location check nahi ho saka. Dobara try karein.` });
    } finally {
      busy.current = false;
    }
  }, [qc]);

  // Explain once per tab before the browser's permission prompt; afterwards check straight away.
  const start = React.useCallback(() => {
    if (explained()) void check();
    else setState({ kind: 'intro' });
  }, [check]);

  const refresh = React.useCallback(async () => {
    try {
      const s = await get<Status>('/geofence/status');
      required.current = s.required;
      if (!s.required) return setState({ kind: 'idle' });
      const left = s.claimUntil ? new Date(s.claimUntil).getTime() - Date.now() : 0;
      if (left < 6 * 60_000) start(); // the 10-minute recheck keeps the 15-minute claim alive
    } catch {
      /* status unreachable: the next API call (or retry) decides */
    }
  }, [start]);

  React.useEffect(() => {
    void refresh();
    const every = window.setInterval(() => {
      if (required.current) void check();
      else void refresh();
    }, 10 * 60_000);
    const onRequired = () => {
      required.current = true;
      start();
    };
    window.addEventListener(GEOFENCE_EVENT, onRequired);
    return () => {
      window.clearInterval(every);
      window.removeEventListener(GEOFENCE_EVENT, onRequired);
    };
  }, [refresh, check, start]);

  if (state.kind === 'idle') return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="geo-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-overlay">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-light text-brand">
          <MapPin className="size-6" aria-hidden />
        </span>
        {state.kind === 'intro' ? (
          <>
            <h2 id="geo-title" className="mt-3 text-card-title text-ink">
              Clinic location check
            </h2>
            <p className="mt-2 text-dense text-muted">
              Aap ka account sirf clinic par chalta hai. Is liye app aap ki location dekhe gi — abhi aur har 10 minute baad. Location save nahi hoti; sirf yeh dekha jata hai ke aap clinic ke andar hain ya nahi.
            </p>
            <p className="mt-2 text-dense text-muted">Agla button dabane par browser location ki ijazat maange ga — &ldquo;Allow&rdquo; karein.</p>
            <Button
              className="mt-4 w-full"
              onClick={() => {
                try {
                  sessionStorage.setItem(ASKED_KEY, '1');
                } catch {
                  /* private mode: ask again next time */
                }
                void check();
              }}
            >
              Location share karein
            </Button>
          </>
        ) : state.kind === 'checking' ? (
          <>
            <h2 id="geo-title" className="mt-3 text-card-title text-ink">
              Location check ho rahi hai…
            </h2>
            <p className="mt-2 text-dense text-muted">Thora intezar karein.</p>
          </>
        ) : (
          <>
            <h2 id="geo-title" className="mt-3 text-card-title text-ink">
              {OUTSIDE}
            </h2>
            <p className="mt-2 text-dense text-muted">{state.message}</p>
            <Button className="mt-4 w-full" onClick={() => void check()}>
              <RefreshCw className="size-4" aria-hidden /> Retry
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
