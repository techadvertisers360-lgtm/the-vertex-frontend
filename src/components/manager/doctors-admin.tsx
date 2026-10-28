'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import { ApiError, get, patch, post, put } from '@/lib/api';
import { cn, formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/** Manager: add Doctors, edit their profile, switch them off ("remove") or back on (D-064). Never deleted. */

interface DoctorRow {
  id: string;
  displayName: string;
  specialty: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  memberCode: string | null;
  active: boolean;
  isDemo: boolean;
  roomCode: string | null;
  bookingsAhead: number;
}

const KEYS = [['manager', 'doctors-admin'], ['manager', 'doctor-hours'], ['tracker', 'doctors-today']];

function useRefresh() {
  const qc = useQueryClient();
  return () => KEYS.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
}

function DoctorDialog({ doctor, onClose }: { doctor: DoctorRow | null; onClose: () => void }) {
  const refresh = useRefresh();
  const [f, setF] = React.useState({
    displayName: doctor?.displayName ?? '',
    specialty: doctor?.specialty ?? '',
    title: doctor?.title ?? '',
    email: doctor?.email ?? '',
    phone: doctor?.phone ?? '',
    memberCode: doctor?.memberCode ?? '',
    password: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const profile = {
    displayName: f.displayName.trim(),
    specialty: f.specialty.trim() || null,
    title: f.title.trim() || null,
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    memberCode: f.memberCode.trim() || null,
  };
  const m = useMutation({
    mutationFn: () => (doctor ? patch(`/manager/doctors-admin/${doctor.id}`, profile) : post('/manager/doctors-admin', { ...profile, password: f.password })),
    onSuccess: () => {
      toast.success(doctor ? `${profile.displayName} ki profile save` : `${profile.displayName} add ho gaye — ab timing set karein`);
      refresh();
      onClose();
    },
  });
  const login = profile.email || profile.phone || profile.memberCode;
  const valid = profile.displayName.length >= 2 && !!login && (doctor || f.password.length >= 8);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={doctor ? `Profile — ${doctor.displayName}` : 'Naya Doctor'} description={doctor ? undefined : 'Doctor inhi details aur password se login karenge.'}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) m.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Naam" required htmlFor="dr-name" hint="Jaise Dr Ahmed Ali">
              <Input id="dr-name" value={f.displayName} onChange={set('displayName')} maxLength={100} />
            </Field>
            <Field label="Specialty" htmlFor="dr-spec" hint="Jaise Dermatologist">
              <Input id="dr-spec" value={f.specialty} onChange={set('specialty')} maxLength={120} />
            </Field>
            <Field label="Title" htmlFor="dr-title" hint="Optional — jaise MBBS, FCPS">
              <Input id="dr-title" value={f.title} onChange={set('title')} maxLength={120} />
            </Field>
            <Field label="Phone" htmlFor="dr-phone">
              <Input id="dr-phone" inputMode="tel" value={f.phone} onChange={set('phone')} maxLength={20} />
            </Field>
            <Field label="Email" htmlFor="dr-email">
              <Input id="dr-email" type="email" value={f.email} onChange={set('email')} maxLength={120} />
            </Field>
            <Field label="Member ID" htmlFor="dr-code" hint="Optional login ID">
              <Input id="dr-code" value={f.memberCode} onChange={set('memberCode')} maxLength={20} />
            </Field>
            {!doctor && (
              <Field label="Password" required htmlFor="dr-pw" hint="Kam az kam 8 — letter aur number dono">
                <Input id="dr-pw" type="text" autoComplete="new-password" value={f.password} onChange={set('password')} maxLength={200} />
              </Field>
            )}
          </div>
          {!login && <Notice tone="info">Login ke liye phone, email ya Member ID mein se kam az kam ek likhein.</Notice>}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} loading={m.isPending}>
              {doctor ? 'Save' : 'Add Doctor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ doctor, onClose }: { doctor: DoctorRow; onClose: () => void }) {
  const refresh = useRefresh();
  const m = useMutation({
    mutationFn: () => put(`/manager/doctors-admin/${doctor.id}/active`, { active: false }),
    onSuccess: () => {
      toast.success(`${doctor.displayName} hata diye gaye — ab login ya booking nahi hogi`);
      refresh();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${doctor.displayName} ko hatayein?`} description="Account band ho jayega: login aur nayi booking nahi hogi. Purani appointments aur patient history mehfooz rehti hai; baad mein dobara chalu kar sakte hain.">
        <div className="space-y-3">
          {doctor.bookingsAhead > 0 && <Notice tone="warning">Inki aage {doctor.bookingsAhead} booking(s) hain — pehle unhein doosre Doctor / waqt par reschedule karein.</Notice>}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Doctor hataye nahi gaye — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" loading={m.isPending} disabled={doctor.bookingsAhead > 0} onClick={() => m.mutate()}>
              Hatayein
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DoctorLine({ d, onEdit, onRemove }: { d: DoctorRow; onEdit: () => void; onRemove: () => void }) {
  const refresh = useRefresh();
  const back = useMutation({
    mutationFn: () => put(`/manager/doctors-admin/${d.id}/active`, { active: true }),
    onSuccess: () => {
      toast.success(`${d.displayName} dobara chalu — timing check kar lein`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Chalu nahi hua'),
  });
  const login = [d.phone && formatPhone(d.phone), d.email, d.memberCode].filter(Boolean).join(' · ');
  return (
    <li className={cn('flex flex-wrap items-center gap-2 py-2', !d.active && 'opacity-60')}>
      <span className="min-w-0">
        <span className="font-semibold text-ink">{d.displayName}</span>
        {d.specialty && <span className="text-muted"> · {d.specialty}</span>}
        {d.title && <span className="text-muted"> · {d.title}</span>}
        {login && <span className="block text-[12px] text-muted">{login}</span>}
      </span>
      {d.roomCode && <Chip tone="brand">{d.roomCode}</Chip>}
      {d.isDemo && <Chip>Demo</Chip>}
      {!d.active && <Chip>Hataye gaye</Chip>}
      {d.bookingsAhead > 0 && <span className="text-[12px] text-muted">{d.bookingsAhead} booking aage</span>}
      <span className="ml-auto flex gap-1">
        {d.active ? (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={onRemove}>
              Hatayein
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" loading={back.isPending} onClick={() => back.mutate()}>
            Dobara chalu
          </Button>
        )}
      </span>
    </li>
  );
}

export function DoctorsAdmin() {
  const q = useQuery({ queryKey: ['manager', 'doctors-admin'], queryFn: () => get<{ items: DoctorRow[] }>('/manager/doctors-admin') });
  const [editing, setEditing] = React.useState<DoctorRow | 'new' | null>(null);
  const [removing, setRemoving] = React.useState<DoctorRow | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Doctors</CardTitle>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Naya Doctor
        </Button>
      </CardHeader>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi Doctor nahi">
        {(d) => (
          <ul className="divide-y divide-line text-dense">
            {d.items.map((x) => (
              <DoctorLine key={x.id} d={x} onEdit={() => setEditing(x)} onRemove={() => setRemoving(x)} />
            ))}
          </ul>
        )}
      </QueryState>
      {editing && <DoctorDialog doctor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog doctor={removing} onClose={() => setRemoving(null)} />}
    </Card>
  );
}
