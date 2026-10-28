'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, post } from '@/lib/api';
import { meQueryKey, useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Field, Input, Notice } from '@/components/ui/form';

/** Change my own password (D-043). Required first when an admin has set a temporary password. */
export default function ChangePasswordPage() {
  const { me } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = React.useState({ current: '', next: '', confirm: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const strong = f.next.length >= 8 && /[A-Za-z]/.test(f.next) && /\d/.test(f.next);
  const mismatch = !!f.confirm && f.next !== f.confirm;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader label={me.user.displayName} title="Password badlein" />
      {me.user.mustChangePassword && <Notice tone="warning">Aap ko temporary password diya gaya tha. Aage barhne se pehle apna naya password banayein.</Notice>}
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!f.current || !strong || f.next !== f.confirm) return;
            setSaving(true);
            setError(null);
            try {
              await post('/me/password', { currentPassword: f.current, newPassword: f.next });
              toast.success('Password badal gaya. Baaqi devices se sign out ho gaye.');
              await qc.invalidateQueries({ queryKey: meQueryKey });
              router.replace(me.home);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Password nahi badla — dobara koshish karein.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field label="Purana / temporary password" required htmlFor="pw-cur">
            <Input id="pw-cur" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} />
          </Field>
          <Field label="Naya password" required htmlFor="pw-new" hint="Kam az kam 8 characters, letter aur number dono" error={f.next && !strong ? 'Kam az kam 8 characters, letter aur number dono' : undefined}>
            <Input id="pw-new" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} />
          </Field>
          <Field label="Naya password dobara" required htmlFor="pw-conf" error={mismatch ? 'Dono password ek jaise nahi' : undefined}>
            <Input id="pw-conf" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Button type="submit" loading={saving} disabled={!f.current || !strong || mismatch || !f.confirm}>
            Password badlein
          </Button>
        </form>
      </Card>
    </div>
  );
}
