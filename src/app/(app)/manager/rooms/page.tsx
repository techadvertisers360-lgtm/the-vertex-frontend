'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, formatTime, relativeFromNow } from '@/lib/time';
import type { AssistantRow, ReportRow } from '@/lib/manager-types';
import { stepLabel, type ProcedureTaskView } from '@/lib/procedure-types';
import { cn, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { ViewFileButton } from '@/components/ui/file-view';
import { ReasonDialog } from '@/components/reception/dialogs';
import { PlannedTodayCard } from '@/components/procedures/planned-today';

type Tab = 'rooms' | 'rounds' | 'procedures';
type Scope = 'open' | 'day';

const STATUS_TONE = { VERIFIED: 'success', RETURNED: 'warning', ESCALATED: 'danger' } as const;

/** One report: every check, notes, photos, the decision history and Verify / Return / Escalate (spec §14). */
function ReportCard({ r }: { r: ReportRow }) {
  const qc = useQueryClient();
  const [action, setAction] = React.useState<'RETURNED' | 'ESCALATED' | null>(null);
  const verify = useMutation({
    mutationFn: () => post(`/manager/reports/${r.type}/${r.id}/verify`, { status: 'VERIFIED' }),
    onSuccess: () => {
      toast.success('Verified');
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Verify nahi hua'),
  });
  const title = r.type === 'RoomChecklistReport' ? `Room ${r.roomCode} · ${titleCase(r.kind)}` : `${r.kind === 'FIRST_CHECK' ? 'First check' : r.kind === 'FINAL' ? 'Final report' : `Round ${(r.seq ?? 2) - 1}`}`;
  return (
    <Card accent={r.issue && r.latestStatus !== 'VERIFIED' ? 'danger' : 'ops'}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="text-dense text-muted">
            {r.staffName} · {formatDateTime(r.submittedAt)} ({relativeFromNow(r.submittedAt)})
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {r.issue && <Chip tone="danger">Issue</Chip>}
          {r.latestStatus ? <Chip tone={STATUS_TONE[r.latestStatus]}>{titleCase(r.latestStatus)}</Chip> : <Chip>Pending</Chip>}
        </div>
      </CardHeader>
      <ul className="grid gap-1 text-dense sm:grid-cols-2">
        {r.checks.map((c) => (
          <li key={c.label} className={cn('flex items-start gap-2', !c.ok && 'font-semibold text-danger')}>
            {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <X className="mt-0.5 size-4 shrink-0" />}
            <span>
              {c.label}
              {c.note ? `: ${c.note}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {r.issues && <p className="mt-2 text-dense text-ink">Issue: {r.issues}</p>}
      {r.demandSkipped && <p className="mt-1 text-dense text-muted">Stock demand skip ki gayi.</p>}
      {r.attachmentIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.attachmentIds.map((id, i) => (
            <ViewFileButton key={id} attachmentId={id} label={`Photo ${i + 1}`} />
          ))}
        </div>
      )}
      {r.history.length > 0 && (
        <ol className="mt-3 space-y-1 border-t border-line pt-2 text-dense text-muted">
          {r.history.map((h, i) => (
            <li key={i}>
              <span className="font-semibold text-ink">{titleCase(h.status)}</span> · {h.by} · {formatTime(h.at)}
              {h.comment ? ` — ${h.comment}` : ''}
            </li>
          ))}
        </ol>
      )}
      {r.latestStatus !== 'VERIFIED' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => verify.mutate()} loading={verify.isPending}>
            Verify
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAction('RETURNED')}>
            Return
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setAction('ESCALATED')}>
            Escalate to MD
          </Button>
        </div>
      )}
      {action && (
        <ReasonDialog
          title={action === 'RETURNED' ? 'Report wapas karein' : 'MD ko escalate karein'}
          description={action === 'RETURNED' ? 'Comment staff ko notification mein jayega. Report khud nahi badlegi.' : 'MD ko foran alert jayega.'}
          label="Comment"
          submitLabel={action === 'RETURNED' ? 'Return' : 'Escalate'}
          danger={action === 'ESCALATED'}
          onSubmit={async ({ reason }) => {
            await post(`/manager/reports/${r.type}/${r.id}/verify`, { status: action, comment: reason });
            toast.success(action === 'RETURNED' ? 'Returned — staff ko bata diya' : 'MD ko escalate ho gaya');
            void qc.invalidateQueries({ queryKey: ['manager'] });
          }}
          onClose={() => setAction(null)}
        />
      )}
    </Card>
  );
}

function ReportsTab({ kind }: { kind: 'rooms' | 'rounds' }) {
  const { pollInterval } = useRealtime();
  const [scope, setScope] = React.useState<Scope>('open');
  const q = useQuery({ queryKey: ['manager', 'reports', kind, scope], queryFn: () => get<{ items: ReportRow[] }>(`/manager/reports/${kind}`, { scope }), refetchInterval: pollInterval || 60_000 });
  return (
    <div className="space-y-3">
      <Segmented<Scope>
        value={scope}
        onChange={setScope}
        options={[
          { value: 'open', label: 'Pending / unresolved' },
          { value: 'day', label: 'Aaj ki sab reports' },
        ]}
      />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle={scope === 'open' ? 'Sab reports verify ho chuki hain' : 'Aaj koi report nahi'}>
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((r) => (
              <ReportCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function ReplaceDialog({ task, onClose }: { task: ProcedureTaskView; onClose: () => void }) {
  const qc = useQueryClient();
  const asst = useQuery({ queryKey: ['manager', 'assistants'], queryFn: () => get<{ items: AssistantRow[] }>('/manager/assistants') });
  const [pick, setPick] = React.useState('');
  const [reason, setReason] = React.useState('');
  const m = useMutation({
    mutationFn: () => post(`/manager/procedures/${task.id}/replace`, { assistantId: pick, reason: reason.trim() }),
    onSuccess: () => {
      toast.success('Replacement assign — woh isi step se jaari rakhega');
      void qc.invalidateQueries({ queryKey: ['manager'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Replacement Assistant" description={`${task.patient?.name} · ${task.procedure?.procedureName} · Room ${task.roomCode} · abhi: ${task.assistantName} · step ${stepLabel(task.currentStep)}`}>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(asst.data?.items ?? [])
              .filter((a) => a.id !== task.assistantId)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={!a.available}
                  aria-pressed={pick === a.id}
                  onClick={() => setPick(a.id)}
                  className={cn('flex min-h-11 items-center justify-between rounded-card border px-3 py-2 text-left text-body disabled:cursor-not-allowed disabled:opacity-50', pick === a.id ? 'border-brand bg-brand-light' : 'border-line bg-surface')}
                >
                  <span className="font-semibold">{a.displayName}</span>
                  <Chip tone={a.available ? 'success' : a.busy ? 'warning' : 'neutral'}>{a.available ? 'Free' : a.busy ? 'Busy' : 'Off duty'}</Chip>
                </button>
              ))}
          </div>
          <Field label="Wajah" required htmlFor="rp-r">
            <Textarea id="rp-r" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => m.mutate()} loading={m.isPending} disabled={!pick || reason.trim().length < 3}>
              Assign replacement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProceduresTab() {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['manager', 'procedures'], queryFn: () => get<{ items: ProcedureTaskView[] }>('/manager/procedures'), refetchInterval: pollInterval || 30_000 });
  const [rep, setRep] = React.useState<ProcedureTaskView | null>(null);
  return (
    <>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi procedure nahi chal raha">
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((t) => (
              <Card key={t.id} accent={t.status === 'BLOCKED' ? 'danger' : 'ops'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      {t.patient?.name} · Room {t.roomCode}
                    </CardTitle>
                    <p className="text-dense text-muted">
                      {t.procedure?.procedureName} · {t.doctorName} · {t.assistantName} · assigned {t.assignedAt ? formatTime(t.assignedAt) : '—'}
                    </p>
                  </div>
                  {t.status === 'BLOCKED' ? <Chip tone="danger">Emergency</Chip> : <Chip tone="info">{stepLabel(t.currentStep)}</Chip>}
                </CardHeader>
                {t.sentToReceptionAt && <p className="mb-2 text-dense text-success">Patient Reception par · room clean baqi</p>}
                <Button size="sm" variant={t.status === 'BLOCKED' ? 'primary' : 'secondary'} onClick={() => setRep(t)}>
                  Replace Assistant
                </Button>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {rep && <ReplaceDialog task={rep} onClose={() => setRep(null)} />}
    </>
  );
}

function RoomsView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'rooms');
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Room & round verification" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rooms', label: 'Room checklists' },
          { value: 'rounds', label: 'Office Boy rounds' },
          { value: 'procedures', label: 'Live procedures' },
        ]}
      />
      {tab === 'rooms' && <ReportsTab kind="rooms" />}
      {tab === 'rounds' && <ReportsTab kind="rounds" />}
      {tab === 'procedures' && (
        <div className="space-y-4">
          <PlannedTodayCard endpoint="/manager/procedures/planned-today" emptyHidden hint="Room par duty Assistant na ho to Staff → room duty se assign karein." />
          <ProceduresTab />
        </div>
      )}
    </div>
  );
}

export default function RoomsPage() {
  return (
    <React.Suspense>
      <RoomsView />
    </React.Suspense>
  );
}
