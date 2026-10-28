'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from 'lucide-react';
import { ApiError, get, post, put } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime } from '@/lib/time';
import type { AssistantRow, StaffRow } from '@/lib/manager-types';
import { cn, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows, QueryState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';

type Tab = 'arrival' | 'rooms' | 'areas';

// ───────────── Arrival review ─────────────

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star`} onClick={() => onChange(n)} className="p-1">
          <Star className={cn('size-6', n <= value ? 'fill-gold text-gold' : 'text-line')} />
        </button>
      ))}
    </div>
  );
}

function ReviewDialog({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ uniformOk: true, hairOk: true, nailsOk: true });
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [note, setNote] = React.useState('');
  const needsNote = !v.uniformOk || !v.hairOk || !v.nailsOk || (rating > 0 && rating <= 2);
  const m = useMutation({
    mutationFn: () => post(`/manager/staff/${staff.id}/review`, { ...v, rating, comment: comment.trim() || undefined, improvementNote: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(`${staff.displayName}: review save — sirf unhein dikhega`);
      void qc.invalidateQueries({ queryKey: ['manager'] });
      onClose();
    },
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.checked }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Arrival review — ${staff.displayName}`} description={`${titleCase(staff.role)} · check-in ${staff.attendance ? formatTime(staff.attendance.checkInAt) : ''}`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (rating && (!needsNote || note.trim())) m.mutate();
          }}
        >
          <div className="grid gap-1">
            <Checkbox label="Uniform theek" checked={v.uniformOk} onChange={set('uniformOk')} />
            <Checkbox label="Hair theek" checked={v.hairOk} onChange={set('hairOk')} />
            <Checkbox label="Nails theek" checked={v.nailsOk} onChange={set('nailsOk')} />
          </div>
          <Field label="Rating" required>
            <Stars value={rating} onChange={setRating} />
          </Field>
          <Field label="Comment (optional)" htmlFor="rv-c">
            <Textarea id="rv-c" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <Field label="Improvement note" required={needsNote} htmlFor="rv-n" hint={needsNote ? 'Jo theek nahi us ke liye zaroori' : undefined}>
            <Textarea id="rv-n" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein.'}</Notice>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={!rating || (needsNote && !note.trim())}>
              Save review
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArrivalTab() {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['manager', 'staff'], queryFn: () => get<{ items: StaffRow[] }>('/manager/staff'), refetchInterval: pollInterval || 60_000 });
  const [review, setReview] = React.useState<StaffRow | null>(null);
  return (
    <>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi staff nahi">
        {(d) => (
          <DataTable
            rows={[...d.items].sort((a, b) => Number(!!b.attendance) - Number(!!a.attendance))}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Staff', cell: (r) => <span className="font-semibold">{r.displayName}</span> },
              { key: 'role', header: 'Role', cell: (r) => titleCase(r.role), hideSm: true },
              {
                key: 'in',
                header: 'Arrival',
                cell: (r) => (r.attendance ? `${formatTime(r.attendance.checkInAt)}${r.attendance.checkOutAt ? ` – ${formatTime(r.attendance.checkOutAt)}` : ''}` : r.attendanceRequired === false ? <Chip tone="info">Check-in off</Chip> : <Chip>Not checked in</Chip>),
              },
              { key: 'rooms', header: 'Rooms', cell: (r) => (r.role === 'ASSISTANT' ? r.rooms.map((x) => x.code).join(', ') || '—' : ''), hideSm: true },
              {
                key: 'review',
                header: 'Review',
                cell: (r) =>
                  r.review ? (
                    <Chip tone={r.review.rating >= 4 ? 'success' : r.review.rating >= 3 ? 'info' : 'warning'}>
                      {r.review.rating}/5{!r.review.uniformOk || !r.review.hairOk || !r.review.nailsOk ? ' · note' : ''}
                    </Chip>
                  ) : r.attendance ? (
                    <Button size="sm" onClick={() => setReview(r)}>
                      Review
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </QueryState>
      {review && <ReviewDialog staff={review} onClose={() => setReview(null)} />}
    </>
  );
}

// ───────────── Room assignment (1–4 rooms) ─────────────

interface Assignments {
  date: string;
  rooms: { id: string; code: string; name: string; kind: string }[];
  maxPerAssistant: number;
  items: { id: string; room: { id: string; code: string } | null; assistantId: string; assistantName: string | null; acceptedAt: string | null; reports: { kind: string }[] }[];
}

function AssignDialog({ a, data, onClose }: { a: AssistantRow; data: Assignments; onClose: () => void }) {
  const qc = useQueryClient();
  const mine = data.items.filter((x) => x.assistantId === a.id);
  const [sel, setSel] = React.useState<string[]>(mine.map((x) => x.room!.id));
  const heldBy = (roomId: string) => data.items.find((x) => x.room?.id === roomId && x.assistantId !== a.id)?.assistantName;
  const m = useMutation({
    mutationFn: () => post('/manager/room-assignments', { assistantId: a.id, roomIds: sel }),
    onSuccess: () => {
      toast.success(`${a.displayName}: rooms save — notification gayi`);
      void qc.invalidateQueries({ queryKey: ['manager'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Rooms — ${a.displayName}`} description={`Aaj ke liye 1 se ${data.maxPerAssistant} rooms. Doosre Assistant ke rooms band hain.`}>
        <div className="grid grid-cols-3 gap-2">
          {data.rooms.map((r) => {
            const other = heldBy(r.id);
            const on = sel.includes(r.id);
            const reported = mine.find((x) => x.room?.id === r.id)?.reports.length;
            return (
              <button
                key={r.id}
                type="button"
                disabled={!!other || (!on && sel.length >= data.maxPerAssistant) || (on && !!reported)}
                aria-pressed={on}
                onClick={() => setSel((s) => (on ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                className={cn('min-h-11 rounded-card border px-2 py-2 text-left text-body disabled:cursor-not-allowed disabled:opacity-50', on ? 'border-brand bg-brand-light' : 'border-line bg-surface')}
              >
                <span className="block font-semibold">{r.code}</span>
                <span className="block text-[12px] text-muted">{other ? other : reported ? 'report jama' : titleCase(r.kind)}</span>
              </button>
            );
          })}
        </div>
        {m.error && (
          <div className="mt-3">
            <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>
          </div>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={sel.length < 1 || sel.length > data.maxPerAssistant}>
            Save {sel.length} room{sel.length === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoomsTab() {
  const { pollInterval } = useRealtime();
  const asst = useQuery({ queryKey: ['manager', 'assistants'], queryFn: () => get<{ items: AssistantRow[] }>('/manager/assistants'), refetchInterval: pollInterval || 60_000 });
  const ra = useQuery({ queryKey: ['manager', 'room-assignments'], queryFn: () => get<Assignments>('/manager/room-assignments'), refetchInterval: pollInterval || 60_000 });
  const [open, setOpen] = React.useState<AssistantRow | null>(null);
  if (asst.isPending || ra.isPending) return <LoadingRows rows={3} />;
  if (asst.isError) return <ErrorState error={asst.error} onRetry={() => asst.refetch()} />;
  if (ra.isError) return <ErrorState error={ra.error} onRetry={() => ra.refetch()} />;
  const unassigned = ra.data.rooms.filter((r) => !ra.data.items.some((x) => x.room?.id === r.id));
  return (
    <div className="space-y-3">
      {unassigned.length > 0 && <Notice tone="warning">Aaj kisi ko assign nahi: {unassigned.map((r) => r.code).join(', ')}</Notice>}
      <div className="grid gap-3 md:grid-cols-2">
        {asst.data.items.map((a) => {
          const mine = ra.data.items.filter((x) => x.assistantId === a.id);
          return (
            <Card key={a.id} accent={a.onDuty ? 'ops' : 'none'}>
              <CardHeader>
                <CardTitle>{a.displayName}</CardTitle>
                <Chip tone={a.busy ? 'warning' : a.onDuty ? 'success' : 'neutral'}>{a.busy ? 'In procedure' : a.onDuty ? 'On duty' : 'Not checked in'}</Chip>
              </CardHeader>
              {mine.length ? (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {mine.map((x) => (
                    <li key={x.id}>
                      <Chip tone={x.reports.some((r) => r.kind === 'CLOSING') ? 'success' : x.reports.length ? 'info' : x.acceptedAt ? 'brand' : 'warning'}>
                        {x.room?.code} · {x.reports.some((r) => r.kind === 'CLOSING') ? 'closed' : x.reports.length ? 'open' : x.acceptedAt ? 'accepted' : 'not accepted'}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-dense text-muted">Aaj koi room nahi.</p>
              )}
              <Button size="sm" variant="secondary" onClick={() => setOpen(a)}>
                Assign rooms
              </Button>
            </Card>
          );
        })}
      </div>
      {open && <AssignDialog a={open} data={ra.data} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ───────────── Office Boy areas (client answer 11a) ─────────────

function AreasTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['manager', 'office-areas'], queryFn: () => get<{ areas: string[] }>('/manager/office-areas') });
  const [areas, setAreas] = React.useState<string[] | null>(null);
  const [add, setAdd] = React.useState('');
  React.useEffect(() => {
    if (q.data && areas === null) setAreas(q.data.areas);
  }, [q.data, areas]);
  const m = useMutation({
    mutationFn: (list: string[]) => put<{ areas: string[] }>('/manager/office-areas', { areas: list }),
    onSuccess: (r) => {
      toast.success('Areas save — agle round se lagu');
      setAreas(r.areas);
      void qc.invalidateQueries({ queryKey: ['manager', 'office-areas'] });
    },
  });
  if (q.isPending || !areas) return <LoadingRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const move = (i: number, d: -1 | 1) => setAreas((a) => {
    const n = [...a!];
    [n[i], n[i + d]] = [n[i + d]!, n[i]!];
    return n;
  });
  const dirty = JSON.stringify(areas) !== JSON.stringify(q.data.areas);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Office Boy areas / duties</CardTitle>
        <Chip>{areas.length} areas</Chip>
      </CardHeader>
      <p className="mb-3 text-dense text-muted">Har round mein Office Boy in sab areas ko check karta hai. Masla report par photo zaroori hai.</p>
      <ul className="divide-y divide-line rounded-card border border-line">
        {areas.map((a, i) => (
          <li key={`${a}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
            <Input aria-label={`Area ${i + 1}`} value={a} onChange={(e) => setAreas((x) => x!.map((y, j) => (j === i ? e.target.value : y)))} />
            <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={i === areas.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" disabled={areas.length === 1} onClick={() => setAreas((x) => x!.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (add.trim()) {
            setAreas((x) => [...x!, add.trim()]);
            setAdd('');
          }
        }}
      >
        <Input aria-label="New area" placeholder="Naya area" value={add} onChange={(e) => setAdd(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Plus className="size-4" /> Add
        </Button>
      </form>
      {m.error && (
        <div className="mt-3">
          <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={() => m.mutate(areas.map((a) => a.trim()).filter(Boolean))} loading={m.isPending} disabled={!dirty}>
          Save areas
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setAreas(q.data.areas)}>
            Undo changes
          </Button>
        )}
      </div>
    </Card>
  );
}

function StaffView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'arrival');
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Staff" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'arrival', label: 'Attendance & arrival review' },
          { value: 'rooms', label: 'Room assignment' },
          { value: 'areas', label: 'Office Boy areas' },
        ]}
      />
      <SectionLabel className="sr-only">{tab}</SectionLabel>
      {tab === 'arrival' && <ArrivalTab />}
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'areas' && <AreasTab />}
    </div>
  );
}

export default function StaffPage() {
  return (
    <React.Suspense>
      <StaffView />
    </React.Suspense>
  );
}
