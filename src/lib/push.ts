'use client';
import { get, post } from './api';

/**
 * Web Push on this device (D-046). The browser keeps the subscription; the server stores it per user so every
 * notification also arrives on the phone while the app is closed. The service worker (public/sw.js) shows it.
 */

export type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported';

/** Turned off on purpose on this device — the app must not silently turn it back on. */
const OFF_KEY = 'vh-push-off';

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // iPhone / iPad: Web Push works only in the app added to the Home Screen (iOS 16.4+).
  if (isIOS() && !isInstalled()) return 'ios-needs-install';
  return apis ? 'supported' : 'unsupported';
}

export function offOnThisDevice(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function setOff(v: boolean) {
  try {
    if (v) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* storage blocked — nothing to remember */
  }
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
  devices: number;
}

export const pushConfig = () => get<PushConfig>('/push/config');

/**
 * Ask permission (must run from a tap — iPhone requires it), subscribe, and register this device for the signed-in
 * user. Returns the browser's permission result.
 */
export async function enablePush(): Promise<NotificationPermission> {
  const cfg = await pushConfig();
  if (!cfg.enabled || !cfg.publicKey) throw new Error('Phone notifications abhi server par set nahi — Developer se rabta karein.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an old server key cannot receive pushes: replace it.
  const key = sub?.options.applicationServerKey;
  if (sub && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== cfg.publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) as BufferSource });
  await post('/push/subscriptions', { subscription: sub.toJSON(), userAgent: navigator.userAgent });
  setOff(false);
  return permission;
}

/** Turn off on this device: the server forgets it and the browser unsubscribes. */
export async function disablePush(opts: { remember?: boolean } = {}): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await post('/push/subscriptions/remove', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  if (opts.remember !== false) setOff(true);
}

/**
 * After sign-in: if this device already allowed notifications, make sure the server has it for the user signed in
 * now (the same phone may have been used by someone else). Never asks — asking needs a tap.
 */
export async function resyncPush(): Promise<void> {
  if (pushSupport() !== 'supported' || Notification.permission !== 'granted' || offOnThisDevice()) return;
  const cfg = await pushConfig().catch(() => null);
  if (!cfg?.enabled) return;
  await enablePush().catch(() => undefined);
}

/** On sign-out: this device stops receiving the person's notifications (next person signs in fresh). */
export async function forgetDeviceOnSignOut(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) await post('/push/subscriptions/remove', { endpoint: sub.endpoint });
  } catch {
    /* signing out anyway */
  }
}
