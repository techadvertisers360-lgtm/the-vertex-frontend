'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, MessageCircle, Printer, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import type { InvoiceDetail } from '@/lib/invoice-types';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime } from '@/lib/time';
import { formatPhone, formatRs } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { emptyPayment, PaymentFields, paymentBody, paymentComplete, useInvoiceOptions } from './payment-fields';
import { AuditList } from './audit-list';
import { METHOD_LABEL, MoneyRow, taxPercent, useInvoiceAccess } from './shared';

function useInvoiceSaved(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['invoice', id] });
  };
}

function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : 'Save nahi hua. Aap ka data mehfooz hai, dobara koshish karein.';
}

function PaymentDialog({ inv, open, onOpenChange }: { inv: InvoiceDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const options = useInvoiceOptions();
  const saved = useInvoiceSaved(inv.id);
  const [p, setP] = React.useState({ ...emptyPayment, amount: paisaToRupeesInput(inv.balancePaisa) });
  const [extra, setExtra] = React.useState(false);
  const keyFor = React.useRef(idempotencyFor());
  React.useEffect(() => {
    if (open) {
      setP({ ...emptyPayment, amount: paisaToRupeesInput(inv.balancePaisa) });
      setExtra(false);
      keyFor.current = idempotencyFor();
    }
  }, [open, inv.balancePaisa]);
  const amount = rupeesToPaisa(p.amount);
  const over = (amount ?? 0) - inv.balancePaisa;
  const body = paymentBody(p, over > 0 && extra);
  const m = useMutation({
    mutationFn: () => post<InvoiceDetail>(`/invoices/${inv.id}/payments`, body, keyFor.current(body)),
    onSuccess: () => {
      toast.success('Payment save ho gayi');
      saved();
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Payment lein" description={`Baqi balance: ${formatRs(inv.balancePaisa)}`}>
        <div className="space-y-3">
          <PaymentFields value={p} onChange={setP} options={options.data} idPrefix="ip" />
          {over > 0 && (inv.patient ? <Checkbox label={`Zyada ${formatRs(over)} patient ke advance mein save karein`} checked={extra} onChange={(e) => setExtra(e.target.checked)} /> : <Notice tone="warning">Amount balance se zyada hai.</Notice>)}
          {m.error && <Notice>{errorText(m.error)}</Notice>}
          <div className="flex justify-end">
            <Button loading={m.isPending} disabled={!amount || !paymentComplete(p, options.data) || (over > 0 && (!inv.patient || !extra))} onClick={() => m.mutate()}>
              Payment save karein
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({ inv, open, onOpenChange }: { inv: InvoiceDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const saved = useInvoiceSaved(inv.id);
  const most = Math.min(inv.advanceBalancePaisa ?? 0, inv.balancePaisa);
  const [text, setText] = React.useState(paisaToRupeesInput(most));
  const keyFor = React.useRef(idempotencyFor());
  React.useEffect(() => {
    if (open) {
      setText(paisaToRupeesInput(most));
      keyFor.current = idempotencyFor();
    }
  }, [open, most]);
  const amount = rupeesToPaisa(text);
  const body = { amountPaisa: amount ?? 0 };
  const m = useMutation({
    mutationFn: () => post<InvoiceDetail>(`/invoices/${inv.id}/apply-advance`, body, keyFor.current(body)),
    onSuccess: () => {
      toast.success('Advance istemal ho gaya');
      saved();
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Advance istemal karein" description={`Patient ka advance: ${formatRs(inv.advanceBalancePaisa ?? 0)} · Balance: ${formatRs(inv.balancePaisa)}`}>
        <div className="space-y-3">
          <Field label="Amount (Rs)" htmlFor="ia-amount">
            <Input id="ia-amount" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {m.error && <Notice>{errorText(m.error)}</Notice>}
          <div className="flex justify-end">
            <Button loading={m.isPending} disabled={!amount || amount > most} onClick={() => m.mutate()}>
              Istemal karein
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ inv, open, onOpenChange }: { inv: InvoiceDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const saved = useInvoiceSaved(inv.id);
  const [reason, setReason] = React.useState('');
  const [money, setMoney] = React.useState<'MOVE_TO_ADVANCE' | 'REFUND' | ''>('');
  const reversed = new Set(inv.payments.map((p) => p.reversesPaymentId).filter(Boolean));
  const live = inv.payments.filter((p) => !p.reversesPaymentId && !reversed.has(p.id));
  const newMoney = live.filter((p) => p.method !== 'ADVANCE').reduce((s, p) => s + p.amountPaisa, 0);
  const fromAdvance = live.filter((p) => p.method === 'ADVANCE').reduce((s, p) => s + p.amountPaisa, 0);
  const m = useMutation({
    mutationFn: () => post<InvoiceDetail>(`/invoices/${inv.id}/cancel`, { reason: reason.trim(), money: money || undefined }),
    onSuccess: () => {
      toast.success(`Invoice ${inv.number} cancel ho gayi`);
      saved();
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Invoice ${inv.number} cancel karein`} description="Invoice delete nahi hogi. Yeh Cancelled ke nishan ke saath list mein rahegi.">
        <div className="space-y-3">
          <Field label="Wajah" required htmlFor="ic-reason">
            <Textarea id="ic-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {newMoney > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-dense font-semibold text-ink">{formatRs(newMoney)} wasool ho chuke hain. In ka kya karna hai?</legend>
              {inv.patient && (
                <label className="flex items-center gap-2 text-dense">
                  <input type="radio" name="ic-money" checked={money === 'MOVE_TO_ADVANCE'} onChange={() => setMoney('MOVE_TO_ADVANCE')} />
                  Patient ke advance mein rakhein (cash drawer mein rahega)
                </label>
              )}
              <label className="flex items-center gap-2 text-dense">
                <input type="radio" name="ic-money" checked={money === 'REFUND'} onChange={() => setMoney('REFUND')} />
                Patient ko wapas karein (aaj ke hisaab se nikle ga)
              </label>
            </fieldset>
          )}
          {fromAdvance > 0 && <Notice tone="info">{formatRs(fromAdvance)} advance se aaye the. Yeh wapas advance mein jayenge.</Notice>}
          {m.error && <Notice>{errorText(m.error)}</Notice>}
          <div className="flex justify-end">
            <Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 3 || (newMoney > 0 && !money)} onClick={() => m.mutate()}>
              Cancel karein
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CANCEL_MONEY_TEXT = { NONE: 'Koi payment nahi thi.', MOVED_TO_ADVANCE: 'Raqam patient ke advance mein gayi.', REFUNDED: 'Raqam patient ko wapas ki gayi.' };

export function InvoiceDetailPage({ id }: { id: string }) {
  const { me } = useSession();
  const { base, can, patientHref } = useInvoiceAccess();
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['invoice', id, 'detail'], queryFn: () => get<InvoiceDetail>(`/invoices/${id}`), refetchInterval: pollInterval });
  const [dialog, setDialog] = React.useState<'pay' | 'advance' | 'cancel' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);
  return (
    <div className="space-y-4">
      <QueryState query={q}>
        {(inv) => {
          const canTakeMoney = !inv.cancelled && inv.balancePaisa > 0;
          return (
            <>
              <PageHeader
                label="Invoice"
                title={inv.number}
                actions={
                  <>
                    <Link href={base} className={buttonVariants({ variant: 'secondary' })}>
                      Wapas
                    </Link>
                    {can('print') && (
                      <>
                        <Link href={`${base}/${inv.id}/print?size=a4`} className={buttonVariants({ variant: 'secondary' })}>
                          <Printer className="size-4" aria-hidden /> Print A4
                        </Link>
                        <Link href={`${base}/${inv.id}/print?size=thermal`} className={buttonVariants({ variant: 'secondary' })}>
                          <Receipt className="size-4" aria-hidden /> Receipt
                        </Link>
                      </>
                    )}
                    {/* Hook for later (D-084): no SMS / WhatsApp provider is connected for invoices yet. */}
                    <Button variant="secondary" disabled title="Jald aa raha hai">
                      <MessageCircle className="size-4" aria-hidden /> Send via SMS / WhatsApp
                    </Button>
                    {canTakeMoney && can('pay') && (
                      <Button onClick={() => setDialog('pay')}>
                        <Wallet className="size-4" aria-hidden /> Payment lein
                      </Button>
                    )}
                  </>
                }
              />

              {inv.cancelled && (
                <Notice>
                  Cancelled{inv.cancelledByName ? ` by ${inv.cancelledByName}` : ''}
                  {inv.cancelledAt ? ` · ${formatDateTime(inv.cancelledAt)}` : ''}. Wajah: {inv.cancelReason}. {inv.cancelMoney ? CANCEL_MONEY_TEXT[inv.cancelMoney] : ''}
                </Notice>
              )}

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <Card>
                    <dl className="grid gap-3 text-dense sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-muted">Patient</dt>
                        <dd className="font-semibold text-ink">
                          {inv.patient ? (
                            <Link className="text-brand-medium underline-offset-2 hover:underline" href={patientHref(inv.patient)}>
                              {inv.patient.name}
                            </Link>
                          ) : (
                            (inv.buyerName ?? 'Walk-in')
                          )}
                        </dd>
                        {(inv.patient?.phone ?? inv.buyerPhone) && <dd className="text-muted">{formatPhone(inv.patient?.phone ?? inv.buyerPhone)}</dd>}
                      </div>
                      <div>
                        <dt className="text-muted">Doctor</dt>
                        <dd className="text-ink">{inv.doctor?.name ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Date</dt>
                        <dd className="text-ink">{formatDate(`${inv.date}T12:00:00+05:00`)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Status</dt>
                        <dd>{inv.cancelled ? <Chip tone="danger">Cancelled</Chip> : inv.status === 'OPEN' ? <Chip tone="warning">Open</Chip> : <Chip tone="success">Closed</Chip>}</dd>
                      </div>
                    </dl>
                    {inv.kind === 'VISIT' && me.user.role === 'RECEPTIONIST' && inv.appointmentId && (
                      <p className="mt-3 text-dense">
                        <Link className="text-brand-medium underline" href={`/reception/billing/${inv.appointmentId}`}>
                          Visit billing kholein
                        </Link>
                      </p>
                    )}
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Services</CardTitle>
                    </CardHeader>
                    <ol className="divide-y divide-line text-dense">
                      {inv.lines.map((l, i) => (
                        <li key={l.id} className="flex justify-between gap-3 py-2">
                          <span className={l.reversed || l.reversesLineId ? 'text-muted line-through' : 'text-ink'}>
                            {i + 1}. {l.description}
                            {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                          </span>
                          <span className="whitespace-nowrap font-semibold text-ink">{formatRs(l.lineTotalPaisa)}</span>
                        </li>
                      ))}
                    </ol>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Payments</CardTitle>
                    </CardHeader>
                    {inv.payments.length === 0 ? (
                      <p className="text-dense text-muted">Abhi koi payment nahi.</p>
                    ) : (
                      <ul className="divide-y divide-line text-dense">
                        {inv.payments.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                            <span>
                              <span className="font-semibold text-ink">{p.receiptNo}</span>
                              <span className="text-muted">
                                {' '}
                                · {p.reversesPaymentId ? (p.method === 'ADVANCE' ? 'Advance mein gaya' : 'Wapsi') : (p.modeName ?? METHOD_LABEL[p.method])}
                                {p.reference ? ` · ${p.reference}` : ''}
                              </span>
                              <span className="block text-[12px] text-muted">
                                {formatDateTime(p.receivedAt)}
                                {p.cashierName ? ` · ${p.cashierName}` : ''}
                              </span>
                            </span>
                            <span className={p.amountPaisa < 0 ? 'font-semibold text-danger' : 'font-semibold text-ink'}>{formatRs(p.amountPaisa)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  {can('audit') && <AuditList invoiceId={inv.id} />}
                </div>

                <div className="space-y-4">
                  <Card>
                    <dl className="space-y-1 text-dense">
                      <MoneyRow label="Sub Total" paisa={inv.subtotalPaisa} />
                      {inv.discountPaisa !== undefined && <MoneyRow label="Discount" text={inv.discountPaisa ? `− ${formatRs(inv.discountPaisa)}` : formatRs(0)} />}
                      <MoneyRow label={inv.taxRateBp ? `Tax included (${taxPercent(inv.taxRateBp)})` : 'Tax'} text={inv.taxRateBp === null ? 'N/A' : formatRs(inv.taxPaisa)} />
                      <MoneyRow label="Total" paisa={inv.totalPaisa} strong />
                      <MoneyRow label="Paid" paisa={inv.paidPaisa} />
                      <MoneyRow label="Balance" paisa={inv.balancePaisa} strong tone={inv.balancePaisa > 0 ? 'danger' : undefined} />
                    </dl>
                  </Card>
                  {inv.patient && inv.advanceBalancePaisa !== null && inv.advanceBalancePaisa > 0 && (
                    <Card>
                      <p className="text-dense text-muted">Patient ka advance</p>
                      <p className="text-card-title text-ink">{formatRs(inv.advanceBalancePaisa)}</p>
                      {canTakeMoney && can('pay') && (
                        <Button variant="secondary" size="sm" className="mt-2" onClick={() => setDialog('advance')}>
                          Advance istemal karein
                        </Button>
                      )}
                    </Card>
                  )}
                  {can('cancel') && !inv.cancelled && (
                    <Card>
                      {inv.cancelBlock === 'VISIT_ACTIVE' && <p className="mb-2 text-dense text-muted">Visit abhi chal rahi hai. Khatam hone ke baad cancel ho sakti hai.</p>}
                      <Button variant="danger" size="sm" disabled={!!inv.cancelBlock} onClick={() => setDialog('cancel')}>
                        <Ban className="size-4" aria-hidden /> Invoice cancel karein
                      </Button>
                    </Card>
                  )}
                  <p className="text-[12px] text-muted">
                    Banayi: {inv.createdByName ?? '—'} · {formatDateTime(inv.createdAt)}
                  </p>
                </div>
              </div>

              <PaymentDialog inv={inv} open={dialog === 'pay'} onOpenChange={close} />
              <AdvanceDialog inv={inv} open={dialog === 'advance'} onOpenChange={close} />
              <CancelDialog inv={inv} open={dialog === 'cancel'} onOpenChange={close} />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
