'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Send } from 'lucide-react';
import { get, idempotencyFor, post, put } from '@/lib/api';
import type { PatientHit } from '@/lib/invoice-types';
import { rupeesToPaisa } from '@/lib/money';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime } from '@/lib/time';
import { formatPhone, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/states';
import { DataTable, Segmented } from '@/components/ui/table';
import { UploadButton } from '@/components/ui/upload';
import { emptyPayment, PatientPicker, PaymentFields, paymentBody, paymentComplete, useInvoiceOptions, type PaymentDraft } from '@/components/invoices/payment-fields';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ActError, CopyForExcel, Loaded, rupees, useAct, useDebounced, useOps } from './common';

const statusChip = (s: string) => <StatusChip status={s} />;

// ───────────── Clinic now ─────────────

interface ClinicNow {
  staff: { id: string; displayName: string; role: string; status: 'IN' | 'OUT' | 'NOT_IN'; checkInAt: string | null }[];
  doctors: { id: string; name: string; busyWith: string | null; waiting: number }[];
  patients: { id: string; name: string; status: string; doctor: string | null; startAt: string }[];
  leaves: { doctor: string; date: string }[];
  schedule: { doctorId: string; name: string; days: { date: string; leave: boolean; startMinute: number | null; endMinute: number | null; booked: number }[] }[];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function ClinicNowPage() {
  const q = useQuery({ queryKey: ['ops', 'clinic-now'], queryFn: () => get<ClinicNow>('/ops/clinic-now'), refetchInterval: 30_000 });
  return (
    <div className="space-y-4">
      <PageHeader label="Clinic" title="Clinic Now" />
      <Loaded q={q}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Staff checked in" value={d.staff.filter((s) => s.status === 'IN').length} />
              <StatTile label="Not checked in" value={d.staff.filter((s) => s.status === 'NOT_IN').length} />
              <StatTile label="Doctors free" value={d.doctors.filter((x) => !x.busyWith).length} />
              <StatTile label="Patients in clinic" value={d.patients.length} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Doctors</CardTitle></CardHeader>
                <ul className="space-y-1 text-dense">
                  {d.doctors.map((x) => (
                    <li key={x.id} className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">{x.name}</span>
                      <span>{x.busyWith ? `Busy: ${x.busyWith}` : 'Free'}{x.waiting ? ` · ${x.waiting} waiting` : ''}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader><CardTitle>Patients in clinic</CardTitle></CardHeader>
                {d.patients.length === 0 ? <p className="text-dense text-muted">Abhi koi patient nahi.</p> : (
                  <ul className="space-y-1 text-dense">
                    {d.patients.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span><span className="font-semibold">{p.name}</span>{p.doctor ? ` · ${p.doctor}` : ''}</span>
                        <StatusChip status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardHeader><CardTitle>Staff today</CardTitle></CardHeader>
                <ul className="space-y-1 text-dense">
                  {d.staff.map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2">
                      <span>{s.displayName} <span className="text-muted">· {titleCase(s.role)}</span></span>
                      <Chip tone={s.status === 'IN' ? 'success' : 'neutral'}>{s.status === 'IN' ? 'In' : s.status === 'OUT' ? 'Checked out' : 'Not in'}</Chip>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader><CardTitle>Doctor leaves coming up</CardTitle></CardHeader>
                {d.leaves.length === 0 ? <p className="text-dense text-muted">Koi leave nahi.</p> : (
                  <ul className="space-y-1 text-dense">{d.leaves.map((l, i) => <li key={i}>{l.doctor} · {formatDate(l.date)}</li>)}</ul>
                )}
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Doctor schedule, next 7 days</CardTitle></CardHeader>
              <div className="space-y-3">
                {d.schedule.map((s) => (
                  <div key={s.doctorId}>
                    <p className="font-semibold text-ink">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {s.days.map((x) => (
                        <span key={x.date} className="rounded-control border border-line px-2 py-1 text-[12px] text-ink">
                          {formatDate(x.date)}: {x.leave ? 'Leave' : x.startMinute === null || x.endMinute === null ? 'Off' : `${hhmm(x.startMinute)}–${hhmm(x.endMinute)}`}{x.booked ? ` · ${x.booked} booked` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </Loaded>
    </div>
  );
}

// ───────────── Treatment plans ─────────────

interface PlanRow {
  id: string;
  patient: { id: string; name: string; phone: string } | null;
  doctor: string | null;
  nextSessions: { procedureName: string; sessionNumber: number; scheduledStart: string }[];
  remaining: number;
}

export function PlansPage() {
  const [text, setText] = React.useState('');
  const debounced = useDebounced(text);
  const q = useQuery({ queryKey: ['ops', 'plans', debounced], queryFn: () => get<{ items: PlanRow[] }>('/ops/plans', { q: debounced || undefined }) });
  return (
    <div className="space-y-3">
      <PageHeader label="Patients" title="Treatment Plans" />
      <div className="max-w-md"><Input aria-label="Search plans" value={text} onChange={(e) => setText(e.target.value)} placeholder="Patient ka naam" /></div>
      <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Koi open plan nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'patient', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient?.name ?? '—'}</span> },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctor ?? '—' },
              { key: 'next', header: 'Next sessions', cell: (r) => r.nextSessions.map((s) => `${s.procedureName} #${s.sessionNumber} · ${formatDateTime(s.scheduledStart)}`).join(', ') },
              { key: 'left', header: 'Left', cell: (r) => r.remaining },
              { key: 'call', header: '', cell: (r) => (r.patient ? <a className="font-semibold text-brand-medium hover:underline" href={`tel:+${r.patient.phone}`}>Call {formatPhone(r.patient.phone)}</a> : null) },
            ]}
          />
        )}
      </Loaded>
    </div>
  );
}

// ───────────── Requests and returns ─────────────

interface InvoiceRequest { id: string; type: 'PART_PAYMENT' | 'BILL_CORRECTION'; invoiceNumber: string | null; patient: string | null; amountNeededPaisa: number | null; amountAskedPaisa: number | null; amountApprovedPaisa: number | null; note: string; status: string; requestedBy: string | null; decidedBy: string | null; decisionNote: string | null; createdAt: string }
interface SaleReturn { id: string; number: string; description: string; invoiceNumber: string; quantity: number; refundPaisa: number; restock: boolean; method: string; reason: string; status: string; requestedBy: string | null; decidedBy: string | null; decisionNote: string | null }
interface Returnable { id: string; description: string; quantity: number; returnableQty: number; lineTotalPaisa: number; invoiceNumber: string; patient: string | null }

function Decide({ path, canAmount, asked, canAdjust }: { path: string; canAmount?: boolean; asked?: number | null; canAdjust?: boolean }) {
  const [note, setNote] = React.useState('');
  const [amount, setAmount] = React.useState(asked ? String(asked / 100) : '');
  const [adjust, setAdjust] = React.useState('');
  const adjustPaisa = rupeesToPaisa(adjust.trim().replace(/^-/, ''));
  const m = useAct((approve: boolean) => post(path, { approve, note: note.trim() || undefined, ...(canAmount && approve ? { amountApprovedPaisa: rupeesToPaisa(amount) ?? undefined } : {}), ...(canAdjust && approve && adjustPaisa ? { adjustmentPaisa: adjust.trim().startsWith('-') ? -adjustPaisa : adjustPaisa } : {}) }), 'Faisla save ho gaya');
  return (
    <div className="mt-2 space-y-2 border-t border-line pt-2">
      {canAmount && <Field label="Approved amount (Rs)" htmlFor={`${path}-a`}><Input id={`${path}-a`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
      {canAdjust && <Field label="Bill mein tabdeeli (Rs), kam karni ho to minus likhein" htmlFor={`${path}-j`}><Input id={`${path}-j`} value={adjust} onChange={(e) => setAdjust(e.target.value)} placeholder="-500" /></Field>}
      <Field label="Note (reject par zaroori)" htmlFor={`${path}-n`}><Input id={`${path}-n`} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ActError error={m.error} />
      <div className="flex gap-2">
        <Button size="sm" loading={m.isPending} onClick={() => m.mutate(true)}>Approve</Button>
        <Button size="sm" variant="secondary" loading={m.isPending} onClick={() => m.mutate(false)}>Reject</Button>
      </div>
    </div>
  );
}

export function RequestList({ canDecide }: { canDecide: boolean }) {
  const q = useOps('invoice-requests', () => get<{ items: InvoiceRequest[] }>('/ops/invoice-requests'));
  return (
    <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Koi request nahi">
      {(d) => (
        <div className="space-y-2">
          {d.items.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{r.type === 'PART_PAYMENT' ? 'Part payment' : 'Bill correction'} · {r.invoiceNumber} {r.patient ? `· ${r.patient}` : ''}</p>
                {statusChip(r.status)}
              </div>
              {r.type === 'PART_PAYMENT' && <p className="text-dense text-muted">Balance {formatRs(r.amountNeededPaisa)} · Abhi de sakta hai {formatRs(r.amountAskedPaisa)}{r.amountApprovedPaisa !== null ? ` · Approved ${formatRs(r.amountApprovedPaisa)}` : ''}</p>}
              <p className="text-dense text-ink">{r.note}</p>
              <p className="text-[12px] text-muted">{r.requestedBy} · {formatDateTime(r.createdAt)}{r.decidedBy ? ` · Faisla: ${r.decidedBy}` : ''}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</p>
              {canDecide && r.status === 'PENDING' && <Decide path={`/ops/invoice-requests/${r.id}/decide`} canAmount={r.type === 'PART_PAYMENT'} asked={r.amountAskedPaisa} canAdjust={r.type === 'BILL_CORRECTION'} />}
            </Card>
          ))}
        </div>
      )}
    </Loaded>
  );
}

function NewRequest() {
  const [text, setText] = React.useState('');
  const debounced = useDebounced(text);
  const hits = useQuery({ queryKey: ['ops', 'invoice-search', debounced], queryFn: () => get<{ items: { id: string; number: string; balancePaisa: number; patient: { name: string } | null }[] }>('/invoices', { q: debounced, pageSize: 10 }), enabled: debounced.length >= 2 });
  const [invoice, setInvoice] = React.useState<{ id: string; number: string; balancePaisa: number } | null>(null);
  const [type, setType] = React.useState<'PART_PAYMENT' | 'BILL_CORRECTION'>('PART_PAYMENT');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const m = useAct(() => post('/ops/invoice-requests', { type, invoiceId: invoice!.id, note: note.trim(), ...(type === 'PART_PAYMENT' ? { amountAskedPaisa: rupeesToPaisa(amount) ?? 0 } : {}) }), 'Request bhej di', () => { setInvoice(null); setAmount(''); setNote(''); setText(''); });
  return (
    <Card>
      <CardHeader><CardTitle>Nayi request</CardTitle></CardHeader>
      <div className="space-y-3">
        <Segmented value={type} onChange={setType} options={[{ value: 'PART_PAYMENT', label: 'Part payment' }, { value: 'BILL_CORRECTION', label: 'Bill correction' }]} />
        <Field label="Invoice number ya patient" htmlFor="nr-q"><Input id="nr-q" value={text} onChange={(e) => { setText(e.target.value); setInvoice(null); }} /></Field>
        {!invoice && (hits.data?.items ?? []).map((h) => (
          <button key={h.id} className="block w-full rounded-control border border-line p-2 text-left text-dense hover:bg-brand-light" onClick={() => setInvoice(h)}>
            {h.number} · {h.patient?.name ?? ''} · Balance {formatRs(h.balancePaisa)}
          </button>
        ))}
        {invoice && <Chip tone="brand">{invoice.number} · Balance {formatRs(invoice.balancePaisa)}</Chip>}
        {type === 'PART_PAYMENT' && <Field label="Patient abhi kitna de sakta hai (Rs)" htmlFor="nr-a"><Input id="nr-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        <Field label={type === 'PART_PAYMENT' ? 'Wajah' : 'Kya ghalat hai?'} required htmlFor="nr-n"><Textarea id="nr-n" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ActError error={m.error} />
        <Button disabled={!invoice || note.trim().length < 3} loading={m.isPending} onClick={() => m.mutate(undefined)}><Send className="size-4" /> Request bhejein</Button>
      </div>
    </Card>
  );
}

function NewReturn() {
  const [text, setText] = React.useState('');
  const debounced = useDebounced(text);
  const q = useQuery({ queryKey: ['ops', 'returnable', debounced], queryFn: () => get<{ items: Returnable[] }>('/ops/sale-returns/sales', { q: debounced || undefined }) });
  const options = useInvoiceOptions();
  const [line, setLine] = React.useState<Returnable | null>(null);
  const [qty, setQty] = React.useState('1');
  const [restock, setRestock] = React.useState(true);
  const [method, setMethod] = React.useState('CASH');
  const [bank, setBank] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [reason, setReason] = React.useState('');
  const m = useAct(() => post('/ops/sale-returns', { invoiceLineId: line!.id, quantity: Number(qty), restock, method, bankAccountId: method === 'CASH' ? undefined : bank, reference: reference.trim() || undefined, reason: reason.trim() }), 'Wapsi approval ke liye bhej di', () => { setLine(null); setReason(''); setQty('1'); });
  return (
    <Card>
      <CardHeader><CardTitle>Pharmacy wapsi</CardTitle></CardHeader>
      <div className="space-y-3">
        <Input aria-label="Search sales" value={text} onChange={(e) => setText(e.target.value)} placeholder="Patient ya invoice number" />
        {!line && (q.data?.items ?? []).filter((l) => l.returnableQty > 0).slice(0, 8).map((l) => (
          <button key={l.id} className="block w-full rounded-control border border-line p-2 text-left text-dense hover:bg-brand-light" onClick={() => setLine(l)}>
            {l.description} · {l.invoiceNumber} · {l.patient ?? ''} · qty {l.returnableQty} · {formatRs(l.lineTotalPaisa)}
          </button>
        ))}
        {line && (
          <>
            <Chip tone="brand">{line.description} · {line.invoiceNumber}</Chip>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Quantity (max ${line.returnableQty})`} htmlFor="sr-q"><Input id="sr-q" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Refund" htmlFor="sr-m">
                <Select id="sr-m" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_ONLINE">Bank / online</option>
                </Select>
              </Field>
              {method !== 'CASH' && (
                <Field label="Bank account" htmlFor="sr-b">
                  <Select id="sr-b" value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">Chunein</option>
                    {(options.data?.bankAccounts ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              )}
              {method === 'BANK_ONLINE' && <Field label="Reference" htmlFor="sr-r"><Input id="sr-r" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
            </div>
            <Checkbox label="Stock mein wapas rakhein (damaged nahi)" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <Field label="Wajah" required htmlFor="sr-w"><Textarea id="sr-w" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <ActError error={m.error} />
            <div className="flex gap-2">
              <Button disabled={Number(qty) < 1 || Number(qty) > line.returnableQty || reason.trim().length < 3 || (method !== 'CASH' && !bank)} loading={m.isPending} onClick={() => m.mutate(undefined)}>Wapsi maangein</Button>
              <Button variant="ghost" onClick={() => setLine(null)}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ReturnList({ canDecide }: { canDecide: boolean }) {
  const q = useOps('sale-returns', () => get<{ items: SaleReturn[] }>('/ops/sale-returns'));
  return (
    <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Koi wapsi nahi">
      {(d) => (
        <div className="space-y-2">
          {d.items.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{r.number} · {r.description}</p>
                {statusChip(r.status)}
              </div>
              <p className="text-dense text-muted">{r.invoiceNumber} · qty {r.quantity} · Refund {formatRs(r.refundPaisa)} · {titleCase(r.method)} · {r.restock ? 'Stock mein wapas' : 'Damaged'}</p>
              <p className="text-dense text-ink">{r.reason}</p>
              <p className="text-[12px] text-muted">{r.requestedBy}{r.decidedBy ? ` · Faisla: ${r.decidedBy}` : ''}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</p>
              {canDecide && r.status === 'PENDING' && <Decide path={`/ops/sale-returns/${r.id}/decide`} />}
            </Card>
          ))}
        </div>
      )}
    </Loaded>
  );
}

interface VendorPayment { id: string; vendor: string | null; amountPaisa: number; note: string; status: string; requestedBy: string | null; decidedBy: string | null; decisionNote: string | null; supplierPaymentId: string | null }

function VendorPayments({ canAsk, canApprove }: { canAsk: boolean; canApprove: boolean }) {
  const q = useOps('vendor-payments', () => get<{ items: VendorPayment[]; vendors: { id: string; name: string }[]; banks: { id: string; name: string }[] }>('/ops/vendor-payments'));
  const [vendorId, setVendorId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [method, setMethod] = React.useState('CASH');
  const [bank, setBank] = React.useState('');
  const [reference, setReference] = React.useState('');
  const ask = useAct(() => post('/ops/vendor-payments', { vendorId, amountPaisa: rupeesToPaisa(amount) ?? 0, note: note.trim() }), 'Request MD aur Hamza ko bhej di', () => { setAmount(''); setNote(''); });
  const record = useAct((id: string) => post(`/ops/vendor-payments/${id}/record`, { method, bankAccountId: method === 'CASH' ? undefined : bank, reference: reference.trim() || undefined }), 'Vendor payment save ho gayi');
  return (
    <div className="space-y-3">
      {canAsk && (
        <Card>
          <CardHeader><CardTitle>Vendor payment request</CardTitle></CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Vendor" required htmlFor="vp-v"><Select id="vp-v" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Chunein</option>{(q.data?.vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <Field label="Amount (Rs)" required htmlFor="vp-a"><Input id="vp-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Kis cheez ki" required htmlFor="vp-n"><Input id="vp-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <div className="mt-3 space-y-2">
            <ActError error={ask.error} />
            <Button disabled={!vendorId || !rupeesToPaisa(amount) || note.trim().length < 3} loading={ask.isPending} onClick={() => ask.mutate(undefined)}>Send request</Button>
          </div>
        </Card>
      )}
      <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Koi vendor payment request nahi">
        {(d) => (
          <div className="space-y-2">
            {d.items.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{r.vendor} · {formatRs(r.amountPaisa)}</p>
                  {r.supplierPaymentId ? <Chip tone="success">Paid</Chip> : statusChip(r.status)}
                </div>
                <p className="text-dense text-ink">{r.note}</p>
                <p className="text-[12px] text-muted">{r.requestedBy}{r.decidedBy ? ` · Faisla: ${r.decidedBy}` : ''}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</p>
                {canApprove && r.status === 'PENDING' && <Decide path={`/ops/vendor-payments/${r.id}/decide`} />}
                {r.status === 'APPROVED' && !r.supplierPaymentId && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2">
                    <Field label="Method" htmlFor={`vp-m-${r.id}`}><Select id={`vp-m-${r.id}`} value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="BANK_ONLINE">Bank / online</option><option value="CHEQUE">Cheque</option></Select></Field>
                    {method !== 'CASH' && (
                      <>
                        <Field label="Bank account" htmlFor={`vp-b-${r.id}`}><Select id={`vp-b-${r.id}`} value={bank} onChange={(e) => setBank(e.target.value)}><option value="">Chunein</option>{d.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
                        <Field label="Reference" htmlFor={`vp-r-${r.id}`}><Input id={`vp-r-${r.id}`} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
                      </>
                    )}
                    <Button size="sm" disabled={method !== 'CASH' && (!bank || !reference.trim())} loading={record.isPending} onClick={() => record.mutate(r.id)}>Record payment</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Loaded>
      <ActError error={record.error} />
    </div>
  );
}

export function RequestsReturnsPage({ canAsk, canDecide }: { canAsk: boolean; canDecide: boolean }) {
  const { me } = useSession();
  const isOwner = me.user.role === 'MD' || me.user.role === 'MARKETING_DIRECTOR';
  const showVendors = canDecide;
  const [tab, setTab] = React.useState<'requests' | 'returns' | 'vendors'>('requests');
  return (
    <div className="space-y-3">
      <PageHeader label="Billing" title="Requests & Returns" />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'requests', label: 'Part payment / correction' }, { value: 'returns', label: 'Pharmacy returns' }, ...(showVendors ? [{ value: 'vendors' as const, label: 'Vendor payments' }] : [])]} />
      {tab === 'requests' ? (
        <div className="space-y-3">{canAsk && <NewRequest />}<RequestList canDecide={canDecide} /></div>
      ) : tab === 'returns' ? (
        <div className="space-y-3">{canAsk && <NewReturn />}<ReturnList canDecide={canDecide} /></div>
      ) : (
        <VendorPayments canAsk={!isOwner} canApprove={isOwner} />
      )}
    </div>
  );
}

export function DoctorRequestsPage() {
  return (
    <div className="space-y-3">
      <PageHeader label="Doctor" title="Part Payment Requests" />
      <RequestList canDecide />
    </div>
  );
}

// ───────────── Cash handover ─────────────

interface Handover { id: string; date: string; amountPaisa: number; leftAtDeskPaisa: number | null; from: string | null; to: string | null; toId: string; note: string | null; receivedAt: string | null }

/** Used on the Handover screen and inside Cash Closing. */
export function GiveCashCard() {
  const q = useOps('handovers', () => get<{ items: Handover[]; receivers: { id: string; displayName: string }[] }>('/ops/handovers'));
  const [toId, setToId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [left, setLeft] = React.useState('');
  const [note, setNote] = React.useState('');
  const hand = useAct(() => post('/ops/handovers', { toId, amountPaisa: rupeesToPaisa(amount) ?? 0, leftAtDeskPaisa: left.trim() ? (rupeesToPaisa(left) ?? 0) : undefined, note: note.trim() || undefined }), 'Cash de diya: receiver confirm karega', () => { setAmount(''); setLeft(''); setNote(''); });
  return (
    <Card>
      <CardHeader><CardTitle>Cash kisi ko dein</CardTitle></CardHeader>
      <div className="space-y-3">
        <Field label="Kisko" required htmlFor="h-to">
          <Select id="h-to" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Chunein</option>
            {(q.data?.receivers ?? []).map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (Rs)" required htmlFor="h-a"><Input id="h-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Reception par reh gaya (Rs)" htmlFor="h-l"><Input id="h-l" inputMode="decimal" value={left} onChange={(e) => setLeft(e.target.value)} /></Field>
        </div>
        <Field label="Note" htmlFor="h-n"><Input id="h-n" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ActError error={hand.error} />
        <Button disabled={!toId || !rupeesToPaisa(amount)} loading={hand.isPending} onClick={() => hand.mutate(undefined)}>Cash dein</Button>
      </div>
    </Card>
  );
}

export function HandoverPage() {
  const { me } = useSession();
  const q = useOps('handovers', () => get<{ items: Handover[]; receivers: { id: string; displayName: string }[] }>('/ops/handovers'));
  const [what, setWhat] = React.useState('');
  const [out, setOut] = React.useState('');
  const confirm = useAct((id: string) => post(`/ops/handovers/${id}/confirm`), 'Cash confirm ho gaya');
  const cashOut = useAct(() => post('/ops/cash-out', { category: 'Cash paid out', description: what.trim(), amountPaisa: rupeesToPaisa(out) ?? 0 }), 'Cash paid out save ho gaya', () => { setWhat(''); setOut(''); });
  return (
    <div className="space-y-4">
      <PageHeader label="Cash" title="Cash Handover" />
      <div className="grid gap-4 xl:grid-cols-2">
        <GiveCashCard />
        <Card>
          <CardHeader><CardTitle>Drawer se cash paid out</CardTitle></CardHeader>
          <div className="space-y-3">
            <Field label="Kis liye" required htmlFor="c-w"><Input id="c-w" value={what} onChange={(e) => setWhat(e.target.value)} /></Field>
            <Field label="Amount (Rs)" required htmlFor="c-a"><Input id="c-a" inputMode="decimal" value={out} onChange={(e) => setOut(e.target.value)} /></Field>
            <ActError error={cashOut.error} />
            <Button disabled={what.trim().length < 2 || !rupeesToPaisa(out)} loading={cashOut.isPending} onClick={() => cashOut.mutate(undefined)}>Save</Button>
          </div>
        </Card>
      </div>
      <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi handover nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'date', header: 'Date', cell: (r) => formatDate(r.date) },
              { key: 'from', header: 'From', cell: (r) => r.from },
              { key: 'to', header: 'To', cell: (r) => r.to },
              { key: 'amt', header: 'Amount', cell: (r) => formatRs(r.amountPaisa) },
              { key: 'left', header: 'Left at desk', cell: (r) => (r.leftAtDeskPaisa === null ? '—' : formatRs(r.leftAtDeskPaisa)) },
              { key: 'st', header: 'Status', cell: (r) => (r.receivedAt ? <Chip tone="success">Received</Chip> : r.toId === me.user.id ? <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(r.id)}>I received</Button> : <Chip tone="gold">Waiting</Chip>) },
            ]}
          />
        )}
      </Loaded>
    </div>
  );
}

// ───────────── Packages ─────────────

interface PackageType { id: string; name: string; kind: 'PACKAGE' | 'MEMBERSHIP'; sessions: number; pricePaisa: number; validDays: number | null; active: boolean }
interface PackageSale { id: string; number: string; name: string; sessions: number; used: number; left: number; pricePaisa: number; expiresAt: string | null; expired: boolean; patient: { name: string; phone: string } | null }

export function PackagesPage({ canSell, canAddTypes }: { canSell: boolean; canAddTypes: boolean }) {
  const [text, setText] = React.useState('');
  const debounced = useDebounced(text);
  const types = useOps('package-types', () => get<{ items: PackageType[] }>('/ops/package-types'));
  const sales = useQuery({ queryKey: ['ops', 'packages', debounced], queryFn: () => get<{ items: PackageSale[]; runningCount: number }>('/ops/packages', { q: debounced || undefined }) });
  const options = useInvoiceOptions();
  const [patient, setPatient] = React.useState<PatientHit | null>(null);
  const [typeId, setTypeId] = React.useState('');
  const [payment, setPayment] = React.useState<PaymentDraft>(emptyPayment);
  const key = React.useRef(idempotencyFor()).current;
  const body = { typeId, patientId: patient?.id, ...(payment.amount.trim() ? { payment: paymentBody(payment) } : {}) };
  const sell = useAct(() => post('/ops/packages', body, key(body)), 'Package bech diya', () => { setPatient(null); setTypeId(''); setPayment(emptyPayment); });
  const use = useAct((id: string) => post(`/ops/packages/${id}/use`, {}), 'Ek session use ho gaya');
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<'PACKAGE' | 'MEMBERSHIP'>('PACKAGE');
  const [count, setCount] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [days, setDays] = React.useState('');
  const addType = useAct(() => post('/ops/package-types', { name: name.trim(), kind, sessions: Number(count), pricePaisa: rupeesToPaisa(price) ?? 0, validDays: days.trim() ? Number(days) : null }), 'Package type save ho gaya', () => { setName(''); setCount(''); setPrice(''); setDays(''); });
  return (
    <div className="space-y-4">
      <PageHeader label="Sales" title="Packages & Memberships" />
      <div className="grid gap-4 xl:grid-cols-2">
        {canSell && (
          <Card>
            <CardHeader><CardTitle>Package bechein</CardTitle></CardHeader>
            <div className="space-y-3">
              <PatientPicker value={patient} onChange={setPatient} />
              <Field label="Package" required htmlFor="p-t">
                <Select id="p-t" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="">Chunein</option>
                  {(types.data?.items ?? []).filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.sessions} sessions · {formatRs(t.pricePaisa)}</option>)}
                </Select>
              </Field>
              <PaymentFields value={payment} onChange={setPayment} options={options.data} idPrefix="pk-pay" amountLabel="Amount paid now (Rs)" />
              <ActError error={sell.error} />
              <Button disabled={!patient || !typeId || (!!payment.amount.trim() && !paymentComplete(payment, options.data))} loading={sell.isPending} onClick={() => sell.mutate(undefined)}>Sell package</Button>
            </div>
          </Card>
        )}
        {canAddTypes && (
          <Card>
            <CardHeader><CardTitle>Naya package type</CardTitle></CardHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Naam" required htmlFor="pt-n"><Input id="pt-n" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Type" htmlFor="pt-k"><Select id="pt-k" value={kind} onChange={(e) => setKind(e.target.value as 'PACKAGE' | 'MEMBERSHIP')}><option value="PACKAGE">Package</option><option value="MEMBERSHIP">Membership</option></Select></Field>
              <Field label="Sessions" required htmlFor="pt-s"><Input id="pt-s" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Price (Rs)" required htmlFor="pt-p"><Input id="pt-p" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
              <Field label="Valid for (days)" htmlFor="pt-d"><Input id="pt-d" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <div className="mt-3 space-y-2">
              <ActError error={addType.error} />
              <Button disabled={name.trim().length < 2 || !Number(count) || !rupeesToPaisa(price)} loading={addType.isPending} onClick={() => addType.mutate(undefined)}>Save type</Button>
            </div>
          </Card>
        )}
      </div>
      <div className="max-w-md"><Input aria-label="Search packages" value={text} onChange={(e) => setText(e.target.value)} placeholder="Patient ka naam" /></div>
      <Loaded q={sales} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi package nahi becha">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'n', header: 'Number', cell: (r) => r.number, hideSm: true },
              { key: 'p', header: 'Patient', cell: (r) => <span className="font-semibold">{r.patient?.name ?? '—'}</span> },
              { key: 't', header: 'Package', cell: (r) => r.name },
              { key: 'u', header: 'Used', cell: (r) => `${r.used} / ${r.sessions}` },
              { key: 'e', header: 'Expiry', cell: (r) => (r.expiresAt ? formatDate(r.expiresAt) : '—'), hideSm: true },
              { key: 'a', header: '', cell: (r) => (canSell ? <Button size="sm" variant="secondary" disabled={r.left <= 0 || r.expired} loading={use.isPending} onClick={() => use.mutate(r.id)}>Use one session</Button> : null) },
            ]}
          />
        )}
      </Loaded>
      <ActError error={use.error} />
    </div>
  );
}

// ───────────── Purchase orders ─────────────

interface PurchaseOrder { id: string; number: string; status: string; vendor: { name: string; phone: string | null } | null; vendorBillNo: string | null; createdBy: string | null; createdAt: string; lines: { id: string; name: string; quantity: number; receivedQty: number | null }[] }

export function OrdersPage() {
  const q = useOps('purchase-orders', () => get<{ items: PurchaseOrder[]; vendors: { id: string; name: string }[]; stockItems: { id: string; name: string }[] }>('/ops/purchase-orders'));
  const [vendorId, setVendorId] = React.useState('');
  const [itemId, setItemId] = React.useState('');
  const [itemName, setItemName] = React.useState('');
  const [qty, setQty] = React.useState('');
  const [lines, setLines] = React.useState<{ itemId?: string; name: string; quantity: number }[]>([]);
  const [bill, setBill] = React.useState<Record<string, string>>({});
  const [printing, setPrinting] = React.useState<PurchaseOrder | null>(null);
  const create = useAct(() => post('/ops/purchase-orders', { vendorId, lines: lines.map((l) => (l.itemId ? { itemId: l.itemId, quantity: l.quantity } : { name: l.name, quantity: l.quantity })) }), 'Purchase order ban gaya', () => { setLines([]); setVendorId(''); });
  const [got, setGot] = React.useState<Record<string, { qty?: string; cost?: string; expiry?: string }>>({});
  const decide = useAct((v: { order: PurchaseOrder; action: 'RECEIVED' | 'CANCELLED' }) => post(`/ops/purchase-orders/${v.order.id}/decide`, { action: v.action, vendorBillNo: bill[v.order.id]?.trim() || undefined, ...(v.action === 'RECEIVED' ? { received: v.order.lines.map((l) => ({ lineId: l.id, quantity: Number(got[l.id]?.qty ?? l.quantity), costPaisa: rupeesToPaisa(got[l.id]?.cost ?? '') ?? undefined, expiryDate: got[l.id]?.expiry || undefined })) } : {}) }), 'Order update ho gaya: stock Manager ki verification ke liye gaya');
  const add = () => {
    const known = q.data?.stockItems.find((i) => i.id === itemId);
    const name = known?.name ?? itemName.trim();
    if (!name || !Number(qty)) return;
    setLines((ls) => [...ls, { ...(known ? { itemId: known.id } : {}), name, quantity: Number(qty) }]);
    setItemId(''); setItemName(''); setQty('');
  };
  React.useEffect(() => {
    if (printing) { window.print(); setPrinting(null); }
  }, [printing]);
  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-4">
        <PageHeader label="Stock" title="Purchase Orders" />
        <Card>
          <CardHeader><CardTitle>Naya order</CardTitle></CardHeader>
          <div className="space-y-3">
            <Field label="Vendor" required htmlFor="po-v"><Select id="po-v" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Chunein</option>{(q.data?.vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Item" htmlFor="po-i"><Select id="po-i" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Chunein</option>{(q.data?.stockItems ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
              <Field label="Ya naya item" htmlFor="po-n"><Input id="po-n" value={itemName} onChange={(e) => setItemName(e.target.value)} /></Field>
              <Field label="Quantity" htmlFor="po-q"><Input id="po-q" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <Button variant="secondary" onClick={add}>Add to order</Button>
            {lines.length > 0 && <ul className="text-dense">{lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.name} × {l.quantity}</span><button className="text-danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button></li>)}</ul>}
            <ActError error={create.error} />
            <Button disabled={!vendorId || !lines.length} loading={create.isPending} onClick={() => create.mutate(undefined)}>Create purchase order</Button>
          </div>
        </Card>
        <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi purchase order nahi">
          {(d) => (
            <div className="space-y-2">
              {d.items.map((o) => (
                <Card key={o.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{o.number} · {o.vendor?.name}</p>
                    {statusChip(o.status)}
                  </div>
                  {o.status === 'OPEN' ? (
                    <div className="space-y-2">
                      {o.lines.map((l) => (
                        <div key={l.id} className="grid items-end gap-2 sm:grid-cols-4">
                          <p className="text-dense text-ink">{l.name} × {l.quantity}</p>
                          <Field label="Mila" htmlFor={`g-${l.id}`}><Input id={`g-${l.id}`} inputMode="numeric" value={got[l.id]?.qty ?? String(l.quantity)} onChange={(e) => setGot((g) => ({ ...g, [l.id]: { ...g[l.id], qty: e.target.value.replace(/\D/g, '') } }))} /></Field>
                          <Field label="Cost per unit (Rs)" htmlFor={`gc-${l.id}`}><Input id={`gc-${l.id}`} inputMode="decimal" value={got[l.id]?.cost ?? ''} onChange={(e) => setGot((g) => ({ ...g, [l.id]: { ...g[l.id], cost: e.target.value } }))} /></Field>
                          <Field label="Expiry" htmlFor={`ge-${l.id}`}><Input id={`ge-${l.id}`} type="date" value={got[l.id]?.expiry ?? ''} onChange={(e) => setGot((g) => ({ ...g, [l.id]: { ...g[l.id], expiry: e.target.value } }))} /></Field>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="text-dense">{o.lines.map((l) => <li key={l.id}>{l.name} × {l.receivedQty ?? l.quantity}</li>)}</ul>
                  )}
                  <p className="text-[12px] text-muted">{o.createdBy} · {formatDateTime(o.createdAt)}{o.vendorBillNo ? ` · Bill ${o.vendorBillNo}` : ''}</p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPrinting(o)}><Printer className="size-4" /> Print order</Button>
                    {o.status === 'OPEN' && (
                      <>
                        <Field label="Vendor bill number" htmlFor={`po-b-${o.id}`}><Input id={`po-b-${o.id}`} value={bill[o.id] ?? ''} onChange={(e) => setBill((b) => ({ ...b, [o.id]: e.target.value }))} /></Field>
                        <Button size="sm" disabled={!bill[o.id]?.trim()} loading={decide.isPending} onClick={() => decide.mutate({ order: o, action: 'RECEIVED' })}>Goods arrived</Button>
                        <Button size="sm" variant="ghost" loading={decide.isPending} onClick={() => decide.mutate({ order: o, action: 'CANCELLED' })}>Cancel order</Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Loaded>
        <ActError error={decide.error} />
      </div>
      {printing && (
        <div className="hidden print:block">
          <h1 className="text-title">Purchase Order {printing.number}</h1>
          <p>Vendor: {printing.vendor?.name} {printing.vendor?.phone ?? ''}</p>
          <p>Date: {formatDate(printing.createdAt)}</p>
          <ul className="mt-2">{printing.lines.map((l) => <li key={l.id}>{l.name} × {l.quantity}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ───────────── Office purchases ─────────────

interface OfficePurchase { id: string; items: { name: string; quantity: string; approxPaisa: number }[]; estimatePaisa: number; status: string; budgetPaisa: number | null; billTotalPaisa: number | null; changePaisa: number | null; requestedBy: string | null; decidedBy: string | null; decisionNote: string | null; createdAt: string }

export function OfficePurchasesPage({ canAsk, canDecide, canSettle, isOwner }: { canAsk: boolean; canDecide: boolean; canSettle: boolean; isOwner: boolean }) {
  const q = useOps('office-purchases', () => get<{ items: OfficePurchase[]; managerLimitPaisa: number }>('/ops/office-purchases'));
  const [name, setName] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [approx, setApprox] = React.useState('');
  const [list, setList] = React.useState<{ name: string; quantity: string; approxPaisa: number }[]>([]);
  const [budget, setBudget] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState<Record<string, string>>({});
  const [bill, setBill] = React.useState<Record<string, string>>({});
  const [billFile, setBillFile] = React.useState<Record<string, string>>({});
  const ask = useAct(() => post('/ops/office-purchases', { items: list }), 'Manager ko bhej diya', () => setList([]));
  const decide = useAct((v: { id: string; action: 'APPROVE' | 'REJECT' | 'SEND_TO_OWNERS' }) => post(`/ops/office-purchases/${v.id}/decide`, { action: v.action, budgetPaisa: rupeesToPaisa(budget[v.id] ?? '') ?? undefined, note: note[v.id]?.trim() || undefined, cashFrom: 'RECEPTION_DRAWER' }), 'Save ho gaya');
  const settle = useAct((id: string) => post(`/ops/office-purchases/${id}/settle`, { billTotalPaisa: rupeesToPaisa(bill[id] ?? '') ?? 0, billAttachmentId: billFile[id] }), 'Bill aur change wapas aa gaye');
  return (
    <div className="space-y-4">
      <PageHeader label="Office" title="Office Purchases" />
      {canAsk && (
        <Card>
          <CardHeader><CardTitle>Things I need</CardTitle></CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cheez" htmlFor="op-n"><Input id="op-n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juice, spray…" /></Field>
            <Field label="Quantity" htmlFor="op-q"><Input id="op-q" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
            <Field label="Andazan price (Rs)" htmlFor="op-a"><Input id="op-a" inputMode="decimal" value={approx} onChange={(e) => setApprox(e.target.value)} /></Field>
          </div>
          <div className="mt-3 space-y-2">
            <Button variant="secondary" disabled={name.trim().length < 2 || !quantity.trim() || rupeesToPaisa(approx) === null} onClick={() => { setList((l) => [...l, { name: name.trim(), quantity: quantity.trim(), approxPaisa: rupeesToPaisa(approx) ?? 0 }]); setName(''); setQuantity(''); setApprox(''); }}>Add to my list</Button>
            {list.length > 0 && <ul className="text-dense">{list.map((i, x) => <li key={x}>{i.name} · {i.quantity} · {formatRs(i.approxPaisa)}</li>)}</ul>}
            <ActError error={ask.error} />
            <Button disabled={!list.length} loading={ask.isPending} onClick={() => ask.mutate(undefined)}>Send to Manager</Button>
          </div>
        </Card>
      )}
      <Loaded q={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi request nahi">
        {(d) => (
          <div className="space-y-2">
            {d.items.map((r) => {
              const overLimit = (rupeesToPaisa(budget[r.id] ?? '') ?? 0) > d.managerLimitPaisa && !isOwner;
              const open = r.status === 'PENDING' || (r.status === 'WITH_OWNERS' && isOwner);
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{r.requestedBy} · andazan {formatRs(r.estimatePaisa)}</p>
                    <Chip tone={r.status === 'SETTLED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'gold'}>{titleCase(r.status)}</Chip>
                  </div>
                  <ul className="text-dense">{r.items.map((i, x) => <li key={x}>{i.name} · {i.quantity} · {formatRs(i.approxPaisa)}</li>)}</ul>
                  <p className="text-[12px] text-muted">
                    {formatDateTime(r.createdAt)}{r.budgetPaisa !== null ? ` · Cash ${formatRs(r.budgetPaisa)}` : ''}{r.billTotalPaisa !== null ? ` · Bill ${formatRs(r.billTotalPaisa)} · Change ${formatRs(r.changePaisa)}` : ''}{r.decisionNote ? ` · ${r.decisionNote}` : ''}
                  </p>
                  {canDecide && open && (
                    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2">
                      <Field label="Cash dein (Rs)" htmlFor={`b-${r.id}`} error={overLimit ? `Had ${formatRs(d.managerLimitPaisa)}: MD aur Hamza ko bhejein` : undefined}><Input id={`b-${r.id}`} inputMode="decimal" value={budget[r.id] ?? ''} onChange={(e) => setBudget((b) => ({ ...b, [r.id]: e.target.value }))} /></Field>
                      <Field label="Note" htmlFor={`nn-${r.id}`}><Input id={`nn-${r.id}`} value={note[r.id] ?? ''} onChange={(e) => setNote((b) => ({ ...b, [r.id]: e.target.value }))} /></Field>
                      <Button size="sm" disabled={overLimit || !rupeesToPaisa(budget[r.id] ?? '')} loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, action: 'APPROVE' })}>Approve and give cash</Button>
                      {!isOwner && <Button size="sm" variant="secondary" loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, action: 'SEND_TO_OWNERS' })}>Send to MD and Hamza</Button>}
                      <Button size="sm" variant="ghost" loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, action: 'REJECT' })}>Reject</Button>
                    </div>
                  )}
                  {canSettle && r.status === 'CASH_GIVEN' && (
                    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2">
                      <Field label="Bill total (Rs)" htmlFor={`s-${r.id}`}><Input id={`s-${r.id}`} inputMode="decimal" value={bill[r.id] ?? ''} onChange={(e) => setBill((b) => ({ ...b, [r.id]: e.target.value }))} /></Field>
                      <UploadButton route="officeBill" recordType="OfficePurchase" recordId={r.id} label={billFile[r.id] ? 'Photo add ho gayi' : 'Bill ki photo'} onUploaded={(id) => setBillFile((b) => ({ ...b, [r.id]: id }))} />
                      <Button size="sm" disabled={rupeesToPaisa(bill[r.id] ?? '') === null} loading={settle.isPending} onClick={() => settle.mutate(r.id)}>Take the bill and the change</Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Loaded>
      <ActError error={decide.error ?? settle.error} />
    </div>
  );
}

// ───────────── Kits and room holds ─────────────

function DoctorDepartments({ doctor }: { doctor: { id: string; name: string; departments: string[] } }) {
  const [text, setText] = React.useState(doctor.departments.join(', '));
  const save = useAct(() => put(`/ops/departments/doctors/${doctor.id}`, { departments: text.split(',').map((x) => x.trim()).filter(Boolean) }), 'Departments save ho gaye');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={doctor.name} htmlFor={`d-${doctor.id}`}><Input id={`d-${doctor.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dental, ENT" /></Field>
      <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
    </div>
  );
}

function ServiceDepartment({ service }: { service: { id: string; name: string; department: string | null } }) {
  const [text, setText] = React.useState(service.department ?? '');
  const save = useAct(() => put(`/ops/departments/services/${service.id}`, { department: text.trim() || null }), 'Department save ho gaya');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={service.name} htmlFor={`s-${service.id}`}><Input id={`s-${service.id}`} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
    </div>
  );
}

function Departments() {
  const q = useOps('departments', () => get<{ doctors: { id: string; name: string; departments: string[] }[]; services: { id: string; name: string; department: string | null }[] }>('/ops/departments'));
  return (
    <Card>
      <CardHeader><CardTitle>Departments</CardTitle></CardHeader>
      <p className="mb-2 text-dense text-muted">Doctor ke departments likhne par booking mein sirf unki services aayengi. Khali chhorein to sab services aayengi.</p>
      <Loaded q={q}>
        {(d) => (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">{d.doctors.map((x) => <DoctorDepartments key={x.id} doctor={x} />)}</div>
            <div className="max-h-96 space-y-2 overflow-y-auto">{d.services.map((x) => <ServiceDepartment key={x.id} service={x} />)}</div>
          </div>
        )}
      </Loaded>
    </Card>
  );
}

export function KitsPage() {
  const kits = useOps('kits', () => get<{ kits: { id: string; serviceName: string; itemName: string; quantity: number }[]; services: { id: string; name: string }[]; items: { id: string; name: string; baseUnit: string }[] }>('/ops/kits'));
  const holds = useOps('room-holds', () => get<{ items: { id: string; room: string; purpose: string; startAt: string; endAt: string }[]; rooms: { id: string; code: string }[] }>('/ops/room-holds'));
  const [serviceId, setServiceId] = React.useState('');
  const [itemId, setItemId] = React.useState('');
  const [qty, setQty] = React.useState('1');
  const save = useAct(() => put('/ops/kits', { serviceId, itemId, quantity: Number(qty) }), 'Kit save ho gaya', () => setItemId(''));
  const remove = useAct((id: string) => post(`/ops/kits/${id}/remove`), 'Hata diya');
  const [roomId, setRoomId] = React.useState('');
  const [start, setStart] = React.useState('');
  const [minutes, setMinutes] = React.useState('60');
  const hold = useAct(() => post('/ops/room-holds', { roomId, startAt: new Date(start).toISOString(), minutes: Number(minutes), purpose: 'Video shoot' }), 'Room reserve ho gaya', () => setStart(''));
  const cancel = useAct((id: string) => post(`/ops/room-holds/${id}/cancel`), 'Reservation cancel ho gayi');
  return (
    <div className="space-y-4">
      <PageHeader label="Clinic" title="Kits, Rooms & Departments" />
      <Departments />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Procedure ka standard kit</CardTitle></CardHeader>
          <div className="space-y-3">
            <Field label="Procedure" htmlFor="k-s"><Select id="k-s" value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">Chunein</option>{(kits.data?.services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Item" htmlFor="k-i"><Select id="k-i" value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Chunein</option>{(kits.data?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
              <Field label="Quantity" htmlFor="k-q"><Input id="k-q" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <ActError error={save.error} />
            <Button disabled={!serviceId || !itemId || !Number(qty)} loading={save.isPending} onClick={() => save.mutate(undefined)}>Add to kit</Button>
            <ul className="text-dense">{(kits.data?.kits ?? []).map((k) => <li key={k.id} className="flex justify-between gap-2"><span>{k.serviceName}: {k.itemName} × {k.quantity}</span><button className="text-danger" onClick={() => remove.mutate(k.id)}>Remove</button></li>)}</ul>
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>Room video shoot ke liye reserve</CardTitle></CardHeader>
          <div className="space-y-3">
            <Field label="Room" htmlFor="h-r"><Select id="h-r" value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Chunein</option>{(holds.data?.rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</Select></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kab" htmlFor="h-s"><Input id="h-s" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="Minutes" htmlFor="h-m"><Input id="h-m" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <ActError error={hold.error} />
            <Button disabled={!roomId || !start || !Number(minutes)} loading={hold.isPending} onClick={() => hold.mutate(undefined)}>Reserve room</Button>
            <ul className="text-dense">{(holds.data?.items ?? []).map((h) => <li key={h.id} className="flex justify-between gap-2"><span>{h.room} · {h.purpose} · {formatDateTime(h.startAt)}</span><button className="text-danger" onClick={() => cancel.mutate(h.id)}>Cancel</button></li>)}</ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ───────────── Documents ─────────────

/** A saved report's figures as label and value; anything ending in Paisa is shown in rupees. */
function reportLines(payload: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(payload).flatMap(([k, v]): [string, string][] => {
    const label = `${prefix}${titleCase(k.replace(/Paisa$/, '').replace(/([A-Z])/g, ' $1'))}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) return reportLines(v as Record<string, unknown>, `${label}: `);
    if (v === null || v === undefined || Array.isArray(v)) return [];
    return [[label, k.endsWith('Paisa') ? formatRs(Number(v)) : String(v)]];
  });
}

export function DocumentsPage() {
  const [text, setText] = React.useState('');
  const debounced = useDebounced(text);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const report = useQuery({ queryKey: ['ops', 'saved-report', openId], queryFn: () => get<{ title: string; payload: Record<string, unknown> }>(`/ops/saved-reports/${openId}`), enabled: !!openId });
  const q = useQuery({ queryKey: ['ops', 'documents', debounced], queryFn: () => get<{ items: { id: string; kind: string; number: string; amountPaisa: number | null; status: string; date: string }[]; saved: { id: string; title: string; date: string }[] }>('/ops/documents', { q: debounced || undefined }) });
  return (
    <div className="space-y-3">
      <PageHeader label="Records" title="Documents" />
      <div className="max-w-md"><Input aria-label="Search documents" value={text} onChange={(e) => setText(e.target.value)} placeholder="Number se search karein" /></div>
      <Loaded q={q}>
        {(d) => (
          <>
            {d.items.length > 0 && <CopyForExcel rows={[['Type', 'Number', 'Rs', 'Status', 'Date'], ...d.items.map((r) => [r.kind, r.number, rupees(r.amountPaisa), titleCase(r.status), formatDate(r.date)])]} />}
            {d.items.length === 0 ? <EmptyState title="Koi record nahi mila" /> : (
              <DataTable
                rows={d.items}
                rowKey={(r) => `${r.kind}:${r.id}`}
                columns={[
                  { key: 'k', header: 'Type', cell: (r) => r.kind },
                  { key: 'n', header: 'Number', cell: (r) => <span className="font-semibold">{r.number}</span> },
                  { key: 'a', header: 'Amount', cell: (r) => (r.amountPaisa === null ? '—' : formatRs(r.amountPaisa)) },
                  { key: 's', header: 'Status', cell: (r) => titleCase(r.status) },
                  { key: 'd', header: 'Date', cell: (r) => formatDate(r.date) },
                ]}
              />
            )}
            <Card>
              <CardHeader><CardTitle>Saved reports</CardTitle></CardHeader>
              {d.saved.length === 0 ? <p className="text-dense text-muted">Din band hone par report yahan khud save hoti hai.</p> : <ul className="space-y-1 text-dense">{d.saved.map((s) => <li key={s.id}><button className="font-semibold text-brand-medium hover:underline" onClick={() => setOpenId(s.id)}>{s.title}</button></li>)}</ul>}
            </Card>
            <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
              <DialogContent title={report.data?.title ?? 'Report'}>
                <Loaded q={report}>
                  {(r) => (
                    <div className="space-y-1">
                      {reportLines(r.payload).map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3 border-b border-line py-1 text-dense"><span>{label}</span><span className="font-semibold">{value}</span></div>
                      ))}
                      <div className="flex gap-2 pt-2 print:hidden">
                        <CopyForExcel rows={reportLines(r.payload)} />
                        <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
                      </div>
                    </div>
                  )}
                </Loaded>
              </DialogContent>
            </Dialog>
          </>
        )}
      </Loaded>
    </div>
  );
}
