'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import type { InvoiceDetail, InvoiceOptions, PatientContext, PatientHit } from '@/lib/invoice-types';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import { clinicDate } from '@/lib/time';
import { cn, formatRs } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Notice, Select } from '@/components/ui/form';
import { emptyPayment, PatientPicker, PaymentFields, paymentBody, paymentComplete, slipMissing, useInvoiceOptions, type PaymentDraft } from './payment-fields';
import { MoneyRow, taxPercent, useInvoiceAccess } from './shared';

interface Line {
  key: string;
  serviceId?: string;
  description: string;
  price: string;
}

/** A preview, using the server's rule (integer paisa, tax inside the discounted total, nearest paisa). The server decides. */
function preview(lines: Line[], discount: number, rateBp: number | null) {
  const prices = lines.map((l) => rupeesToPaisa(l.price));
  const subtotal = prices.reduce<number>((s, p) => s + (p ?? 0), 0);
  const total = subtotal - discount;
  const tax = rateBp && total > 0 ? Math.floor((total * rateBp + (10_000 + rateBp) / 2) / (10_000 + rateBp)) : 0;
  return { subtotal, tax, total, linesValid: lines.length > 0 && prices.every((p) => p !== null) && lines.every((l) => l.description.trim()) };
}

function ServicePicker({ options, onPick }: { options: InvoiceOptions; onPick: (s: InvoiceOptions['services'][number]) => void }) {
  const [text, setText] = React.useState('');
  const [category, setCategory] = React.useState('');
  const needle = text.trim().toLowerCase();
  const shown = options.services.filter((s) => (!category || s.invoiceCategoryId === category) && (!needle || s.name.toLowerCase().includes(needle))).slice(0, 60);
  const categoryName = (id: string | null) => options.categories.find((c) => c.id === id)?.name;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Sab categories</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input className="pl-9" aria-label="Service search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Service ka naam…" />
        </div>
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-auto rounded-control border border-line">
        {shown.length === 0 && <li className="px-3 py-3 text-dense text-muted">Koi service nahi mili. Neeche se apni line add karein.</li>}
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-dense hover:bg-brand-light">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{s.name}</span>
                {categoryName(s.invoiceCategoryId) && <span className="text-[12px] text-muted">{categoryName(s.invoiceCategoryId)}</span>}
              </span>
              <span className="shrink-0 font-semibold text-ink">{s.defaultPricePaisa !== null ? formatRs(s.defaultPricePaisa) : '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InvoiceFormPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { base } = useInvoiceAccess();
  const options = useInvoiceOptions();
  const today = clinicDate();
  const [patient, setPatient] = React.useState<PatientHit | null>(null);
  const [doctorId, setDoctorId] = React.useState('');
  const [date, setDate] = React.useState(today);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [discount, setDiscount] = React.useState('');
  const [applyTax, setApplyTax] = React.useState(true);
  const [useAdvance, setUseAdvance] = React.useState('');
  const [payment, setPayment] = React.useState<PaymentDraft>(emptyPayment);
  const [extraToAdvance, setExtraToAdvance] = React.useState(false);
  const [confirmVisit, setConfirmVisit] = React.useState(false);
  const keyFor = React.useRef(idempotencyFor());

  const context = useQuery({ queryKey: ['invoices', 'context', patient?.id], queryFn: () => get<PatientContext>(`/invoices/patients/${patient!.id}/context`), enabled: !!patient });
  React.useEffect(() => {
    setConfirmVisit(false);
    setUseAdvance('');
  }, [patient?.id]);

  const addLine = (l: Omit<Line, 'key'>) => setLines((ls) => [...ls, { key: crypto.randomUUID(), ...l }]);
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const tax = options.data?.tax;
  // The server uses the non-cash rate when one is set and the first payment is not cash (D-090).
  const mode = options.data?.paymentModes.find((m) => m.id === payment.modeId);
  const usedRate = tax && tax.nonCashRateBp !== null && payment.amount.trim() && mode && mode.method !== 'CASH' ? tax.nonCashRateBp : (tax?.rateBp ?? 0);
  const rateBp = tax?.enabled && applyTax && usedRate > 0 ? usedRate : null;
  const discountPaisa = discount.trim() ? rupeesToPaisa(discount) : 0;
  const advancePaisa = useAdvance.trim() ? rupeesToPaisa(useAdvance) : 0;
  const paidPaisa = payment.amount.trim() ? rupeesToPaisa(payment.amount) : 0;
  const p = preview(lines, discountPaisa ?? 0, rateBp);
  const available = context.data?.advanceBalancePaisa ?? 0;
  const afterAdvance = p.total - (advancePaisa ?? 0);
  const extra = (paidPaisa ?? 0) - Math.max(afterAdvance, 0);
  const balance = Math.max(afterAdvance - (paidPaisa ?? 0), 0);
  const openVisits = context.data?.openVisitsToday ?? [];

  const problems: string[] = [];
  if (discountPaisa === null) problems.push('Discount sahi likhein.');
  else if (discountPaisa > p.subtotal) problems.push('Discount total se zyada nahi ho sakta.');
  if (advancePaisa === null) problems.push('Advance amount sahi likhein.');
  else if (advancePaisa > available) problems.push(`Patient ka advance sirf ${formatRs(available)} hai.`);
  else if (advancePaisa > Math.max(p.total, 0)) problems.push('Advance, total se zyada istemal nahi ho sakta.');
  if (paidPaisa === null) problems.push('Amount sahi likhein.');
  if ((paidPaisa ?? 0) > 0 && !paymentComplete(payment, options.data)) problems.push('Payment mode aur uski tafseel poori karein.');
  if ((paidPaisa ?? 0) > 0 && slipMissing(payment, options.data)) problems.push('Payment slip ki photo add karein.');

  const needsExtraConfirm = (paidPaisa ?? 0) > 0 && extra > 0;
  const ready = !!patient && p.linesValid && problems.length === 0 && (!needsExtraConfirm || extraToAdvance) && (openVisits.length === 0 || confirmVisit);

  const body = {
    patientId: patient?.id,
    doctorId: doctorId || null,
    date,
    lines: lines.map((l) => ({ serviceId: l.serviceId, description: l.description.trim(), unitPricePaisa: rupeesToPaisa(l.price) ?? 0 })),
    discountPaisa: discountPaisa ?? 0,
    applyTax,
    ...(advancePaisa ? { useAdvancePaisa: advancePaisa } : {}),
    ...((paidPaisa ?? 0) > 0 ? { payment: paymentBody(payment, needsExtraConfirm && extraToAdvance) } : {}),
    ...(confirmVisit ? { confirmOpenVisit: true } : {}),
  };
  const save = useMutation({
    mutationFn: () => post<InvoiceDetail>('/invoices', body, keyFor.current(body)),
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.number} save ho gayi`);
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      router.push(`${base}/${inv.id}`);
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        label="Billing"
        title="Add Invoice"
        actions={
          <Link href={base} className={buttonVariants({ variant: 'secondary' })}>
            Wapas
          </Link>
        }
      />

      <Card>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <Field label="Patient" required>
              <PatientPicker value={patient} onChange={setPatient} />
            </Field>
          </div>
          <Field label="Doctor" htmlFor="if-doctor">
            <Select id="if-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Doctor nahi</option>
              {(options.data?.doctors ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="if-date">
            <Input id="if-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {openVisits.length > 0 && (
          <div className="mt-3 space-y-2">
            <Notice tone="warning">Is patient ki aaj visit khuli hai. Visit ka bill Billing se banta hai, jahan Doctor ke charges aur prescription photo lagti hai.</Notice>
            <Checkbox label="Mujhe pata hai. Yeh alag invoice hai, visit ka bill nahi." checked={confirmVisit} onChange={(e) => setConfirmVisit(e.target.checked)} />
          </div>
        )}
        {context.data && context.data.unpaidInvoices.length > 0 && (
          <div className="mt-3">
            <Notice tone="info">
              Pichla baqaya:{' '}
              {context.data.unpaidInvoices.map((u, i) => (
                <React.Fragment key={u.id}>
                  {i > 0 && ', '}
                  <Link className="underline" href={`${base}/${u.id}`}>
                    {u.number}
                  </Link>{' '}
                  ({formatRs(u.balancePaisa)})
                </React.Fragment>
              ))}
            </Notice>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,340px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Service list</CardTitle>
          </CardHeader>
          {options.data && <ServicePicker options={options.data} onPick={(s) => addLine({ serviceId: s.id, description: s.name, price: paisaToRupeesInput(s.defaultPricePaisa) })} />}
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => addLine({ description: '', price: '' })}>
            <Plus className="size-4" aria-hidden /> Apni line add karein
          </Button>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
          </CardHeader>
          {lines.length === 0 ? (
            <p className="py-6 text-center text-dense text-muted">Service list se chunein.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l, i) => (
                <li key={l.key} className="grid grid-cols-[1fr_auto] items-end gap-2 border-b border-line pb-2 sm:grid-cols-[1fr_9rem_auto]">
                  <Field label={`Service ${i + 1}`} htmlFor={`if-desc-${l.key}`} className="col-span-2 sm:col-span-1">
                    <Input id={`if-desc-${l.key}`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                  </Field>
                  <Field label="Price (Rs)" htmlFor={`if-price-${l.key}`}>
                    <Input id={`if-price-${l.key}`} inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} aria-invalid={rupeesToPaisa(l.price) === null} />
                  </Field>
                  <Button type="button" size="icon" variant="ghost" className="text-danger" aria-label={`Service ${i + 1} hatayein`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Discount (Rs)" htmlFor="if-discount">
                <Input id="if-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              {tax?.enabled && <Checkbox label={`Tax lagayein (${taxPercent(tax.rateBp)})`} checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />}
              {available > 0 && (
                <Field label="Advance istemal karein (Rs)" htmlFor="if-advance" hint={`Patient ka advance: ${formatRs(available)}`}>
                  <Input id="if-advance" inputMode="decimal" value={useAdvance} onChange={(e) => setUseAdvance(e.target.value)} />
                </Field>
              )}
              <PaymentFields value={payment} onChange={setPayment} options={options.data} withSlip idPrefix="if-pay" amountLabel="Amount paid now (Rs)" />
              {needsExtraConfirm && <Checkbox label={`Zyada ${formatRs(extra)} patient ke advance mein save karein`} checked={extraToAdvance} onChange={(e) => setExtraToAdvance(e.target.checked)} />}
            </div>
            <dl className="h-fit space-y-1 rounded-control bg-canvas p-3 text-dense">
              <MoneyRow label="Sub Total" paisa={p.subtotal} />
              <MoneyRow label="Discount" text={discountPaisa ? `− ${formatRs(discountPaisa)}` : formatRs(0)} />
              <MoneyRow label={rateBp ? `Tax included (${taxPercent(rateBp)})` : 'Tax'} text={rateBp ? formatRs(p.tax) : 'N/A'} />
              <MoneyRow label="Total" paisa={p.total} strong />
              {!!advancePaisa && <MoneyRow label="Advance" text={`− ${formatRs(advancePaisa)}`} />}
              <MoneyRow label="Paid now" paisa={Math.min(paidPaisa ?? 0, Math.max(afterAdvance, 0))} />
              <MoneyRow label="Balance" paisa={balance} strong tone={balance > 0 ? 'danger' : undefined} />
            </dl>
          </div>

          {problems.length > 0 && lines.length > 0 && <div className="mt-3"><Notice tone="warning">{problems[0]}</Notice></div>}
          {save.error && (
            <div className="mt-3">
              <Notice>{save.error instanceof ApiError ? save.error.message : 'Save nahi hua. Aap ka data mehfooz hai, dobara koshish karein.'}</Notice>
            </div>
          )}
          <div className={cn('mt-4 flex justify-end')}>
            <Button disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>
              Invoice save karein · {formatRs(p.total)}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
