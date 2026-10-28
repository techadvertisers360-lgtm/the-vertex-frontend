'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/** Manager: add, edit, take out of use and delete rooms (D-051, D-065). A room old records use is archived, not erased. */

type Kind = 'CONSULT' | 'PROCEDURE' | 'CONSULT_PROCEDURE';
interface RoomRow {
  id: string;
  code: string;
  name: string;
  kind: Kind;
  active: boolean;
  sortOrder: number;
  bookingsAhead: number;
  doctors: string[];
}

const KIND: Record<Kind, string> = { CONSULT: 'Consultation', PROCEDURE: 'Procedure', CONSULT_PROCEDURE: 'Consultation + Procedure' };
const TONE: Record<Kind, 'brand' | 'gold' | 'info'> = { CONSULT: 'brand', PROCEDURE: 'gold', CONSULT_PROCEDURE: 'info' };

function AddRoom() {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ code: '', name: '', kind: 'CONSULT' as Kind });
  const m = useMutation({
    mutationFn: () => post('/manager/rooms-admin', { code: f.code.trim(), name: f.name.trim() || undefined, kind: f.kind }),
    onSuccess: () => {
      toast.success(`Room ${f.code.trim().toUpperCase()} add ho gaya — bookings mein foran use hoga`);
      setF({ code: '', name: '', kind: f.kind });
      void qc.invalidateQueries({ queryKey: ['manager', 'rooms-admin'] });
      void qc.invalidateQueries({ queryKey: ['manager', 'doctor-hours'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Naya room</CardTitle>
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.code.trim()) m.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Room code" required htmlFor="rm-code" hint="Jaise C04 ya P03">
            <Input id="rm-code" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} maxLength={20} />
          </Field>
          <Field label="Naam" htmlFor="rm-name" hint="Optional — jaise Skin room">
            <Input id="rm-name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} maxLength={60} />
          </Field>
          <Field label="Type" required htmlFor="rm-kind">
            <Select id="rm-kind" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value as Kind }))}>
              <option value="CONSULT">Consultation (Doctor checkup)</option>
              <option value="PROCEDURE">Procedure</option>
              <option value="CONSULT_PROCEDURE">Consultation + Procedure (dono ek room mein)</option>
            </Select>
          </Field>
        </div>
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Room add nahi hua'}</Notice>}
        <div className="flex justify-end">
          <Button type="submit" disabled={!f.code.trim()} loading={m.isPending}>
            <Plus className="size-4" /> Add room
          </Button>
        </div>
      </form>
    </Card>
  );
}

function useRoomsRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['manager', 'rooms-admin'] });
    void qc.invalidateQueries({ queryKey: ['manager', 'doctor-hours'] });
  };
}

function EditRoomDialog({ r, onClose }: { r: RoomRow; onClose: () => void }) {
  const refresh = useRoomsRefresh();
  const [f, setF] = React.useState({ code: r.code, name: r.name, kind: r.kind });
  const m = useMutation({
    mutationFn: () => patch(`/manager/rooms-admin/${r.id}`, { code: f.code.trim(), name: f.name.trim(), kind: f.kind }),
    onSuccess: () => {
      toast.success(`Room ${f.code.trim().toUpperCase()} save`);
      refresh();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Room ${r.code} edit`} description={r.bookingsAhead > 0 ? 'Is room mein aage bookings hain — type tab tak nahi badal sakti.' : undefined}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.code.trim()) m.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Room code" required htmlFor="ed-code">
              <Input id="ed-code" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} maxLength={20} />
            </Field>
            <Field label="Naam" htmlFor="ed-name">
              <Input id="ed-name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} maxLength={60} />
            </Field>
            <Field label="Type" required htmlFor="ed-kind">
              <Select id="ed-kind" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value as Kind }))}>
                <option value="CONSULT">Consultation (Doctor checkup)</option>
                <option value="PROCEDURE">Procedure</option>
                <option value="CONSULT_PROCEDURE">Consultation + Procedure (dono ek room mein)</option>
              </Select>
            </Field>
          </div>
          {f.kind === 'PROCEDURE' && r.kind !== 'PROCEDURE' && r.doctors.length > 0 && (
            <Notice tone="warning">Procedure room kisi Doctor ka room nahi ho sakta — {r.doctors.join(', ')} ka room hat jayega.</Notice>
          )}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Room save nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!f.code.trim()} loading={m.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoomDialog({ r, onClose }: { r: RoomRow; onClose: () => void }) {
  const refresh = useRoomsRefresh();
  const m = useMutation({
    mutationFn: () => del<{ archived: boolean }>(`/manager/rooms-admin/${r.id}`),
    onSuccess: () => {
      toast.success(`Room ${r.code} delete ho gaya`);
      refresh();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Room ${r.code} delete karein?`} description="Room list aur bookings se hat jayega. Purani appointments / reports mein iska code dikhta rahega.">
        <div className="space-y-3">
          {r.bookingsAhead > 0 && <Notice tone="warning">Is room mein aage {r.bookingsAhead} booking(s) hain — pehle unhein doosre room / waqt par le jayein.</Notice>}
          {r.doctors.length > 0 && <Notice tone="info">Yeh {r.doctors.join(', ')} ka room hai — delete par Doctor ka room khali ho jayega.</Notice>}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Room delete nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" loading={m.isPending} disabled={r.bookingsAhead > 0} onClick={() => m.mutate()}>
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoomLine({ r }: { r: RoomRow }) {
  const refresh = useRoomsRefresh();
  const [dialog, setDialog] = React.useState<'edit' | 'delete' | null>(null);
  const m = useMutation({
    mutationFn: (body: object) => patch(`/manager/rooms-admin/${r.id}`, body),
    onSuccess: () => {
      toast.success(`Room ${r.code} update`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update nahi hua'),
  });
  return (
    <li className={cn('flex flex-wrap items-center gap-2 py-2', !r.active && 'opacity-60')}>
      <span className="w-16 font-semibold text-ink">{r.code}</span>
      {r.name && r.name !== r.code && <span className="text-ink">{r.name}</span>}
      <Chip tone={TONE[r.kind]}>{KIND[r.kind]}</Chip>
      {!r.active && <Chip>Use mein nahi</Chip>}
      {r.bookingsAhead > 0 && <span className="text-[12px] text-muted">{r.bookingsAhead} booking aage</span>}
      {r.doctors.length > 0 && <span className="text-[12px] text-muted">Doctor: {r.doctors.join(', ')}</span>}
      <span className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setDialog('edit')}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button size="sm" variant="ghost" loading={m.isPending} onClick={() => m.mutate({ active: !r.active })}>
          {r.active ? 'Band karein' : 'Dobara chalu'}
        </Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDialog('delete')}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </span>
      {dialog === 'edit' && <EditRoomDialog r={r} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteRoomDialog r={r} onClose={() => setDialog(null)} />}
    </li>
  );
}

export function RoomsAdmin() {
  const q = useQuery({ queryKey: ['manager', 'rooms-admin'], queryFn: () => get<{ items: RoomRow[] }>('/manager/rooms-admin') });
  return (
    <div className="space-y-4">
      <AddRoom />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi room nahi">
        {(d) => (
          <div className="grid gap-4 xl:grid-cols-3">
            {(['CONSULT', 'PROCEDURE', 'CONSULT_PROCEDURE'] as Kind[]).map((k) => (
              <Card key={k}>
                <CardHeader>
                  <CardTitle>{KIND[k]} rooms</CardTitle>
                  <Chip>{d.items.filter((r) => r.kind === k && r.active).length} in use</Chip>
                </CardHeader>
                <ul className="divide-y divide-line text-dense">
                  {d.items
                    .filter((r) => r.kind === k)
                    .map((r) => (
                      <RoomLine key={r.id} r={r} />
                    ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
