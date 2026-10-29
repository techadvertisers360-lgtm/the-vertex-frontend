'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, FileCheck2, Lock, Pill, Plus, Star, Undo2 } from 'lucide-react';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { InvoiceDetail } from '@/lib/types';
import { cn, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows, MESSAGES } from '@/components/ui/states';
import { UploadButton } from '@/components/ui/upload';
import { ViewFileButton } from '@/components/ui/file-view';
import { rupeesToPaisa } from '@/lib/money';
import { InstallmentList } from '@/components/reception/installments';
import { AssignProcedureDialog } from '@/components/procedures/assign-dialog';
import { stepLabel, type PendingProcedure, type ProcedureTaskView } from '@/lib/procedure-types';

interface PharmacyProduct {
  id: string;
  name: string;
  baseUnit: string;
  salePricePaisa: number | null;
  usable: number;
}

/**
 * Pharmacy after the prescription pad photo (D-048): product, quantity, price and a discount as % or a fixed amount.
 * The server computes the amounts; the line is added to the invoice and the stock goes down.
 */
function PharmacyCard({ inv }: { inv: InvoiceDetail }) {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ['pharmacy-products'], queryFn: () => get<{ items: PharmacyProduct[] }>('/reception/pharmacy/products') });
  const keyFor = React.useRef(idempotencyFor()).current;
  const empty = { itemId: '', quantity: '1', price: '', discountType: 'PERCENT' as 'PERCENT' | 'FIXED', discount: '' };
  const [f, setF] = React.useState(empty);
  const item = products.data?.items.find((i) => i.id === f.itemId);
  const qty = Number(f.quantity);
  const price = rupeesToPaisa(f.price);
  const gross = price !== null && Number.isInteger(qty) && qty > 0 ? price * qty : null;
  const pct = f.discountType === 'PERCENT' && f.discount ? Number(f.discount) : 0;
  const fixed = f.discountType === 'FIXED' && f.discount ? rupeesToPaisa(f.discount) : 0;
  const disc = gross === null ? 0 : f.discountType === 'PERCENT' ? Math.round((gross * Math.round(pct * 100)) / 10_000) : (fixed ?? 0);
  const discountOk = f.discountType === 'PERCENT' ? Number.isFinite(pct) && pct >= 0 && pct <= 100 : fixed !== null;
  const valid = !!item && gross !== null && discountOk && disc <= gross && qty <= item.usable;
  const body = {
    itemId: f.itemId,
    quantity: qty,
    unitPricePaisa: price ?? 0,
    discount: !f.discount ? { type: 'NONE' as const } : f.discountType === 'PERCENT' ? { type: 'PERCENT' as const, percent: pct } : { type: 'FIXED' as const, amountPaisa: fixed ?? 0 },
  };
  const add = useMutation({
    mutationFn: () => post(`/reception/invoices/${inv.id}/pharmacy`, body, keyFor(body)),
    onSuccess: () => {
      toast.success(`${item?.name ?? 'Product'} invoice mein add`);
      setF(empty);
      void qc.invalidateQueries({ queryKey: ['tracker', 'invoice', inv.id] });
      void qc.invalidateQueries({ queryKey: ['pharmacy-products'] });
    },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF((x) => {
      if (k !== 'itemId') return { ...x, [k]: v };
      const p = products.data?.items.find((i) => i.id === v);
      return { ...x, itemId: v, price: p && p.salePricePaisa !== null ? String(p.salePricePaisa / 100) : x.price };
    });
  };
  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>
          <Pill className="mr-1 inline size-4" /> Add pharmacy
        </CardTitle>
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) add.mutate();
        }}
      >
        <Field label="Product" required htmlFor="ph-item">
          <Select id="ph-item" value={f.itemId} onChange={set('itemId')}>
            <option value="">Product chunein</option>
            {products.data?.items.map((i) => (
              <option key={i.id} value={i.id} disabled={i.usable <= 0}>
                {i.name} — {formatRs(i.salePricePaisa)} · stock {i.usable} {i.baseUnit}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qty" required htmlFor="ph-qty" hint={item ? `Stock: ${item.usable}` : undefined}>
            <Input id="ph-qty" inputMode="numeric" value={f.quantity} onChange={set('quantity')} />
          </Field>
          <Field label="Price (Rs / unit)" required htmlFor="ph-price">
            <Input id="ph-price" inputMode="decimal" value={f.price} onChange={set('price')} />
          </Field>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <Field label="Discount" htmlFor="ph-dtype">
            <Select id="ph-dtype" value={f.discountType} onChange={set('discountType')}>
              <option value="PERCENT">% Percentage</option>
              <option value="FIXED">Rs Fixed</option>
            </Select>
          </Field>
          <Field label={f.discountType === 'PERCENT' ? 'Discount %' : 'Discount (Rs)'} htmlFor="ph-disc">
            <Input id="ph-disc" inputMode="decimal" value={f.discount} onChange={set('discount')} placeholder="0" />
          </Field>
        </div>
        {gross !== null && (
          <p className="text-dense">
            {formatRs(gross)}
            {disc ? ` − ${formatRs(disc)}` : ''} = <b>{formatRs(gross - disc)}</b>
          </p>
        )}
        {item && qty > item.usable && <Notice tone="warning">Sirf {item.usable} {item.baseUnit} stock mein hai.</Notice>}
        {gross !== null && disc > gross && <Notice tone="warning">Discount total se zyada nahi ho sakta.</Notice>}
        {add.error && <Notice>{add.error instanceof ApiError ? add.error.message : 'Add nahi hua — dobara koshish karein'}</Notice>}
        <Button type="submit" className="w-full" disabled={!valid} loading={add.isPending}>
          <Plus className="size-4" /> Add to invoice
        </Button>
        {products.data && products.data.items.length === 0 && <p className="text-[12px] text-muted">Pharmacy mein koi product nahi — Stock &amp; batches → Pharmacy se add karein.</p>}
      </form>
    </Card>
  );
}

function ReverseButton({ invoiceId, lineId }: { invoiceId: string; lineId: string }) {
  const qc = useQueryClient();
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const m = useMutation({
    mutationFn: (why: string) => post(`/reception/invoices/${invoiceId}/pharmacy/${lineId}/reverse`, { reason: why }),
    onSuccess: () => {
      toast.success('Pharmacy line wapas — stock wapas aa gaya');
      void qc.invalidateQueries({ queryKey: ['tracker', 'invoice', invoiceId] });
      void qc.invalidateQueries({ queryKey: ['pharmacy-products'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Wapas nahi hua'),
  });
  if (!asking)
    return (
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)} title="Ghalti se add hui line wapas karein">
        <Undo2 className="size-4" /> Wapas
      </Button>
    );
  return (
    <span className="flex items-center gap-1">
      <Input aria-label="Wajah" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wajah" className="h-8 w-28" />
      <Button size="sm" variant="danger" disabled={reason.trim().length < 2} loading={m.isPending} onClick={() => m.mutate(reason.trim())}>
        OK
      </Button>
    </span>
  );
}

/** Same-day procedures of this visit: assign once the advance is paid; then the live step (spec §9). */
function SameDayCard({ appointmentId }: { appointmentId: string }) {
  const pending = useQuery({ queryKey: ['tracker', 'procedures', 'pending'], queryFn: () => get<{ items: PendingProcedure[] }>('/reception/procedures/pending') });
  const active = useQuery({ queryKey: ['tracker', 'procedures', 'active'], queryFn: () => get<{ items: ProcedureTaskView[] }>('/reception/procedures/active') });
  const [assigning, setAssigning] = React.useState<PendingProcedure | null>(null);
  const mine = (pending.data?.items ?? []).filter((p) => p.appointmentId === appointmentId);
  const running = (active.data?.items ?? []).filter((t) => t.appointmentId === appointmentId);
  if (!mine.length && !running.length) return null;
  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>Same-day procedure</CardTitle>
      </CardHeader>
      <ul className="space-y-3">
        {mine.map((p) => (
          <li key={p.planItemId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-dense">
              <span className="font-semibold text-ink">{p.procedureName}</span>
              <span className={p.paymentOk ? 'block text-success' : 'block text-danger'}>{p.paymentOk ? 'Advance received' : `Advance baqi: ${formatRs(p.advanceRequiredPaisa - p.paidPaisa)}`}</span>
            </span>
            <Button size="sm" disabled={!p.paymentOk} onClick={() => setAssigning(p)}>
              Assign Assistant + room
            </Button>
          </li>
        ))}
        {running.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-dense">
            <span>
              <span className="font-semibold text-ink">{t.procedure?.procedureName}</span> · {t.assistantName} · Room {t.roomCode}
            </span>
            <Chip tone={t.status === 'BLOCKED' ? 'danger' : 'info'}>{t.status === 'BLOCKED' ? 'Emergency' : stepLabel(t.currentStep)}</Chip>
          </li>
        ))}
      </ul>
      {assigning && <AssignProcedureDialog item={assigning} onClose={() => setAssigning(null)} />}
    </Card>
  );
}

function PaymentForm({ inv }: { inv: InvoiceDetail }) {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState('CASH');
  const [reference, setReference] = React.useState('');
  const [bank, setBank] = React.useState(inv.bankAccounts[0]?.id ?? '');
  const paisa = rupeesToPaisa(amount);
  const m = useMutation({
    mutationFn: (body: unknown) => post<{ payment: { receiptNo: string }; replayed: boolean }>(`/reception/invoices/${inv.id}/payments`, body, keyFor(body)),
    onSuccess: (r) => {
      toast.success(`Payment save — receipt ${r.payment.receiptNo}`);
      setAmount('');
      setReference('');
      void qc.invalidateQueries({ queryKey: ['tracker'] });
    },
  });
  const tooMuch = paisa !== null && paisa > inv.balancePaisa;
  const needsRef = method === 'CHEQUE' || method === 'BANK_ONLINE';
  const invalid = !paisa || tooMuch || (method !== 'CASH' && !bank) || (needsRef && !reference.trim());
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) m.mutate({ amountPaisa: paisa, method, reference: reference || undefined, bankAccountId: method === 'CASH' ? undefined : bank });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (Rs)" required htmlFor="pay-amt" error={tooMuch ? `Balance ${formatRs(inv.balancePaisa)} se zyada` : amount && !paisa ? 'Sahi amount likhein' : undefined}>
          <Input id="pay-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(inv.balancePaisa / 100)} />
        </Field>
        <Field label="Method" htmlFor="pay-m">
          <Select id="pay-m" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_ONLINE">Bank / online</option>
            <option value="CHEQUE">Cheque</option>
          </Select>
        </Field>
        {method !== 'CASH' && (
          <Field label="Bank account" required htmlFor="pay-b">
            <Select id="pay-b" value={bank} onChange={(e) => setBank(e.target.value)}>
              {inv.bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.bankName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {method !== 'CASH' && (
          <Field label={method === 'CHEQUE' ? 'Cheque number' : 'Reference'} required={needsRef} htmlFor="pay-r">
            <Input id="pay-r" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        )}
      </div>
      {m.error && (
        <Notice action={m.error instanceof ApiError && m.error.isNetwork ? <Button size="sm" variant="secondary" type="submit">Retry</Button> : undefined}>
          {m.error instanceof ApiError ? m.error.message : 'Payment save nahi hua'}
        </Notice>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setAmount(String(inv.balancePaisa / 100))} disabled={!inv.balancePaisa}>
          Full balance
        </Button>
        <Button type="submit" loading={m.isPending} disabled={invalid}>
          Receive payment
        </Button>
      </div>
    </form>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-dense text-ink">{label}</span>
      <div className="flex" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} stars`} onClick={() => onChange(n)} className="p-1">
            <Star className={cn('size-6', n <= value ? 'fill-gold text-gold' : 'text-line')} />
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackCard({ inv }: { inv: InvoiceDetail }) {
  const qc = useQueryClient();
  const [r, setR] = React.useState({ doctorRating: 0, staffRating: 0, clinicRating: 0 });
  const [suggestion, setSuggestion] = React.useState('');
  const m = useMutation({
    mutationFn: (skip: boolean) => post(`/reception/appointments/${inv.appointment.id}/feedback`, skip ? { skip: true } : { ...r, suggestion: suggestion || undefined }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tracker'] }),
  });
  const fb = inv.feedback;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient feedback</CardTitle>
        {fb?.submittedAt ? <Chip tone="success">Saved</Chip> : fb?.skipped ? <Chip>Skipped</Chip> : <Chip tone="info">Optional</Chip>}
      </CardHeader>
      {fb?.submittedAt || fb?.skipped ? (
        <p className="text-dense text-muted">{fb.submittedAt ? `Doctor ${fb.doctorRating}/5 · Staff ${fb.staffRating}/5 · Clinic ${fb.clinicRating}/5` : 'Patient ne feedback skip kiya — invoice close par koi asar nahi.'}</p>
      ) : (
        <div className="space-y-2">
          <Stars label="Doctor" value={r.doctorRating} onChange={(v) => setR({ ...r, doctorRating: v })} />
          <Stars label="Staff" value={r.staffRating} onChange={(v) => setR({ ...r, staffRating: v })} />
          <Stars label="Clinic" value={r.clinicRating} onChange={(v) => setR({ ...r, clinicRating: v })} />
          <Textarea rows={2} aria-label="Suggestion" placeholder="Suggestion (optional)" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => m.mutate(true)} disabled={m.isPending}>
              Skip
            </Button>
            <Button size="sm" onClick={() => m.mutate(false)} loading={m.isPending} disabled={!r.doctorRating || !r.staffRating || !r.clinicRating}>
              Save feedback
            </Button>
          </div>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
        </div>
      )}
    </Card>
  );
}

export default function BillingDetailPage() {
  const { id: appointmentId } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const open = useQuery({ queryKey: ['tracker', 'invoice-open', appointmentId], queryFn: () => post<{ id: string }>(`/reception/appointments/${appointmentId}/invoice`), retry: false, staleTime: Infinity });
  const invoiceId = open.data?.id;
  const q = useQuery({ queryKey: ['tracker', 'invoice', invoiceId], queryFn: () => get<InvoiceDetail>(`/reception/invoices/${invoiceId}`), enabled: !!invoiceId });
  const close = useMutation({
    mutationFn: () => post(`/reception/invoices/${invoiceId}/close`),
    onSuccess: () => {
      toast.success('Invoice close — Patient Done. Doctor ko notice aur patient ko shukriya bhej diya.');
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      router.push('/reception/done');
    },
  });

  if (open.isError) return <ErrorState error={open.error} onRetry={() => open.refetch()} />;
  if (open.isPending || q.isPending) return <LoadingRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const inv = q.data;
  const a = inv.appointment;
  const closed = inv.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <Link href="/reception/billing" className="inline-flex items-center gap-1 text-dense font-semibold text-brand-medium hover:underline">
        <ArrowLeft className="size-4" /> Billing
      </Link>
      <Card accent="ops">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>Invoice {inv.number}</SectionLabel>
            <h1 className="text-title text-ink">{a.patient.name}</h1>
            <p className="text-body text-muted">
              {a.doctorName ?? 'Doctor nahi'} · {formatDateTime(a.startAt)} · {titleCase(a.type)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip status={a.status} />
            <Chip tone={closed ? 'success' : 'info'}>{closed ? 'Invoice closed' : 'Invoice open'}</Chip>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Charges</CardTitle>
            </CardHeader>
            {inv.lines.length === 0 ? (
              <Notice tone="warning">Doctor ke charges abhi nahi aaye. Doctor plan / charges ke baad invoice update hogi.</Notice>
            ) : (
              <table className="w-full text-dense">
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id} className={cn('border-b border-line', l.reversed && 'text-muted line-through')}>
                      <td className="py-2 pr-2 text-ink">
                        {l.description}
                        {l.stockItemId && Math.abs(l.quantity) !== 1 ? ` × ${Math.abs(l.quantity)}` : ''}
                        {l.reason && <span className="block text-[12px] text-muted">{l.reason}</span>}
                      </td>
                      <td className="py-2 text-right text-muted">
                        {l.discountPaisa ? `${formatRs(l.unitPricePaisa * Math.abs(l.quantity))} − ${formatRs(Math.abs(l.discountPaisa))}${l.discountPercentBp ? ` (${l.discountPercentBp / 100}%)` : ''}` : ''}
                      </td>
                      <td className="py-2 pl-3 text-right font-semibold">{formatRs(l.lineTotalPaisa)}</td>
                      <td className="py-2 pl-1 text-right">{!closed && l.stockItemId && !l.reversesLineId && !l.reversed && <ReverseButton invoiceId={inv.id} lineId={l.id} />}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-2 text-muted">Total discount</td>
                    <td />
                    <td className="pt-2 text-right text-muted">{formatRs(inv.discountPaisa)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1 text-card-title">Total</td>
                    <td />
                    <td className="pt-1 text-right text-card-title">{formatRs(inv.totalPaisa)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1 text-success">Paid</td>
                    <td />
                    <td className="pt-1 text-right font-semibold text-success">{formatRs(inv.paidPaisa)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1 font-semibold text-ink">Balance</td>
                    <td />
                    <td className="pt-1 text-right text-card-title text-ink">{formatRs(inv.balancePaisa)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            {inv.installments.length > 0 && <InstallmentList items={inv.installments} />}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            {inv.payments.length > 0 && (
              <ul className="mb-3 divide-y divide-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-dense">
                    <span>
                      <span className="font-semibold">{p.receiptNo}</span> · {titleCase(p.method)}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted">{formatDateTime(p.receivedAt)}</span>
                      <span className="font-semibold">{formatRs(p.amountPaisa)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!closed && inv.balancePaisa > 0 ? <PaymentForm inv={inv} /> : <p className="text-dense text-muted">{closed ? 'Invoice closed.' : 'Koi balance baqi nahi.'}</p>}
          </Card>
        </div>
        <div className="space-y-4">
          {!closed && <SameDayCard appointmentId={a.id} />}
          <Card accent={inv.prescription ? 'ops' : 'danger'}>
            <CardHeader>
              <CardTitle>Prescription pad photo</CardTitle>
              {inv.prescription ? <Chip tone="success">Uploaded</Chip> : <Chip tone="danger">Required</Chip>}
            </CardHeader>
            {inv.prescription ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-dense text-ink">
                  <FileCheck2 className="size-4 text-success" /> {inv.prescription.fileName} · {formatDateTime(inv.prescription.createdAt)}
                </p>
                <ViewFileButton attachmentId={inv.prescription.id} />
              </div>
            ) : closed ? null : (
              <UploadButton route="prescriptionPhoto" recordType="Invoice" recordId={inv.id} label="Prescription photo upload" accept="image/*" onUploaded={() => void qc.invalidateQueries({ queryKey: ['tracker', 'invoice', inv.id] })} />
            )}
          </Card>
          {!closed && (inv.prescription ? <PharmacyCard inv={inv} /> : <p className="text-dense text-muted">Prescription photo upload hone ke baad yahan pharmacy add hogi.</p>)}
          {!closed && <FeedbackCard inv={inv} />}
          {!closed && (
            <Card>
              <CardTitle className="mb-2">Close invoice → Patient Done</CardTitle>
              {inv.closeBlockers.length > 0 && (
                <div className="mb-3 space-y-2">
                  {inv.closeBlockers.map((b) => (
                    <Notice key={b} tone="warning">
                      <Lock className="mr-1 inline size-4" />
                      {b}
                    </Notice>
                  ))}
                </div>
              )}
              {close.error && <Notice>{close.error instanceof ApiError ? close.error.message : 'Close nahi hua'}</Notice>}
              <Button className="mt-2 w-full" disabled={!inv.canClose} loading={close.isPending} onClick={() => close.mutate()} title={inv.canClose ? undefined : MESSAGES.prescriptionRequired}>
                <CheckCircle2 className="size-4" /> Close invoice
              </Button>
              {inv.balancePaisa > 0 && inv.canClose && <p className="mt-2 text-[12px] text-muted">Baqi balance {formatRs(inv.balancePaisa)} installments mein rahega.</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
