'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, Send, Share, Smartphone } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { disablePush, enablePush, currentSubscription, offOnThisDevice, pushConfig, pushSupport, resyncPush, type PushSupport } from '@/lib/push';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/form';
import { InstallApp } from '@/components/install-app';

/** Phone notifications (D-046): the ask after sign-in, and the per-device switch in the profile. */

const LATER_KEY = 'vh-push-later';
const LATER_MS = 3 * 86_400_000;

const EXPLAIN = 'WhatsApp ki tarah phone par foran alert milega — jaise "Patient waiting", approvals aur zaroori kaam — chahe app band ho ya phone lock ho.';

function blockedHelp(ios: boolean) {
  return ios
    ? 'Notifications band hain. iPhone Settings → Notifications → The Vertex Health → Allow Notifications on karein.'
    : 'Notifications browser mein block hain. Address bar ke 🔒 / ⓘ icon → Notifications → Allow karein, phir page refresh karein.';
}

function laterRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(LATER_KEY) ?? 0) < LATER_MS;
  } catch {
    return false;
  }
}

/** Shown in the app after sign-in until notifications are on (or "Baad mein" for 3 days). */
export function NotificationPrompt() {
  const { me } = useSession();
  const qc = useQueryClient();
  const [support, setSupport] = React.useState<PushSupport | null>(null);
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const cfg = useQuery({ queryKey: ['push', 'config'], queryFn: pushConfig, staleTime: 300_000, enabled: !me.viewAs });

  React.useEffect(() => {
    if (me.viewAs) return;
    const s = pushSupport();
    setSupport(s);
    void resyncPush(); // this device already allowed: make sure it is registered for whoever is signed in now
    const ask = s === 'supported' ? Notification.permission === 'default' : s === 'ios-needs-install';
    setShow(ask && !offOnThisDevice() && !laterRecently());
  }, [me.viewAs, me.user.id]);

  if (me.viewAs || !show || !cfg.data?.enabled) return null;

  const later = () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {
      /* fine */
    }
    setShow(false);
  };

  if (support === 'ios-needs-install')
    return (
      <div className="mb-4">
        <Notice
          tone="info"
          action={
            <span className="flex gap-2">
              <Button size="sm" asChild>
                <Link href="/account/notifications">Tareeqa dekhein</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={later}>
                Baad mein
              </Button>
            </span>
          }
        >
          <b>iPhone par phone notifications</b> ke liye pehle app ko Home Screen par add karein (Safari → <Share className="inline size-4 align-text-bottom" aria-label="Share" /> Share → Add to Home
          Screen), phir wahan se app khol kar notifications on karein.
        </Notice>
      </div>
    );

  return (
    <div className="mb-4">
      <Notice
        tone="info"
        action={
          <span className="flex gap-2">
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await enablePush();
                  if (r === 'granted') toast.success('Notifications on ho gayi ✅');
                  else toast.error(blockedHelp(false));
                  setShow(false);
                  void qc.invalidateQueries({ queryKey: ['push'] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Notifications on nahi huin');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <BellRing className="size-4" /> On karein
            </Button>
            <Button size="sm" variant="ghost" onClick={later}>
              Baad mein
            </Button>
          </span>
        }
      >
        <b>Phone notifications on karein?</b> {EXPLAIN}
      </Notice>
    </div>
  );
}

/** "Notifications on this device" switch, test button and install steps (profile page). */
export function PushSettings() {
  const qc = useQueryClient();
  const [support, setSupport] = React.useState<PushSupport | null>(null);
  const [on, setOn] = React.useState<boolean | null>(null);
  const [permission, setPermission] = React.useState<NotificationPermission | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const cfg = useQuery({ queryKey: ['push', 'config'], queryFn: pushConfig, staleTime: 60_000 });

  const refresh = React.useCallback(async () => {
    const s = pushSupport();
    setSupport(s);
    if (s !== 'supported') return setOn(false);
    setPermission(Notification.permission);
    setOn(Notification.permission === 'granted' && !!(await currentSubscription()) && !offOnThisDevice());
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        toast.success('Is device par notifications band');
      } else {
        const r = await enablePush();
        if (r === 'granted') toast.success('Notifications on ho gayi ✅');
        else toast.error(blockedHelp(ios));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nahi hua — dobara koshish karein');
    } finally {
      setBusy(false);
      await refresh();
      void qc.invalidateQueries({ queryKey: ['push'] });
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await post<{ sent: number; failed: number; devices: number }>('/push/test');
      if (r.sent) toast.success(`Test notification bheji — ${r.sent} device${r.sent > 1 ? 's' : ''}. Phone check karein.`);
      else toast.error('Koi device notification nahi le saka — pehle is device par notifications on karein.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Test nahi bheja ja saka');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-light text-brand">
            <BellRing className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink">Notifications on this device</p>
            <p className="text-dense text-muted">{EXPLAIN}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!on}
            aria-label="Notifications on this device"
            disabled={busy || on === null || support !== 'supported' || !cfg.data?.enabled}
            onClick={() => void toggle()}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 size-6 rounded-full bg-surface shadow-card transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {cfg.data && !cfg.data.enabled && <Notice tone="warning">Phone notifications abhi server par set nahi — Developer se rabta karein.</Notice>}
          {support === 'unsupported' && <Notice tone="warning">Yeh browser phone notifications support nahi karta. Chrome (Android) ya Safari (iPhone, app install kar ke) use karein.</Notice>}
          {permission === 'denied' && <Notice tone="warning">{blockedHelp(ios)}</Notice>}
          {cfg.data && (
            <p className="text-dense text-muted">
              Aap ke account par {cfg.data.devices} device{cfg.data.devices === 1 ? '' : 's'} notifications le rahe hain.
            </p>
          )}
          <Button size="sm" variant="secondary" loading={testing} disabled={!cfg.data?.enabled} onClick={() => void test()}>
            <Send className="size-4" /> Send test notification
          </Button>
        </div>
      </div>

      {support === 'ios-needs-install' && (
        <Notice tone="info">
          <span className="flex items-start gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <b>iPhone / iPad:</b> notifications sirf Home Screen wali app mein aati hain (iOS 16.4 ya naya). Safari mein <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>, phir Home
              Screen se <b>The Vertex Health</b> khol kar yahan switch on karein.
            </span>
          </span>
        </Notice>
      )}
      <InstallApp />
    </div>
  );
}
