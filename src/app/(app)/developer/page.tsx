'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Eye, KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { ApiError, get, patch, post } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/links';
import { formatDateTime } from '@/lib/time';
import type { Role } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';
import { ReasonDialog } from '@/components/reception/dialogs';

/**
 * Hidden developer console (D-043): every staff account — create, edit, disable / enable, temporary password — and
 * "view as" any active user (their tabs, data and live notifications, read-only).
 */
const ROLES: Role[] = ['MD', 'MANAGER', 'MARKETING_DIRECTOR', 'MARKETING_LEAD', 'RECEPTIONIST', 'DOCTOR', 'ASSISTANT', 'OFFICE_BOY', 'LEAD_MEMBER'];

interface Account {
  id: string;
  displayName: string;
  role: Role;
  email: string | null;
  phone: string | null;
  memberCode: string | null;
  title: string | null;
  specialty: string | null;
  active: boolean;
  mustChangePassword: boolean;
  attendanceRequired: boolean;
  lastSeenAt: string | null;
}

/** 12 characters, letters and digits (no look-alikes), from the browser's secure random source. */
function generatePassword(): string {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const r = crypto.getRandomValues(new Uint32Array(12));
  const chars = Array.from(r, (n) => all[n % all.length]);
  chars[0] = letters[r[0]! % letters.length]!;
  chars[1] = digits[r[1]! % digits.length]!;
  return chars.join('');
}

function PasswordShown({ password, who }: { password: string; who: string }) {
  return (
    <Notice tone="success">
      <span className="block">
        {who} ka password: <span className="font-mono text-body font-semibold">{password}</span>
      </span>
      <span className="block text-muted">Yeh sirf abhi dikh raha hai — copy karke user ko de dein. Woh ise khud badal nahi sakte; naya chahiye ho to yahin se dein.</span>
      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => void navigator.clipboard?.writeText(password).then(() => toast.success('Copy ho gaya'))}>
        <Copy className="size-4" /> Copy
      </Button>
    </Notice>
  );
}

/** Check-in / check-out on or off for one person (D-049). Off = they never check in; the app treats them as on duty. */
function AttendanceSwitch({ account }: { account: Account }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => patch(`/users/${account.id}`, { attendanceRequired: !account.attendanceRequired }),
    onSuccess: () => {
      toast.success(`${account.displayName}: check-in / check-out ${account.attendanceRequired ? 'band' : 'on'}`);
      void qc.invalidateQueries({ queryKey: ['developer'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Nahi hua'),
  });
  const on = account.attendanceRequired;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Check-in / check-out — ${account.displayName}`}
      title={on ? 'Check-in / check-out zaroori — band karne ke liye dabayein' : 'Check-in / check-out band — on karne ke liye dabayein'}
      disabled={m.isPending}
      onClick={() => m.mutate()}
      className="inline-flex items-center gap-2 text-dense disabled:opacity-50"
    >
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow-card transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className={on ? 'text-ink' : 'text-muted'}>{on ? 'On' : 'Off'}</span>
    </button>
  );
}

function AccountDialog({ account, onClose }: { account?: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!account;
  const [f, setF] = React.useState({
    displayName: account?.displayName ?? '',
    role: (account?.role ?? 'RECEPTIONIST') as Role,
    memberCode: account?.memberCode ?? '',
    email: account?.email ?? '',
    phone: account?.phone ?? '',
    title: account?.title ?? '',
    specialty: account?.specialty ?? '',
    password: editing ? '' : generatePassword(),
  });
  const [created, setCreated] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      editing
        ? patch(`/users/${account!.id}`, {
            displayName: f.displayName.trim(),
            ...(f.role !== account!.role ? { role: f.role } : {}),
            email: f.email.trim() || null,
            phone: f.phone.trim() || null,
            title: f.title.trim() || null,
          })
        : post('/users', {
            displayName: f.displayName.trim(),
            role: f.role,
            memberCode: f.memberCode.trim() || undefined,
            email: f.email.trim() || undefined,
            phone: f.phone.trim() || undefined,
            title: f.title.trim() || undefined,
            specialty: f.role === 'DOCTOR' ? f.specialty.trim() || undefined : undefined,
            password: f.password,
          }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['developer'] });
      if (editing) {
        toast.success('Account update ho gaya');
        onClose();
      } else {
        toast.success(`${f.displayName} ka account ban gaya`);
        setCreated(f.password);
      }
    },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const loginMissing = !f.memberCode.trim() && !f.email.trim() && !f.phone.trim();
  const invalid = f.displayName.trim().length < 2 || (!editing && (loginMissing || f.password.length < 8));
  const doctorLocked = editing && (account!.role === 'DOCTOR');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? `Edit — ${account!.displayName}` : 'Naya staff account'} description={editing ? undefined : 'Member ID, email ya phone — in mein se kisi se login hoga.'}>
        {created ? (
          <div className="space-y-3">
            <PasswordShown password={created} who={f.displayName} />
            <p className="text-dense text-muted">Login: {f.memberCode || f.email || f.phone}</p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid) m.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Naam" required htmlFor="acc-n">
                <Input id="acc-n" value={f.displayName} onChange={set('displayName')} />
              </Field>
              <Field label="Role" required htmlFor="acc-r" hint={doctorLocked ? 'Doctor ka role nahi badalta — naya account banayein' : undefined}>
                <Select id="acc-r" value={f.role} onChange={set('role')} disabled={doctorLocked}>
                  {ROLES.filter((r) => !editing || (r === 'DOCTOR') === (account!.role === 'DOCTOR')).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {!editing && (
                <Field label="Member ID" htmlFor="acc-c" hint="e.g. VH-REC-02">
                  <Input id="acc-c" value={f.memberCode} onChange={set('memberCode')} />
                </Field>
              )}
              <Field label="Email" htmlFor="acc-e">
                <Input id="acc-e" type="email" value={f.email} onChange={set('email')} />
              </Field>
              <Field label="Phone" htmlFor="acc-p">
                <Input id="acc-p" value={f.phone} onChange={set('phone')} placeholder="0300…" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="acc-t" hint="e.g. Clinic Manager">
                <Input id="acc-t" value={f.title} onChange={set('title')} />
              </Field>
              {f.role === 'DOCTOR' && !editing && (
                <Field label="Specialty" htmlFor="acc-s">
                  <Input id="acc-s" value={f.specialty} onChange={set('specialty')} />
                </Field>
              )}
            </div>
            {!editing && (
              <Field label="Password" required htmlFor="acc-pw" hint="Yahi password chalega — user khud nahi badal sakta">
                <div className="flex gap-2">
                  <Input id="acc-pw" value={f.password} onChange={set('password')} className="font-mono" />
                  <Button type="button" variant="secondary" onClick={() => setF((x) => ({ ...x, password: generatePassword() }))}>
                    New
                  </Button>
                </div>
              </Field>
            )}
            {!editing && loginMissing && <p className="text-dense text-danger">Member ID, email ya phone mein se ek zaroori hai.</p>}
            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={m.isPending} disabled={invalid}>
                {editing ? 'Save' : 'Create account'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = React.useState(generatePassword());
  const [done, setDone] = React.useState(false);
  const m = useMutation({
    mutationFn: () => post(`/users/${account.id}/password`, { password }),
    onSuccess: () => {
      setDone(true);
      void qc.invalidateQueries({ queryKey: ['developer'] });
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Naya password — ${account.displayName}`} description="Unke sab devices se sign out ho jayega; agle login se yahi naya password chalega.">
        {done ? (
          <div className="space-y-3">
            <PasswordShown password={password} who={account.displayName} />
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Naya password" htmlFor="tmp-pw">
              <div className="flex gap-2">
                <Input id="tmp-pw" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
                  New
                </Button>
              </div>
            </Field>
            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Password set nahi hua'}</Notice>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button loading={m.isPending} disabled={password.length < 8} onClick={() => m.mutate()}>
                Set password
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DeveloperConsole() {
  const qc = useQueryClient();
  const [filters, setFilters] = React.useState({ q: '', role: '', active: '' });
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
  const q = useQuery({ queryKey: ['developer', 'users', params], queryFn: () => get<{ items: Account[] }>('/developer/users', params) });
  const [dialog, setDialog] = React.useState<{ kind: 'new' } | { kind: 'edit' | 'password' | 'toggle'; account: Account } | null>(null);
  const [viewing, setViewing] = React.useState<string | null>(null);

  const viewAs = async (a: Account) => {
    setViewing(a.id);
    try {
      const r = await post<{ home: string }>('/developer/view-as', { userId: a.id });
      window.location.href = r.home; // full reload: their tabs, data and live channel
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'View as shuru nahi hua');
      setViewing(null);
    }
  };
  const setF = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <PageHeader
        label="Developer"
        title="Staff accounts"
        actions={
          <Button onClick={() => setDialog({ kind: 'new' })}>
            <Plus className="size-4" /> New account
          </Button>
        }
      />
      <FilterBar>
        <Field label="Search" htmlFor="dv-q">
          <Input id="dv-q" value={filters.q} onChange={setF('q')} placeholder="Naam, Member ID, email" />
        </Field>
        <Field label="Role" htmlFor="dv-r">
          <Select id="dv-r" value={filters.role} onChange={setF('role')}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="dv-a">
          <Select id="dv-a" value={filters.active} onChange={setF('active')}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </Select>
        </Field>
      </FilterBar>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi staff account nahi" emptyHint='"New account" se Manager, Reception, Doctor waghera ke accounts banayein.'>
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'n',
                header: 'Naam',
                cell: (r) => (
                  <span>
                    <span className="font-semibold text-ink">{r.displayName}</span>
                    {r.title && <span className="block text-dense text-muted">{r.title}</span>}
                  </span>
                ),
              },
              { key: 'r', header: 'Role', cell: (r) => <Chip tone="brand">{ROLE_LABEL[r.role]}</Chip> },
              { key: 'l', header: 'Login', cell: (r) => [r.memberCode, r.email, r.phone && formatPhone(r.phone)].filter(Boolean).join(' · ') || '—', hideSm: true },
              {
                key: 's',
                header: 'Status',
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Disabled'}</Chip>
                  </span>
                ),
              },
              { key: 'att', header: 'Check-in / out', cell: (r) => <AttendanceSwitch account={r} /> },
              { key: 'seen', header: 'Last seen', cell: (r) => (r.lastSeenAt ? formatDateTime(r.lastSeenAt) : 'never'), hideSm: true },
              {
                key: 'x',
                header: '',
                cell: (r) => (
                  <span className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="secondary" disabled={!r.active} loading={viewing === r.id} onClick={() => void viewAs(r)} title="Inki screens dekhein (read-only)">
                      <Eye className="size-4" /> View as
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'edit', account: r })} aria-label={`Edit ${r.displayName}`}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'password', account: r })} aria-label={`Password ${r.displayName}`} title="Naya password dein">
                      <KeyRound className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className={r.active ? 'text-danger' : undefined} onClick={() => setDialog({ kind: 'toggle', account: r })} aria-label={r.active ? `Disable ${r.displayName}` : `Enable ${r.displayName}`}>
                      {r.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      {dialog?.kind === 'new' && <AccountDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <AccountDialog account={dialog.account} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'password' && <PasswordDialog account={dialog.account} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'toggle' && (
        <ReasonDialog
          title={`${dialog.account.active ? 'Disable' : 'Enable'} — ${dialog.account.displayName}`}
          description={dialog.account.active ? 'Login foran band ho jayega aur sab devices se sign out.' : 'Yeh user dobara login kar sakega.'}
          label="Note (audit)"
          submitLabel={dialog.account.active ? 'Disable' : 'Enable'}
          danger={dialog.account.active}
          onSubmit={async () => {
            await patch(`/users/${dialog.account.id}`, { active: !dialog.account.active });
            toast.success(dialog.account.active ? 'Disabled' : 'Enabled');
            void qc.invalidateQueries({ queryKey: ['developer'] });
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
