'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import type { AssignOptions, PendingProcedure } from '@/lib/procedure-types';
import { cn, formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';

/**
 * Reception: pick a free checked-in Assistant and a free procedure room (spec §9). Busy / off-duty Assistants and
 * occupied rooms are shown but disabled, so the receptionist sees why. The server re-checks everything.
 */
export function AssignProcedureDialog({ item, onClose }: { item: PendingProcedure; onClose: () => void }) {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const opts = useQuery({ queryKey: ['tracker', 'procedure-options', item.planItemId], queryFn: () => get<AssignOptions>('/reception/procedures/options', { planItemId: item.planItemId }) });
  const [assistantId, setAssistantId] = React.useState('');
  const [roomId, setRoomId] = React.useState('');

  React.useEffect(() => {
    const d = opts.data;
    if (!d) return;
    setRoomId((r) => r || (d.rooms.find((x) => x.preferred && x.free) ?? d.rooms.find((x) => x.free))?.id || '');
    setAssistantId((a) => a || d.assistants.find((x) => x.available)?.id || '');
  }, [opts.data]);

  const m = useMutation({
    mutationFn: (body: { planItemId: string; assistantId: string; roomId: string }) => post('/reception/procedures/assign', body, keyFor(body)),
    onSuccess: () => {
      const a = opts.data?.assistants.find((x) => x.id === assistantId);
      const r = opts.data?.rooms.find((x) => x.id === roomId);
      toast.success(`${item.patient.name}: ${a?.displayName ?? 'Assistant'} · Room ${r?.code ?? ''}`);
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Assistant + room assign karein" description={`${item.patient.name} · ${item.procedureName} (session ${item.sessionNumber}) · ${item.doctorName ?? ''}`}>
        {!item.paymentOk && (
          <Notice
            tone="warning"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href={`/reception/billing/${item.appointmentId}`}>Billing</Link>
              </Button>
            }
          >
            Pehle advance lein: {formatRs(item.advanceRequiredPaisa - item.paidPaisa)} baqi (advance {formatRs(item.advanceRequiredPaisa)}).
          </Notice>
        )}
        {opts.isPending ? (
          <LoadingRows rows={3} />
        ) : opts.isError ? (
          <ErrorState error={opts.error} onRetry={() => opts.refetch()} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (assistantId && roomId) m.mutate({ planItemId: item.planItemId, assistantId, roomId });
            }}
          >
            <div>
              <SectionLabel className="mb-2">Assistant</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {opts.data.assistants.map((a) => (
                  <Choice key={a.id} selected={assistantId === a.id} disabled={!a.available} onClick={() => setAssistantId(a.id)}>
                    <span className="font-semibold">{a.displayName}</span>
                    <Chip tone={a.available ? 'success' : a.busy ? 'warning' : 'neutral'}>{a.available ? 'Free' : a.busy ? 'Busy' : 'Not checked in'}</Chip>
                  </Choice>
                ))}
              </div>
              {!opts.data.assistants.some((a) => a.available) && <p className="mt-2 text-dense text-danger">Koi Assistant free nahi. Manager ko batayein.</p>}
            </div>
            <div>
              <SectionLabel className="mb-2">Procedure room · {opts.data.durationMin} min</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {opts.data.rooms.map((r) => (
                  <Choice key={r.id} selected={roomId === r.id} disabled={!r.free} onClick={() => setRoomId(r.id)}>
                    <span className="font-semibold">{r.code}</span>
                    <span className="text-dense text-muted">{r.free ? (r.preferred ? 'Booked' : 'Free') : 'Busy'}</span>
                  </Choice>
                ))}
              </div>
            </div>
            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Assign nahi hua — dobara koshish karein.'}</Notice>}
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={m.isPending} disabled={!assistantId || !roomId || !item.paymentOk}>
                Assign
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Choice({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center justify-between gap-2 rounded-card border px-3 py-2 text-left text-body transition-colors',
        selected ? 'border-brand bg-brand-light' : 'border-line bg-surface hover:border-brand-medium',
        disabled && 'cursor-not-allowed opacity-50 hover:border-line',
      )}
    >
      {children}
    </button>
  );
}
