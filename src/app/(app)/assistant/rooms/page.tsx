'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DoorOpen } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime } from '@/lib/time';
import type { MyRoom } from '@/lib/procedure-types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { UploadButton } from '@/components/ui/upload';

type Kind = 'OPENING' | 'CLOSING';

/** Opening / closing checklist. Once sent it cannot be edited or reopened (spec §12). */
function ChecklistDialog({ room, kind, onClose }: { room: MyRoom; kind: Kind; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ machineOk: true, roomNeat: false, disinfected: false, stockOk: true, demandSkipped: false });
  const [machineIssue, setMachineIssue] = React.useState('');
  const [stockNotes, setStockNotes] = React.useState('');
  const [photos, setPhotos] = React.useState<string[]>([]);
  const m = useMutation({
    mutationFn: () =>
      post(`/assistant/rooms/${room.id}/checklist`, {
        kind,
        ...v,
        machineIssue: v.machineOk ? undefined : machineIssue,
        stockNotes: v.stockOk ? undefined : stockNotes,
        attachmentIds: photos,
      }),
    onSuccess: () => {
      toast.success(`Room ${room.room.code}: ${kind === 'OPENING' ? 'opening' : 'closing'} checklist Manager ko bhej di`);
      void qc.invalidateQueries({ queryKey: ['queue'] });
      onClose();
    },
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.checked }));
  const invalid = (!v.machineOk && machineIssue.trim().length < 3) || (!v.stockOk && stockNotes.trim().length < 2);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Room ${room.room.code} · ${kind === 'OPENING' ? 'Opening' : 'Closing'} checklist`} description="Bhejne ke baad yeh report badli nahi ja sakti. Manager verify karega.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) m.mutate();
          }}
        >
          <div className="grid gap-1">
            <Checkbox label="Machine theek chal rahi hai" checked={v.machineOk} onChange={set('machineOk')} />
            {!v.machineOk && (
              <div className="space-y-2 pl-6">
                <Field label="Machine ka masla" required htmlFor="ck-issue">
                  <Textarea id="ck-issue" rows={2} value={machineIssue} onChange={(e) => setMachineIssue(e.target.value)} />
                </Field>
                <UploadButton route="machineIssuePhoto" recordType="RoomAssignment" recordId={room.id} label="Masle ki photo" accept="image/*" onUploaded={(id) => setPhotos((p) => [...p, id])} />
              </div>
            )}
            <Checkbox label="Room saaf aur tidy hai" checked={v.roomNeat} onChange={set('roomNeat')} />
            <Checkbox label="Disinfection ho gayi" checked={v.disinfected} onChange={set('disinfected')} />
            <Checkbox label="Stock poora hai" checked={v.stockOk} onChange={set('stockOk')} />
            {!v.stockOk && (
              <div className="space-y-2 pl-6">
                <Field label="Kya kam hai?" required htmlFor="ck-stock">
                  <Textarea id="ck-stock" rows={2} value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} />
                </Field>
                <Checkbox label="Stock demand abhi nahi bhej raha" checked={v.demandSkipped} onChange={set('demandSkipped')} />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <SectionLabel>Room photo (optional)</SectionLabel>
            <UploadButton route="roomChecklistPhoto" recordType="RoomAssignment" recordId={room.id} label={photos.length ? 'Aur photo' : 'Upload photo'} accept="image/*" onUploaded={(id) => setPhotos((p) => [...p, id])} />
            {photos.length > 0 && <p className="text-dense text-success">{photos.length} photo upload ho gayi</p>}
          </div>
          {(!v.roomNeat || !v.disinfected || !v.machineOk || !v.stockOk) && <Notice tone="warning">Masla wali checklist Manager ko foran alert karegi.</Notice>}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein.'}</Notice>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={invalid}>
              Send to Manager
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Room duty for today (spec §6, §12): accept → opening checklist → … → closing checklist before check-out. */
export default function AssistantRoomsPage() {
  const qc = useQueryClient();
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['queue', 'assistant', 'rooms'], queryFn: () => get<{ items: MyRoom[] }>('/assistant/rooms'), refetchInterval: pollInterval });
  const [open, setOpen] = React.useState<{ room: MyRoom; kind: Kind } | null>(null);
  const accept = useMutation({
    mutationFn: (id: string) => post(`/assistant/rooms/${id}/accept`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['queue'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Accept nahi hua'),
  });

  return (
    <div className="space-y-4">
      <PageHeader label="Assistant" title="My rooms" />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi room assign nahi" emptyHint="Manager rooms assign karega — notification aayegi.">
        {(d) => (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {d.items.map((r) => (
                <Card key={r.id} accent={!r.acceptedAt || !r.openingAt ? 'danger' : 'ops'}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DoorOpen className="size-4 text-brand" /> {r.room.code} · {r.room.name}
                    </CardTitle>
                    <Chip tone={r.closingAt ? 'success' : r.openingAt ? 'info' : 'warning'}>{r.closingAt ? 'Closed' : r.openingAt ? 'Open' : r.acceptedAt ? 'Opening baqi' : 'New'}</Chip>
                  </CardHeader>
                  <ul className="mb-3 space-y-1 text-dense text-muted">
                    <li>Accepted: {r.acceptedAt ? formatTime(r.acceptedAt) : '—'}</li>
                    <li>Opening checklist: {r.openingAt ? formatTime(r.openingAt) : 'baqi'}</li>
                    <li>Closing checklist: {r.closingAt ? formatTime(r.closingAt) : 'baqi'}</li>
                  </ul>
                  {!r.acceptedAt ? (
                    <Button onClick={() => accept.mutate(r.id)} loading={accept.isPending && accept.variables === r.id}>
                      Accept room
                    </Button>
                  ) : !r.openingAt ? (
                    <Button onClick={() => setOpen({ room: r, kind: 'OPENING' })}>Opening checklist</Button>
                  ) : !r.closingAt ? (
                    <Button variant="secondary" onClick={() => setOpen({ room: r, kind: 'CLOSING' })}>
                      Closing checklist
                    </Button>
                  ) : (
                    <p className="text-dense text-success">Is room ka din mukammal.</p>
                  )}
                </Card>
              ))}
            </div>
            <p className="text-dense text-muted">Check-out se pehle har accepted room ki closing checklist zaroori hai.</p>
          </>
        )}
      </QueryState>
      {open && <ChecklistDialog room={open.room} kind={open.kind} onClose={() => setOpen(null)} />}
    </div>
  );
}
