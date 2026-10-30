'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import { ApiError, get, patch, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';

/**
 * Clinic bank accounts (D-080): Manager and MD add / edit the accounts patients transfer to; Reception chooses one
 * when the payment method is "Bank / online". Turned off, never deleted (old payments keep their account).
 */
interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountNo: string;
  active: boolean;
}

function AccountDialog({ account, open, onOpenChange }: { account: BankAccount | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [accountNo, setAccountNo] = React.useState('');
  const m = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), bankName: bankName.trim(), accountNo: accountNo.trim() };
      return account ? patch(`/bank-accounts/${account.id}`, body) : post('/bank-accounts', body);
    },
    onSuccess: () => {
      toast.success(account ? 'Bank account update ho gaya' : 'Bank account add ho gaya');
      void qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onOpenChange(false);
    },
  });
  const { reset } = m;
  React.useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setBankName(account?.bankName ?? '');
    setAccountNo(account?.accountNo ?? '');
    reset();
  }, [open, account, reset]);
  const valid = name.trim().length >= 2 && bankName.trim().length >= 2 && accountNo.trim().length >= 4;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={account ? 'Bank account edit' : 'Naya bank account'} description="Reception online / bank payment par yehi account chunegi.">
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) m.mutate();
          }}
        >
          <Field label="Account title" required htmlFor="ba-name" hint="Jaise: The Vertex Health — Meezan">
            <Input id="ba-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Bank" required htmlFor="ba-bank" hint="Jaise: Meezan Bank, JazzCash, Easypaisa">
            <Input id="ba-bank" value={bankName} maxLength={120} onChange={(e) => setBankName(e.target.value)} />
          </Field>
          <Field label="Account number / IBAN" required htmlFor="ba-no">
            <Input id="ba-no" value={accountNo} maxLength={60} onChange={(e) => setAccountNo(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} loading={m.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BankAccountsPage({ label }: { label: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['bank-accounts'], queryFn: () => get<{ items: BankAccount[] }>('/bank-accounts') });
  const [editing, setEditing] = React.useState<BankAccount | null>(null);
  const [open, setOpen] = React.useState(false);
  const toggle = useMutation({
    mutationFn: (a: BankAccount) => patch(`/bank-accounts/${a.id}`, { active: !a.active }),
    onSuccess: (_r, a) => {
      toast.success(a.active ? 'Account band kar diya — Reception ko ab nahi dikhega' : 'Account dobara chalu');
      void qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update nahi hua'),
  });
  return (
    <div className="space-y-3">
      <PageHeader
        label={label}
        title="Bank Accounts"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden /> Naya account
          </Button>
        }
      />
      <p className="text-dense text-muted">
        Patient bank / online transfer kare to Reception payment mein in mein se account chunti hai. Band kiya hua account Reception ko nahi dikhta; purani payments par waise hi rehta hai.
      </p>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi bank account nahi" emptyHint="“Naya account” se clinic ka bank account add karein.">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Account title', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'bank', header: 'Bank', cell: (r) => r.bankName },
              { key: 'no', header: 'Account no / IBAN', cell: (r) => r.accountNo },
              { key: 'status', header: 'Status', cell: (r) => <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Chalu' : 'Band'}</Chip> },
              {
                key: 'actions',
                header: '',
                cell: (r) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === r.id} onClick={() => toggle.mutate(r)}>
                      {r.active ? 'Band karein' : 'Chalu karein'}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <AccountDialog account={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}
