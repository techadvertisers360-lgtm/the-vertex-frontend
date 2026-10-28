'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { formatTime, relativeFromNow } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, HeroBanner, SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { UploadButton } from '@/components/ui/upload';
import { AttendanceCard } from '@/components/requests/attendance-card';
import { MyDemands, type MyDemand } from '@/components/stock/demand-panel';

type Kind = 'FIRST_CHECK' | 'ROUND' | 'FINAL';
interface Round {
  id: string;
  seq: number;
  kind: Kind;
  dueAt: string;
  submittedAt: string | null;
  status: string;
  cleanlinessOk: boolean | null;
  stockOk: boolean | null;
  issues: string | null;
}
interface Today {
  attendance: { id: string; checkInAt: string; checkOutAt: string | null } | null;
  rounds: Round[];
  areas: string[];
  nextRoundAt: string | null;
  nextRoundKind: Kind | null;
  finalTime: string;
}

const twelveHour = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
};

const title = (r: Pick<Round, 'kind' | 'seq'>) => (r.kind === 'FIRST_CHECK' ? 'First clinic check' : r.kind === 'FINAL' ? 'Final report' : `Round ${r.seq - 1}`);

/** One round's checklist: every area clean / issue, stock, issues, photo (spec §13). Immutable once sent. */
function RoundDialog({ round, areas, onClose }: { round: Round; areas: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = React.useState(() => areas.map((name) => ({ name, clean: true, note: '' })));
  const [stockOk, setStockOk] = React.useState(true);
  const [stockNotes, setStockNotes] = React.useState('');
  const [issues, setIssues] = React.useState('');
  const [reviewed, setReviewed] = React.useState(false);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const isFinal = round.kind === 'FINAL';
  const demands = useQuery({ queryKey: ['stock', 'demands', 'mine'], queryFn: () => get<{ items: MyDemand[] }>('/stock/demands/mine'), enabled: isFinal });
  const open = (demands.data?.items ?? []).filter((d) => !['RECEIVED', 'CLOSED', 'REJECTED'].includes(d.status));
  const invalid = rows.some((r) => !r.clean && r.note.trim().length < 3) || (!stockOk && stockNotes.trim().length < 2) || (isFinal && !reviewed);
  const m = useMutation({
    mutationFn: () =>
      post(`/office/rounds/${round.id}`, {
        areas: rows.map((r) => ({ name: r.name, clean: r.clean, note: r.clean ? undefined : r.note.trim() })),
        stockOk,
        stockNotes: stockOk ? undefined : stockNotes.trim(),
        issues: issues.trim() || undefined,
        demandsReviewed: isFinal ? reviewed : undefined,
        attachmentIds: photos,
      }),
    onSuccess: () => {
      toast.success(`${title(round)} jama ho gaya${isFinal ? ' — ab check-out kar sakte hain' : ''}`);
      void qc.invalidateQueries({ queryKey: ['queue'] });
      onClose();
    },
  });
  const issue = rows.some((r) => !r.clean) || !stockOk || !!issues.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={title(round)} description="Har area check karein. Bhejne ke baad report badli nahi ja sakti; masla Manager ko foran jata hai.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) m.mutate();
          }}
        >
          <div>
            <SectionLabel className="mb-2">Areas</SectionLabel>
            <ul className="divide-y divide-line rounded-card border border-line">
              {rows.map((r, i) => (
                <li key={r.name} className="space-y-2 px-3 py-2">
                  <Checkbox label={`${r.name} — saaf`} checked={r.clean} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, clean: e.target.checked } : x)))} />
                  {!r.clean && (
                    <Input aria-label={`${r.name} masla`} placeholder="Kya masla hai?" value={r.note} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <Checkbox label="Stock theek hai (tissue, soap, cleaning supplies, missing items)" checked={stockOk} onChange={(e) => setStockOk(e.target.checked)} />
            {!stockOk && (
              <Field label="Kya kam / missing hai?" required htmlFor="r-stock">
                <Textarea id="r-stock" rows={2} value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} />
              </Field>
            )}
            {!stockOk && (
              <p className="text-dense text-muted">
                Demand bhi bhejni hai?{' '}
                <Link href="/office/demands" className="font-semibold text-brand-medium underline">
                  Stock demand
                </Link>
              </p>
            )}
          </div>
          <Field label={isFinal ? 'Unresolved issues (optional)' : 'Koi aur masla (optional)'} htmlFor="r-issues">
            <Textarea id="r-issues" rows={2} value={issues} onChange={(e) => setIssues(e.target.value)} />
          </Field>
          {isFinal && (
            <div className="space-y-2 rounded-card border border-line p-3">
              <SectionLabel>Meri open demands</SectionLabel>
              {demands.isPending ? (
                <LoadingRows rows={1} />
              ) : open.length ? (
                <ul className="space-y-1 text-dense">
                  {open.map((d) => (
                    <li key={d.id}>
                      {d.lines.map((l) => (l.itemId ? `${l.name} × ${l.quantity}` : l.name)).join(', ')} · {d.status.replace(/_/g, ' ').toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-dense text-muted">Koi open demand nahi.</p>
              )}
              <Checkbox label="Maine apni demands review kar li hain" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
            </div>
          )}
          <div className="space-y-2">
            <SectionLabel>Photo{issue ? ' (masle ki)' : ' (optional)'}</SectionLabel>
            <UploadButton route="roomChecklistPhoto" recordType="OfficeRound" recordId={round.id} label={photos.length ? 'Aur photo' : 'Upload photo'} accept="image/*" onUploaded={(id) => setPhotos((p) => [...p, id])} />
            {photos.length > 0 && <p className="text-dense text-success">{photos.length} photo upload ho gayi</p>}
          </div>
          {issue && <Notice tone="warning">Masla wali report Manager ko foran alert karegi.</Notice>}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein.'}</Notice>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={invalid}>
              Send report
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function roundState(r: Round): { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string } {
  if (r.submittedAt) return r.cleanlinessOk === false || r.stockOk === false || r.issues ? { tone: 'warning', label: 'Sent · issue' } : { tone: 'success', label: 'Sent' };
  if (r.status === 'CANCELLED') return { tone: 'neutral', label: 'Missed' };
  return { tone: 'danger', label: 'Due' };
}

/** Office Boy dashboard (spec §13): check-in, due rounds, next reminder, final report. No patient data. */
export default function OfficeHome() {
  const { me } = useSession();
  const { pollInterval, connected } = useRealtime();
  const q = useQuery({ queryKey: ['queue', 'office', 'today'], queryFn: () => get<Today>('/office/today'), refetchInterval: pollInterval || 60_000 });
  const [open, setOpen] = React.useState<Round | null>(null);
  const d = q.data;
  const due = d?.rounds.filter((r) => !r.submittedAt && r.status !== 'CANCELLED') ?? [];
  const final = d?.rounds.find((r) => r.kind === 'FINAL');

  return (
    <div className="space-y-4">
      <HeroBanner label="Office Boy" title="My Duties" subtitle={me.user.displayName} actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      <AttendanceCard />
      {q.isPending ? (
        <LoadingRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d!.attendance ? (
        <EmptyState title="Pehle check-in karein" hint="Check-in ke saath first clinic check shuru hota hai, phir har 2 ghante round." />
      ) : (
        <>
          <Card accent={due.length ? 'danger' : 'ops'}>
            <CardHeader>
              <CardTitle>Abhi karna hai</CardTitle>
              {d!.nextRoundAt && (
                <Chip tone="info">
                  Agla {d!.nextRoundKind === 'FINAL' ? 'final report' : 'round'}: {formatTime(d!.nextRoundAt)}
                </Chip>
              )}
            </CardHeader>
            {due.length === 0 ? (
              <p className="text-dense text-muted">{d!.attendance.checkOutAt ? 'Shift khatam.' : 'Sab report jama hain. Agle round par notification aayegi.'}</p>
            ) : (
              <ul className="space-y-2">
                {due.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-body text-ink">
                      <ClipboardCheck className="size-4 text-brand" /> {title(r)} · due {formatTime(r.dueAt)} ({relativeFromNow(r.dueAt)})
                    </span>
                    <Button onClick={() => setOpen(r)}>Open checklist</Button>
                  </li>
                ))}
              </ul>
            )}
            {!final && !d!.attendance.checkOutAt && <p className="mt-3 text-dense text-muted">Final report {twelveHour(d!.finalTime)} par khulega. Check-out us ke baad.</p>}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aaj ke rounds</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-line">
              {d!.rounds.map((r) => {
                const s = roundState(r);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-dense">
                    <span className="text-ink">
                      {title(r)} · due {formatTime(r.dueAt)}
                      {r.submittedAt ? ` · sent ${formatTime(r.submittedAt)}` : ''}
                    </span>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </li>
                );
              })}
            </ul>
          </Card>
          <MyDemands />
        </>
      )}
      {open && d && <RoundDialog round={open} areas={d.areas} onClose={() => setOpen(null)} />}
    </div>
  );
}
