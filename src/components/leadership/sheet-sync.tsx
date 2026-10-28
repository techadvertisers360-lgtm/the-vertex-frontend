'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Copy, PlugZap } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input, Notice } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/**
 * Google Sheets lead sync UI (Phase 9b D-039, D-045). Only the sheet link is entered — the tab and columns are
 * detected by the server. Problems are reported to the developer; staff only see that the developer has been told.
 * The service account key never reaches the browser — only its email.
 */

/** Shown instead of any sync / link problem (the reason goes to the developer). */
export const DEV_NOTIFIED = 'Kuch masla aa gaya — Developer ko bata diya gaya hai, woh theek kar dega.';

export interface ColumnMap {
  name: string;
  phone: string;
  id?: string | null;
  extra?: string[];
  auto?: boolean;
}

export interface SyncConfig {
  configured: boolean;
  serviceAccountEmail: string | null;
}

export interface SheetSync {
  googleSheetId: string | null;
  tabName: string | null;
  columnMap: ColumnMap | null;
  lastSyncAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncStatus: 'SUCCESS' | 'FAILED' | null;
  consecutiveFailures: number;
  syncing: boolean;
}

interface SyncRun {
  id: string;
  trigger: 'SCHEDULED' | 'MANUAL';
  actor: string | null;
  startedAt: string;
  status: 'SUCCESS' | 'FAILED';
  imported: number;
  duplicatePhones: number;
  skipped: number;
}

interface CheckResult {
  ok: boolean;
  error?: string;
  title?: string;
  tabName?: string;
  columnMap?: ColumnMap;
  dataRows?: number;
  invalidRows?: number;
  idColumn?: boolean;
  sample?: { row: number; name: string; phone: string }[];
  campaign?: string | null;
}

export function useSyncConfig() {
  return useQuery({ queryKey: ['lead-admin', 'sync-config'], queryFn: () => get<SyncConfig>('/lead-admin/sync-config'), staleTime: 60_000 });
}

/** Which Google account to share sheets with. */
export function ServiceAccountBanner() {
  const q = useSyncConfig();
  if (!q.data) return null;
  const c = q.data;
  if (!c.configured) return <Notice tone="warning">Google sheet sync abhi set nahi — Developer se rabta karein.</Notice>;
  return (
    <Notice
      tone="info"
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(c.serviceAccountEmail!).then(() => toast.success('Email copy ho gaya'));
          }}
        >
          <Copy className="size-4" /> Copy email
        </Button>
      }
    >
      Har Meta lead sheet is email ke saath <b>Viewer</b> share karein: <span className="font-semibold break-all">{c.serviceAccountEmail}</span>
    </Notice>
  );
}

/** Body for create / edit: just the link (empty = sync off). Tab and columns are detected on the server. */
export function sourcePayload(link: string) {
  return { googleSheetId: link.trim() || null };
}

/** Google Sheet link with a "Check sheet" button that shows what was detected. */
export function SheetLinkField({ link, setLink }: { link: string; setLink: (v: string) => void }) {
  const [result, setResult] = React.useState<CheckResult | null>(null);
  const check = useMutation({
    mutationFn: () => post<CheckResult>('/lead-admin/sheets/test-connection', { googleSheetId: link.trim() }),
    onSuccess: setResult,
    onError: (e) => setResult({ ok: false, error: e instanceof ApiError && e.status === 422 ? e.message : DEV_NOTIFIED }),
  });
  const m = result?.columnMap;
  return (
    <fieldset className="space-y-3 rounded-control border border-line p-3">
      <legend className="px-1 text-dense font-semibold text-ink">Google Sheet</legend>
      <Field label="Google Sheet link" htmlFor="gs-link" hint="Sirf link paste karein — tab, naam, phone aur baqi sab columns khud pehchane jayenge.">
        <Input
          id="gs-link"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setResult(null);
          }}
          placeholder="https://docs.google.com/spreadsheets/d/…"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={!link.trim()} loading={check.isPending} onClick={() => check.mutate()}>
          <PlugZap className="size-4" /> Check sheet
        </Button>
        {result?.ok && (
          <span className="flex items-center gap-1 text-dense text-success">
            <CheckCircle2 className="size-4" /> Sheet mil gayi
          </span>
        )}
      </div>
      {result && !result.ok && <Notice>{result.error}</Notice>}
      {result?.ok && m && (
        <div className="space-y-1 rounded-control bg-canvas px-3 py-2 text-dense">
          <p>
            <span className="font-semibold">{result.title}</span> · tab “{result.tabName}” · {result.dataRows} leads
          </p>
          <p className="text-muted">
            Naam: {m.name} · Phone: {m.phone}
            {m.id ? ` · Lead ID: ${m.id}` : ''}
          </p>
          {m.extra?.length ? <p className="text-muted">Remarks mein: {m.extra.join(', ')}</p> : null}
          {result.sample?.map((s) => (
            <p key={s.row} className="text-muted">
              Row {s.row}: {s.name} · {s.phone}
            </p>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * Sync state on the sheet card: last check and the run log. There is no "Sync now" (D-047): new rows are imported
 * automatically about every minute, and at once when a sheet is linked or assigned.
 */
export function SyncPanel({ sheetId, s }: { sheetId: string; s: SheetSync }) {
  const [showLog, setShowLog] = React.useState(false);
  if (!s.googleSheetId) return <p className="text-dense text-muted">Google Sheet link nahi — leads sync nahi hote. Edit se link karein.</p>;
  const failing = s.lastSyncStatus === 'FAILED';
  return (
    <div className="space-y-2 border-t border-line pt-2 text-dense">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          {s.syncing ? (
            <Chip tone="info">Syncing…</Chip>
          ) : failing ? (
            <Chip tone="danger">Sync mein masla</Chip>
          ) : s.lastSyncStatus === 'SUCCESS' ? (
            <Chip tone="success">Auto sync on</Chip>
          ) : (
            <Chip tone="neutral">Member assign hote hi leads aayengi</Chip>
          )}
          <span className="text-muted">{s.lastSyncAt ? `Last check ${relativeFromNow(s.lastSyncAt)}` : ''}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
          Sync log
        </Button>
      </div>
      {failing && <Notice tone="info">Developer ko bata diya gaya hai — woh theek kar dega.</Notice>}
      {showLog && <SyncLog sheetId={sheetId} />}
    </div>
  );
}

function SyncLog({ sheetId }: { sheetId: string }) {
  const q = useQuery({ queryKey: ['lead-admin', 'sync-runs', sheetId], queryFn: () => get<{ items: SyncRun[] }>(`/lead-admin/sheets/${sheetId}/sync-runs`) });
  return (
    <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi sync run nahi">
      {(d) => (
        <ul className="max-h-72 divide-y divide-line overflow-auto rounded-control border border-line px-2">
          {d.items.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <Chip tone={r.status === 'SUCCESS' ? (r.imported ? 'success' : 'neutral') : 'danger'}>{r.status === 'SUCCESS' ? `+${r.imported}` : 'Masla'}</Chip> {r.trigger === 'MANUAL' ? `Link / assign · ${r.actor ?? ''}` : 'Auto'}
                {r.status === 'SUCCESS' && r.duplicatePhones ? ` · ${r.duplicatePhones} duplicate phone` : ''}
              </span>
              <span className="text-muted">{formatDateTime(r.startedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

interface SyncStatusRow {
  id: string;
  title: string;
  campaign: string;
  member: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: 'SUCCESS' | 'FAILED' | null;
  consecutiveFailures: number;
}

/** Compact sync health for Hamza / Muaz / MD dashboards. */
export function SyncHealth({ manageHref }: { manageHref?: string }) {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['lead-sync-status'], queryFn: () => get<{ intervalMin: number; paused: boolean; items: SyncStatusRow[] }>('/lead-reports/sync-status'), refetchInterval: pollInterval || 60_000 });
  if (!q.data || q.data.items.length === 0) return null;
  const failing = q.data.items.filter((s) => s.lastSyncStatus === 'FAILED');
  return (
    <Card accent={failing.length ? 'danger' : 'ops'}>
      <CardHeader>
        <CardTitle>Lead sheet sync</CardTitle>
        {q.data.paused ? <Chip tone="warning">Paused</Chip> : failing.length ? <Chip tone="danger">{failing.length} mein masla</Chip> : <Chip tone="success">All syncing</Chip>}
      </CardHeader>
      <ul className="divide-y divide-line text-dense">
        {q.data.items.map((s) => (
          <li key={s.id} className="flex flex-wrap justify-between gap-2 py-1.5">
            <span>
              <span className="font-semibold text-ink">{s.campaign}</span> · {s.member ?? 'no member'}
            </span>
            <span className={s.lastSyncStatus === 'FAILED' ? 'text-danger' : 'text-muted'}>
              {s.lastSyncStatus === 'FAILED' ? 'Masla — Developer ko bata diya' : s.lastSyncAt ? relativeFromNow(s.lastSyncAt) : 'not yet'}
            </span>
          </li>
        ))}
      </ul>
      {manageHref && failing.length > 0 && (
        <Link href={manageHref} className="mt-2 inline-block text-dense font-semibold text-brand">
          Sheets kholein →
        </Link>
      )}
    </Card>
  );
}
