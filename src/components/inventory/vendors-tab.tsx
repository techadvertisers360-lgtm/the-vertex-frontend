'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Wallet } from 'lucide-react';
import { ApiError, get, idempotencyFor, post, put } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { rupeesToPaisa } from '@/lib/money';
import type { DamageRow, Vendor, VendorLedger } from '@/lib/inventory-types';
import { formatPhone, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows, QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { ViewFileButton } from '@/components/ui/file-view';
import { ReasonDialog } from '@/components/reception/dialogs';

function VendorDialog({ v, onClose }: { v?: Vendor; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ name: v?.name ?? '', phone: v?.phone ?? '', address: v?.address ?? '', products: v?.products ?? '', active: v?.active ?? true });
  const m = useMutation({
    mutationFn: () => (v ? put(`/inventory/vendors/${v.id}`, f) : post('/inventory/vendors', f)),
    onSuccess: () => {
      toast.success('Vendor save');
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={v ? `Vendor — ${v.name}` : 'Naya vendor'}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.name.trim().length >= 2) m.mutate();
          }}
        >
          <Field label="Naam" required htmlFor="vd-n">
            <Input id="vd-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="vd-p">
            <Input id="vd-p" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Address" htmlFor="vd-a">
            <Textarea id="vd-a" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <Field label="Products" htmlFor="vd-pr">
            <Input id="vd-pr" value={f.products} onChange={(e) => setF({ ...f, products: e.target.value })} />
          </Field>
          {v && (
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" className="size-4 accent-brand" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
            </label>
          )}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Supplier payment: cash (cash-in-hand) or cheque / bank-online from a chosen bank account. */
function PayDialog({ v, onClose }: { v: Vendor; onClose: () => void }) {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const banks = useQuery({ queryKey: ['inventory', 'banks'], queryFn: () => get<{ items: { id: string; name: string; bankName: string }[] }>('/inventory/bank-accounts') });
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState('CASH');
  const [bank, setBank] = React.useState('');
  const [ref, setRef] = React.useState('');
  const [note, setNote] = React.useState('');
  const paisa = rupeesToPaisa(amount);
  const invalid = !paisa || (method !== 'CASH' && (!bank || !ref.trim()));
  const advance = paisa ? paisa - Math.max(v.balancePaisa, 0) : 0;
  const m = useMutation({
    mutationFn: (body: object) => post(`/inventory/vendors/${v.id}/payments`, body, keyFor(body)),
    onSuccess: () => {
      toast.success(`${formatRs(paisa)} paid to ${v.name}`);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Pay ${v.name}`} description={v.balancePaisa > 0 ? `Baqi payable ${formatRs(v.balancePaisa)}` : v.balancePaisa < 0 ? `Advance pehle se ${formatRs(-v.balancePaisa)}` : 'Koi payable nahi — payment advance mein jayegi'}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) m.mutate({ amountPaisa: paisa, method, bankAccountId: method === 'CASH' ? undefined : bank, reference: ref.trim() || undefined, note: note.trim() || undefined });
          }}
        >
          <Field label="Amount (Rs)" required htmlFor="py-a" hint={paisa && advance > 0 ? `${formatRs(advance)} advance mein jayega` : undefined}>
            <Input id="py-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Kis cheez ki payment" htmlFor="py-n" hint="Optional — e.g. Gloves bill 12 Oct, advance">
            <Input id="py-n" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <Field label="Method" htmlFor="py-m">
            <Select id="py-m" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash (cash in hand)</option>
              <option value="CHEQUE">Cheque</option>
              <option value="BANK_ONLINE">Bank / online</option>
            </Select>
          </Field>
          {method !== 'CASH' && (
            <>
              <Field label="Bank account" required htmlFor="py-b">
                <Select id="py-b" value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option value="">Chunein</option>
                  {banks.data?.items.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.bankName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={method === 'CHEQUE' ? 'Cheque number' : 'Transaction reference'} required htmlFor="py-r">
                <Input id="py-r" value={ref} onChange={(e) => setRef(e.target.value)} />
              </Field>
            </>
          )}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Payment save nahi hui'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={invalid}>
              <Wallet className="size-4" /> Save payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Ledger({ vendorId }: { vendorId: string }) {
  const q = useQuery({ queryKey: ['inventory', 'ledger', vendorId], queryFn: () => get<VendorLedger>(`/inventory/vendors/${vendorId}/ledger`) });
  if (q.isPending) return <LoadingRows rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.entries.length) return <EmptyState title="Abhi koi ledger entry nahi" />;
  const label = { GoodsReceipt: 'Purchase', SupplierReturn: 'Return', SupplierPayment: 'Payment' } as const;
  return (
    <table className="w-full text-dense">
      <thead>
        <tr className="border-b border-line text-left text-muted">
          <th className="py-1">Date</th>
          <th className="py-1">Entry</th>
          <th className="py-1 text-right">Amount</th>
          <th className="py-1 text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {q.data.entries.map((e) => (
          <tr key={e.id} className="border-b border-line align-top">
            <td className="py-1.5 pr-2">{formatDateTime(e.at)}</td>
            <td className="py-1.5 pr-2">
              <span className="font-semibold">{label[e.kind]}</span>
              <span className="block text-muted">
                {e.payment ? `${titleCase(e.payment.method)}${e.payment.reference ? ` · ${e.payment.reference}` : ''}${e.payment.note ? ` · ${e.payment.note}` : ''}` : e.return ? `${e.return.quantity} · ${e.return.reason}` : e.memo}
              </span>
              {e.receipt?.attachmentId && <ViewFileButton attachmentId={e.receipt.attachmentId} label="Invoice" />}
            </td>
            <td className={`py-1.5 text-right font-semibold ${e.amountPaisa < 0 ? 'text-success' : 'text-ink'}`}>{formatRs(e.amountPaisa)}</td>
            <td className="py-1.5 text-right">{formatRs(e.balancePaisa)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function VendorsTab() {
  const q = useQuery({ queryKey: ['inventory', 'vendors'], queryFn: () => get<{ items: Vendor[] }>('/inventory/vendors') });
  const [sel, setSel] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState<Vendor | 'new' | null>(null);
  const [pay, setPay] = React.useState<Vendor | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setEdit('new')}>
          <Plus className="size-4" /> New vendor
        </Button>
      </div>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi vendor nahi">
        {(d) => {
          const current = d.items.find((v) => v.id === sel) ?? null;
          return (
            <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
              <ul className="space-y-2">
                {d.items.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => setSel(v.id)} className={`w-full rounded-card border border-line bg-surface p-3 text-left shadow-card hover:bg-brand-light ${sel === v.id ? 'bg-brand-light ring-1 ring-brand-medium' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-dense font-semibold text-ink">{v.name}</span>
                        {!v.active ? <Chip>Inactive</Chip> : v.balancePaisa > 0 ? <Chip tone="warning">{formatRs(v.balancePaisa)}</Chip> : v.balancePaisa < 0 ? <Chip tone="info">Advance {formatRs(-v.balancePaisa)}</Chip> : <Chip tone="success">Settled</Chip>}
                      </div>
                      <p className="text-[12px] text-muted">{[v.phone && formatPhone(v.phone), v.products, v.paidPaisa ? `Paid ${formatRs(v.paidPaisa)}` : null].filter(Boolean).join(' · ')}</p>
                    </button>
                  </li>
                ))}
              </ul>
              {current ? (
                <Card accent="ops">
                  <CardHeader>
                    <div className="min-w-0">
                      <CardTitle>{current.name}</CardTitle>
                      <p className="text-dense text-muted">{[current.phone, current.address].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(current)}>
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => setPay(current)} disabled={!current.active}>
                        <Wallet className="size-4" /> Pay
                      </Button>
                    </div>
                  </CardHeader>
                  <p className="mb-2 flex flex-wrap gap-x-4 text-card-title text-ink">
                    <span>{current.balancePaisa < 0 ? `Advance ${formatRs(-current.balancePaisa)}` : `Payable ${formatRs(current.balancePaisa)}`}</span>
                    <span className="text-success">Total paid {formatRs(current.paidPaisa)}</span>
                  </p>
                  <Ledger vendorId={current.id} />
                </Card>
              ) : (
                <EmptyState title="Vendor chunein" hint="Ledger: purchases, returns, payments aur balance." />
              )}
            </div>
          );
        }}
      </QueryState>
      {edit && <VendorDialog v={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {pay && <PayDialog v={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

/** Damage / breakage write-off queue (Manager approves; Manager's own reports go to the MD). */
export function DamageTab() {
  const qc = useQueryClient();
  const [scope, setScope] = React.useState<'pending' | 'all'>('pending');
  const [reject, setReject] = React.useState<DamageRow | null>(null);
  const q = useQuery({ queryKey: ['inventory', 'damage', scope], queryFn: () => get<{ items: DamageRow[] }>('/inventory/damage', { scope }) });
  const approve = useMutation({
    mutationFn: (id: string) => post(`/inventory/damage/${id}/decision`, { approve: true }),
    onSuccess: (_r, id) => {
      toast.success(q.data?.items.find((x) => x.id === id)?.written ? 'Report approve — Office Boy ko bata diya' : 'Write-off approve — stock kam ho gaya');
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Approve nahi hua'),
  });
  return (
    <div className="space-y-3">
      <Segmented<'pending' | 'all'>
        value={scope}
        onChange={setScope}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'all', label: 'All' },
        ]}
      />
      <p className="text-dense text-muted">Manager ki apni damage report MD approve karte hain.</p>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi damage report nahi">
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((r) => (
              <Card key={r.id} accent={r.status === 'PENDING' ? 'danger' : 'ops'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{r.written ? r.itemName : `${r.itemName} × ${r.quantity} ${r.unit}`}</CardTitle>
                    <p className="text-dense text-muted">
                      {r.reportedBy} · {formatDateTime(r.createdAt)}
                      {r.written ? ' · likhi hui report (stock item nahi)' : r.lotNo ? ` · lot ${r.lotNo}` : ' · FEFO'}
                    </p>
                  </div>
                  <StatusChip status={r.status} />
                </CardHeader>
                <p className="text-body text-ink">{r.reason}</p>
                {r.decisionReason && <p className="text-dense text-muted">Decision: {r.decisionReason}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.attachmentId && <ViewFileButton attachmentId={r.attachmentId} label="Photo" />}
                  {r.status === 'PENDING' && (
                    <>
                      <Button size="sm" onClick={() => approve.mutate(r.id)} loading={approve.isPending && approve.variables === r.id}>
                        {r.written ? 'Theek hai — dekh liya' : 'Approve write-off'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setReject(r)}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {reject && (
        <ReasonDialog
          title="Damage report reject"
          label="Wajah"
          submitLabel="Reject"
          danger
          onSubmit={async ({ reason }) => {
            await post(`/inventory/damage/${reject.id}/decision`, { approve: false, reason });
            toast.success('Reject — reporter ko bata diya');
            void qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
          onClose={() => setReject(null)}
        />
      )}
    </div>
  );
}
