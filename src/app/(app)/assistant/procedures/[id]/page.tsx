'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Check, Image as ImageIcon, Plus, Send, Trash2, Video } from 'lucide-react';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime } from '@/lib/time';
import { STEPS, stepLabel, type ProcedureDetail, type ProcedureStep, type StockForUsage } from '@/lib/procedure-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Checkbox, Field, Input, Notice, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { UploadButton, type UploadRoute } from '@/components/ui/upload';
import { ViewFileButton } from '@/components/ui/file-view';
import { ReasonDialog } from '@/components/reception/dialogs';
import { SearchSelect } from '@/components/booking/slot-picker';

const idx = (s: ProcedureStep) => (s === 'DONE' ? STEPS.length : STEPS.findIndex((x) => x.step === s));

function Stepper({ current }: { current: ProcedureStep }) {
  const at = idx(current);
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9" aria-label="Procedure steps">
      {STEPS.map((s, i) => (
        <li key={s.step} className="flex flex-col items-center gap-1 text-center">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-full border text-dense font-semibold',
              i < at ? 'border-success bg-success text-on-brand' : i === at ? 'border-brand bg-brand-light text-brand' : 'border-line bg-surface text-muted',
            )}
            aria-current={i === at ? 'step' : undefined}
          >
            {i < at ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={cn('text-[12px] leading-4', i === at ? 'font-semibold text-ink' : 'text-muted')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Photo step: upload one or more photos / videos, then save; or record the patient's refusal (spec §4: skip only
 * with a reason). Files already uploaded to this step (e.g. before a page reload) are listed and saved too (D-082).
 */
function PhotoStep({ task, which, run, pending }: { task: ProcedureDetail; which: 'before' | 'after'; run: (path: string, body?: object) => void; pending: boolean }) {
  const [declined, setDeclined] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const route: UploadRoute = which === 'before' ? 'beforePhoto' : 'afterPhoto';
  const path = `${which}-photo`;
  const [added, setAdded] = React.useState<{ id: string; fileName: string; mime: string }[]>([]);
  const files = [...task.uploads.filter((u) => u.route === route), ...added.filter((a) => !task.uploads.some((u) => u.id === a.id))];
  const videos = files.filter((f) => f.mime.startsWith('video/')).length;
  return (
    <div className="space-y-3">
      <p className="text-body text-ink">{which === 'before' ? 'Procedure se pehle' : 'Procedure ke baad'} photos lein — ek se zyada photos ya video bhi add kar sakte hain.</p>
      {!declined && (
        <>
          {files.length > 0 && (
            <ul className="space-y-1 text-dense">
              {files.map((f, i) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {f.mime.startsWith('video/') ? <Video className="size-4 shrink-0 text-brand-medium" aria-hidden /> : <ImageIcon className="size-4 shrink-0 text-brand-medium" aria-hidden />}
                    <span className="truncate">
                      {i + 1}. {f.fileName}
                    </span>
                  </span>
                  <ViewFileButton attachmentId={f.id} />
                </li>
              ))}
            </ul>
          )}
          <UploadButton
            route={route}
            recordType="ProcedureTask"
            recordId={task.id}
            label={files.length ? 'Aur photo / video add karein' : `Upload ${which} photos / video`}
            accept="image/*,video/*"
            multiple
            onUploaded={(id, file) => setAdded((a) => [...a, { id, fileName: file.name, mime: file.type || 'application/octet-stream' }])}
          />
          {files.length > 0 && (
            <Button type="button" loading={pending} onClick={() => run(path, { attachmentIds: files.map((f) => f.id) })}>
              Save {files.length - videos > 0 ? `${files.length - videos} photo` : ''}
              {files.length - videos > 0 && videos > 0 ? ' + ' : ''}
              {videos > 0 ? `${videos} video` : ''} · aage barhein
            </Button>
          )}
        </>
      )}
      <Checkbox label="Patient ne photo se inkar kiya" checked={declined} onChange={(e) => setDeclined(e.target.checked)} />
      {declined && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) run(path, { skipReason: reason.trim() });
          }}
        >
          <Field label="Wajah" required htmlFor="skip-reason">
            <Textarea id="skip-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Patient ne kya kaha" />
          </Field>
          <Button type="submit" variant="secondary" disabled={reason.trim().length < 3}>
            Skip with reason
          </Button>
        </form>
      )}
    </div>
  );
}

interface Line {
  itemId: string;
  qty: string;
}

/** Items used: choose stock items (no cost shown) + evidence photo; deducted once (spec §12). */
function ItemsStep({ task, run }: { task: ProcedureDetail; run: (path: string, body?: object, key?: string) => void }) {
  const stock = useQuery({ queryKey: ['queue', 'assistant', 'stock'], queryFn: () => get<{ items: StockForUsage[] }>('/assistant/stock-items') });
  const keyFor = React.useRef(idempotencyFor()).current;
  const [lines, setLines] = React.useState<Line[]>([{ itemId: '', qty: '' }]);
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [none, setNone] = React.useState(false);
  const items = stock.data?.items ?? [];
  const parsed = lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantity: Number(l.qty) }));
  const over = parsed.find((l) => (items.find((i) => i.id === l.itemId)?.usableQty ?? 0) < l.quantity);
  const invalid = none ? false : !parsed.length || parsed.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0) || !evidence.length || !!over;

  const submit = () => {
    const body = none ? { lines: [], evidenceAttachmentIds: evidence, noItems: true } : { lines: parsed, evidenceAttachmentIds: evidence };
    run('items', body, keyFor(body));
  };

  if (stock.isPending) return <LoadingRows rows={2} />;
  if (stock.isError) return <ErrorState error={stock.error} onRetry={() => stock.refetch()} />;
  return (
    <div className="space-y-3">
      <Checkbox label="Is procedure mein koi stock item istemal nahi hua" checked={none} onChange={(e) => setNone(e.target.checked)} />
      {!none && (
        <>
          {lines.map((l, i) => {
            const item = items.find((x) => x.id === l.itemId);
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-end gap-2">
                <Field label={i === 0 ? 'Item' : ''} htmlFor={`item-${i}`}>
                  <SearchSelect
                    id={`item-${i}`}
                    value={l.itemId}
                    emptyLabel="Item chunein — naam likh kar search karein"
                    // out of stock or already on another line → not offered
                    options={items
                      .filter((it) => it.id === l.itemId || (it.usableQty > 0 && !lines.some((x, j) => j !== i && x.itemId === it.id)))
                      .map((it) => ({ id: it.id, name: `${it.name} (${it.usableQty} ${it.baseUnit})` }))}
                    onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, itemId: v } : x)))}
                  />
                </Field>
                <Field label={i === 0 ? `Qty${item ? ` (${item.baseUnit})` : ''}` : ''} htmlFor={`qty-${i}`}>
                  <Input id={`qty-${i}`} inputMode="numeric" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { itemId: '', qty: '' }])}>
            <Plus className="size-4" /> Aur item
          </Button>
          {over && <Notice tone="warning">{items.find((i) => i.id === over.itemId)?.name}: itna usable stock nahi. Manager ko stock demand bhejein.</Notice>}
        </>
      )}
      <div className="space-y-2">
        <SectionLabel>Evidence photo{none ? ' (optional)' : ''}</SectionLabel>
        <UploadButton route="itemsUsedEvidence" recordType="ProcedureTask" recordId={task.id} label={evidence.length ? 'Aur photo' : 'Upload evidence'} accept="image/*" onUploaded={(id) => setEvidence((e) => [...e, id])} />
        {evidence.length > 0 && <p className="text-dense text-success">{evidence.length} photo upload ho gayi</p>}
      </div>
      <Button onClick={submit} disabled={invalid}>
        Save items used
      </Button>
    </div>
  );
}

/** Prominent hand-off: patient goes to Reception now; the room is cleaned next (D-034). */
function SendToReception({ task, run, pending }: { task: ProcedureDetail; run: (path: string) => void; pending: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = task.autoSendAt ? Math.max(0, Math.ceil((new Date(task.autoSendAt).getTime() - now) / 1000)) : null;
  return (
    <div className="space-y-3">
      <p className="text-body text-ink">Procedure mukammal. Patient ko Reception bhejein — room clean is ke baad alag step hai.</p>
      <Button className="w-full sm:w-auto sm:min-w-72" onClick={() => run('send-to-reception')} loading={pending}>
        <Send className="size-4" /> Send to Reception
      </Button>
      {left !== null && (
        <p className="text-dense text-muted">
          {left > 0 ? `Agar button nahi dabaya to ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} mein khud bhej diya jayega.` : 'Khud bheja ja raha hai…'}
        </p>
      )}
    </div>
  );
}

function CurrentStep({ task, run, pending }: { task: ProcedureDetail; run: (path: string, body?: object, key?: string) => void; pending: boolean }) {
  switch (task.currentStep) {
    case 'ACCEPT':
      return (
        <Button onClick={() => run('accept')} loading={pending}>
          Accept procedure
        </Button>
      );
    case 'CONSENT':
      return (
        <div className="space-y-2">
          <p className="text-body text-ink">Patient se signed consent form lein aur us ki photo / PDF upload karein. Consent ke baghair procedure start nahi ho sakta.</p>
          <UploadButton route="consentForm" recordType="ProcedureTask" recordId={task.id} label="Upload signed consent" onUploaded={(attachmentId) => run('consent', { attachmentId })} />
        </div>
      );
    case 'BEFORE_PHOTO':
      return <PhotoStep task={task} which="before" run={run} pending={pending} />;
    case 'START':
      return (
        <Button onClick={() => run('start')} loading={pending}>
          Start procedure
        </Button>
      );
    case 'FINISH':
      return (
        <div className="space-y-2">
          <p className="text-body text-ink">Procedure chal raha hai{task.startedAt ? ` — start ${formatTime(task.startedAt)}` : ''}.</p>
          <Button onClick={() => run('finish')} loading={pending}>
            Finish procedure
          </Button>
        </div>
      );
    case 'AFTER_PHOTO':
      return <PhotoStep task={task} which="after" run={run} pending={pending} />;
    case 'ITEMS_USED':
      return <ItemsStep task={task} run={run} />;
    case 'SEND_TO_RECEPTION':
      return <SendToReception task={task} run={run} pending={pending} />;
    case 'ROOM_CLEAN':
      return (
        <div className="space-y-2">
          {task.sentToReceptionAt && (
            <Notice tone="success">
              Patient {formatTime(task.sentToReceptionAt)} par Reception bheja gaya{task.sentToReceptionAuto ? ' (auto-sent)' : ''}.
            </Notice>
          )}
          <p className="text-body text-ink">Ab room {task.roomCode} saaf karein aur saaf room ki photo upload karein. Photo ke baghair room free nahi hoga.</p>
          <UploadButton route="roomCleanPhoto" recordType="ProcedureTask" recordId={task.id} label="Upload clean room photo" accept="image/*" onUploaded={(attachmentId) => run('clean', { attachmentId })} />
        </div>
      );
    case 'DONE':
      return <Notice tone="success">Procedure mukammal — patient Reception par, room clean aur free.</Notice>;
  }
}

const ROUTE_LABEL: Record<string, string> = {
  consentForm: 'Consent',
  beforePhoto: 'Before photo',
  afterPhoto: 'After photo',
  itemsUsedEvidence: 'Items evidence',
  roomCleanPhoto: 'Clean room',
};

/** One assigned procedure, step by step (spec §12). Only patient name, procedure, Doctor and room are shown. */
export default function ProcedurePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['queue', 'assistant', 'procedure', id], queryFn: () => get<ProcedureDetail>(`/assistant/procedures/${id}`), refetchInterval: pollInterval });
  const [emergency, setEmergency] = React.useState(false);
  const step = useMutation({
    mutationFn: ({ path, body, key }: { path: string; body?: object; key?: string }) => post<{ currentStep: ProcedureStep }>(`/assistant/procedures/${id}/${path}`, body, key),
    onSuccess: (r) => {
      toast.success(r.currentStep === 'DONE' ? 'Procedure mukammal — room free' : `Saved · next: ${stepLabel(r.currentStep)}`);
      void qc.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['queue', 'assistant', 'procedure', id] }),
  });
  const run = (path: string, body?: object, key?: string) => step.mutate({ path, body, key });

  if (q.isPending) return <LoadingRows rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data;
  const closed = t.status === 'COMPLETED' || t.currentStep === 'DONE';

  return (
    <div className="space-y-4">
      <Link href="/assistant" className="inline-flex items-center gap-1 text-dense font-semibold text-brand-medium">
        <ArrowLeft className="size-4" /> My Tasks
      </Link>
      <Card accent="ops">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>{t.patient?.name}</CardTitle>
            <p className="text-dense text-muted">
              {t.procedure?.procedureName} (session {t.procedure?.sessionNumber}) · {t.doctorName ?? 'Doctor nahi'} · Room {t.roomCode}
            </p>
          </div>
          {t.status === 'BLOCKED' ? <Chip tone="danger">Emergency — Manager replacement</Chip> : <Chip tone={closed ? 'success' : 'info'}>{stepLabel(t.currentStep)}</Chip>}
        </CardHeader>
        <Stepper current={t.currentStep} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{closed ? 'Done' : `Step: ${stepLabel(t.currentStep)}`}</CardTitle>
        </CardHeader>
        {t.status === 'BLOCKED' ? (
          <Notice tone="warning">Emergency report ho chuki hai. Manager replacement Assistant assign karega; woh isi step se kaam jaari rakhega.</Notice>
        ) : (
          <CurrentStep task={t} run={run} pending={step.isPending} />
        )}
        {step.error && (
          <div className="mt-3">
            <Notice>{step.error instanceof ApiError ? step.error.message : 'Save nahi hua — dobara koshish karein.'}</Notice>
          </div>
        )}
      </Card>

      {(t.uploads.length > 0 || t.itemsUsed.length > 0 || t.beforePhotoSkipReason || t.afterPhotoSkipReason) && (
        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-dense">
            {t.uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <span>
                  {ROUTE_LABEL[u.route] ?? u.route} · {formatTime(u.createdAt)}
                </span>
                <ViewFileButton attachmentId={u.id} />
              </li>
            ))}
            {t.beforePhotoSkipReason && <li className="text-muted">Before photo skipped: {t.beforePhotoSkipReason}</li>}
            {t.afterPhotoSkipReason && <li className="text-muted">After photo skipped: {t.afterPhotoSkipReason}</li>}
            {t.itemsUsed.map((i) => (
              <li key={i.itemId}>
                Used: {i.name} — {i.quantity} {i.unit}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!closed && t.status !== 'BLOCKED' && (
        <Button variant="ghost" className="text-danger" onClick={() => setEmergency(true)}>
          <AlertTriangle className="size-4" /> Emergency — procedure jaari nahi rakh sakta
        </Button>
      )}
      {emergency && (
        <ReasonDialog
          title="Emergency report"
          description="Manager ko foran alert jayega aur woh replacement Assistant assign karega."
          label="Kya hua?"
          submitLabel="Send to Manager"
          danger
          onSubmit={async ({ reason }) => {
            await post(`/assistant/procedures/${id}/emergency`, { reason });
            toast.success('Manager ko alert bhej diya');
            void qc.invalidateQueries({ queryKey: ['queue'] });
          }}
          onClose={() => setEmergency(false)}
        />
      )}
    </div>
  );
}
