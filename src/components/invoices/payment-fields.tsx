'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import type { InvoiceOptions, PatientHit } from '@/lib/invoice-types';
import { rupeesToPaisa } from '@/lib/money';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Select } from '@/components/ui/form';
import { UploadButton } from '@/components/ui/upload';
import { useSession } from '@/lib/session';

export interface PaymentDraft {
  modeId: string;
  amount: string;
  bankAccountId: string;
  reference: string;
  slipId?: string;
}
export const emptyPayment: PaymentDraft = { modeId: '', amount: '', bankAccountId: '', reference: '' };

/** Slip of a non-cash payment, required when the setting is on (D-091). */
export function slipMissing(p: PaymentDraft, options: InvoiceOptions | undefined) {
  return !!options?.requireSlip && paymentNeeds(p, options).needsBank && !p.slipId;
}

export function useInvoiceOptions() {
  return useQuery({ queryKey: ['invoice-setup', 'options'], queryFn: () => get<InvoiceOptions>('/invoices/options'), staleTime: 60_000 });
}

/** The mode's method decides what else is needed, the same rules the server checks. */
export function paymentNeeds(p: PaymentDraft, options: InvoiceOptions | undefined) {
  const method = options?.paymentModes.find((m) => m.id === p.modeId)?.method;
  return { method, needsBank: !!method && method !== 'CASH', needsReference: method === 'BANK_ONLINE' || method === 'CHEQUE' };
}

export function paymentComplete(p: PaymentDraft, options: InvoiceOptions | undefined): boolean {
  const n = paymentNeeds(p, options);
  return !!p.modeId && (!n.needsBank || !!p.bankAccountId) && (!n.needsReference || !!p.reference.trim());
}

export function paymentBody(p: PaymentDraft, extraToAdvance?: boolean) {
  return {
    amountPaisa: rupeesToPaisa(p.amount) ?? 0,
    paymentModeId: p.modeId,
    bankAccountId: p.bankAccountId || undefined,
    reference: p.reference.trim() || undefined,
    ...(p.slipId ? { slipAttachmentId: p.slipId } : {}),
    ...(extraToAdvance ? { extraToAdvance: true } : {}),
  };
}

export function PaymentFields({ value, onChange, options, idPrefix, amountLabel = 'Amount (Rs)', amountHint, withSlip = false }: { withSlip?: boolean; value: PaymentDraft; onChange: (p: PaymentDraft) => void; options: InvoiceOptions | undefined; idPrefix: string; amountLabel?: string; amountHint?: string }) {
  const n = paymentNeeds(value, options);
  const { me } = useSession();
  const set = (patch: Partial<PaymentDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {withSlip && n.needsBank && (
        <div className="sm:col-span-2">
          <UploadButton route="paymentSlip" recordType="Pending" recordId={me.user.id} label={value.slipId ? 'Slip add ho gayi' : options?.requireSlip ? 'Payment slip (zaroori)' : 'Payment slip'} onUploaded={(id) => set({ slipId: id })} />
        </div>
      )}
      <Field label="Payment mode" htmlFor={`${idPrefix}-mode`}>
        <Select id={`${idPrefix}-mode`} value={value.modeId} onChange={(e) => set({ modeId: e.target.value, bankAccountId: '', reference: '' })}>
          <option value="">— Chunein —</option>
          {(options?.paymentModes ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={amountLabel} htmlFor={`${idPrefix}-amount`} hint={amountHint}>
        <Input id={`${idPrefix}-amount`} inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: e.target.value })} />
      </Field>
      {n.needsBank && (
        <Field label="Bank account" required htmlFor={`${idPrefix}-bank`}>
          <Select id={`${idPrefix}-bank`} value={value.bankAccountId} onChange={(e) => set({ bankAccountId: e.target.value })}>
            <option value="">— Chunein —</option>
            {(options?.bankAccounts ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.bankName}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {n.needsReference && (
        <Field label={n.method === 'CHEQUE' ? 'Cheque number' : 'Transaction reference'} required htmlFor={`${idPrefix}-ref`}>
          <Input id={`${idPrefix}-ref`} value={value.reference} onChange={(e) => set({ reference: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

interface NewPatientError {
  existing?: { id: string; name: string }[];
}

function NewPatientDialog({ open, onOpenChange, onCreated, initialName }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (p: PatientHit) => void; initialName: string }) {
  const [form, setForm] = React.useState({ name: '', phone: '', contactConsent: false, whatsappConsent: false, shared: false, reason: '' });
  React.useEffect(() => {
    if (open) setForm({ name: initialName, phone: '', contactConsent: false, whatsappConsent: false, shared: false, reason: '' });
  }, [open, initialName]);
  const m = useMutation({
    mutationFn: () =>
      post<PatientHit>('/invoices/patients', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        contactConsent: form.contactConsent,
        whatsappConsent: form.whatsappConsent,
        ...(form.shared ? { confirmSharedPhone: { reason: form.reason.trim() } } : {}),
      }),
    onSuccess: (p) => {
      onCreated(p);
      onOpenChange(false);
    },
  });
  const duplicate = m.error instanceof ApiError && m.error.code === 'DUPLICATE_PHONE' ? (m.error.details as NewPatientError) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Naya patient">
        <div className="space-y-3">
          <Field label="Naam" required htmlFor="np-name">
            <Input id="np-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Phone" required htmlFor="np-phone">
            <Input id="np-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Checkbox label="Patient ne contact ki ijazat di" checked={form.contactConsent} onChange={(e) => setForm({ ...form, contactConsent: e.target.checked })} />
          <Checkbox label="Patient ne WhatsApp ki ijazat di" checked={form.whatsappConsent} onChange={(e) => setForm({ ...form, whatsappConsent: e.target.checked })} />
          {duplicate && (
            <div className="space-y-2">
              <Notice tone="warning">Yeh number pehle se hai: {(duplicate.existing ?? []).map((x) => x.name).join(', ')}. Agar yeh alag patient hai to neeche tasdeeq karein.</Notice>
              <Checkbox label="Yeh alag patient hai, number share hai" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />
              {form.shared && (
                <Field label="Wajah" required htmlFor="np-reason">
                  <Input id="np-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </Field>
              )}
            </div>
          )}
          {m.error && !duplicate && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua, dobara koshish karein.'}</Notice>}
          <div className="flex justify-end">
            <Button loading={m.isPending} disabled={form.name.trim().length < 2 || form.phone.trim().length < 7 || (form.shared && form.reason.trim().length < 3)} onClick={() => m.mutate()}>
              Patient save karein
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Search an existing patient or add a new one. */
export function PatientPicker({ value, onChange, allowNew = true }: { value: PatientHit | null; onChange: (p: PatientHit | null) => void; allowNew?: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = React.useState('');
  const [q, setQ] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const hits = useQuery({ queryKey: ['invoices', 'patients', q], queryFn: () => get<{ items: PatientHit[] }>('/invoices/patients', { q }), enabled: q.length >= 2 });

  if (value) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-canvas px-3 py-2 text-dense">
        <span>
          <span className="font-semibold text-ink">{value.name}</span> <span className="text-muted">· {formatPhone(value.phone)}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Badlein
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input className="pl-9" aria-label="Patient search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Naam ya phone likhein…" />
        </div>
        {allowNew && (
          <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" aria-hidden /> Naya
          </Button>
        )}
      </div>
      {q.length >= 2 && (
        <ul className="max-h-56 divide-y divide-line overflow-auto rounded-control border border-line">
          {hits.isPending && <li className="px-3 py-2 text-dense text-muted">Dhoond rahe hain…</li>}
          {hits.data?.items.length === 0 && <li className="px-3 py-2 text-dense text-muted">Koi patient nahi mila.</li>}
          {hits.data?.items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange({ id: p.id, name: p.name, phone: p.phone })} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-dense hover:bg-brand-light">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-muted">{formatPhone(p.phone)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewPatientDialog
        open={adding}
        onOpenChange={setAdding}
        initialName={/\d/.test(text) ? '' : text}
        onCreated={(p) => {
          void qc.invalidateQueries({ queryKey: ['invoices', 'patients'] });
          onChange({ id: p.id, name: p.name, phone: p.phone });
        }}
      />
    </div>
  );
}
