'use client';
import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, get, idempotencyFor, patch, post, put } from '@/lib/api';
import type { AdvanceEntry, InvoiceOptions, MoneyMethod, PatientHit } from '@/lib/invoice-types';
import { rupeesToPaisa } from '@/lib/money';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime } from '@/lib/time';
import { formatPhone, formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { AuditList } from './audit-list';
import { emptyPayment, PatientPicker, PaymentFields, paymentBody, paymentComplete, useInvoiceOptions } from './payment-fields';
import { InvoiceTabs, METHOD_LABEL, Pager, useInvoiceAccess } from './shared';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Save nahi hua. Aap ka data mehfooz hai, dobara koshish karein.');

// ───────────── Advance Payments ─────────────

interface AdvancePage {
  items: AdvanceEntry[];
  total: number;
  page: number;
  pageSize: number;
  balancePaisa?: number;
}

const ENTRY_LABEL: Record<AdvanceEntry['type'], string> = { RECEIPT: 'Advance liya', APPLIED: 'Invoice par laga', CANCEL_CREDIT: 'Cancel invoice se aaya', REFUND: 'Wapas kiya' };

function MoneyDialog({ title, description, open, onOpenChange, options, needsPatient, patient, reasonLabel, reasonRequired, submitLabel, onSubmit, danger }: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  options: InvoiceOptions | undefined;
  needsPatient?: boolean;
  patient?: PatientHit | null;
  reasonLabel: string;
  reasonRequired?: boolean;
  submitLabel: string;
  danger?: boolean;
  onSubmit: (v: { patientId: string; amountPaisa: number; paymentModeId: string; bankAccountId?: string; reference?: string; text: string }, key: string) => Promise<unknown>;
}) {
  const [who, setWho] = React.useState<PatientHit | null>(patient ?? null);
  const [p, setP] = React.useState(emptyPayment);
  const [text, setText] = React.useState('');
  const keyFor = React.useRef(idempotencyFor());
  React.useEffect(() => {
    if (open) {
      setWho(patient ?? null);
      setP(emptyPayment);
      setText('');
      keyFor.current = idempotencyFor();
    }
  }, [open, patient]);
  const amount = rupeesToPaisa(p.amount);
  const m = useMutation({
    mutationFn: () => {
      const b = paymentBody(p);
      return onSubmit({ patientId: who!.id, amountPaisa: b.amountPaisa, paymentModeId: b.paymentModeId, bankAccountId: b.bankAccountId, reference: b.reference, text: text.trim() }, keyFor.current({ who: who?.id, ...b, text }));
    },
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div className="space-y-3">
          {needsPatient && (
            <Field label="Patient" required>
              <PatientPicker value={who} onChange={setWho} />
            </Field>
          )}
          <PaymentFields value={p} onChange={setP} options={options} idPrefix="am" />
          <Field label={reasonLabel} required={reasonRequired} htmlFor="am-note">
            <Input id="am-note" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {m.error && <Notice>{errorText(m.error)}</Notice>}
          <div className="flex justify-end">
            <Button variant={danger ? 'danger' : 'primary'} loading={m.isPending} disabled={!who || !amount || !paymentComplete(p, options) || (reasonRequired && text.trim().length < 3)} onClick={() => m.mutate()}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdvancesPage() {
  const qc = useQueryClient();
  const { can } = useInvoiceAccess();
  const { pollInterval } = useRealtime();
  const options = useInvoiceOptions();
  const [patient, setPatient] = React.useState<PatientHit | null>(null);
  const [page, setPage] = React.useState(1);
  const [dialog, setDialog] = React.useState<'receive' | 'refund' | null>(null);
  const q = useQuery({
    queryKey: ['invoices', 'advances', patient?.id ?? 'all', page],
    queryFn: () => get<AdvancePage>('/invoices/advances', { patientId: patient?.id, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
    refetchInterval: pollInterval,
  });
  const changed = (message: string) => {
    toast.success(message);
    void qc.invalidateQueries({ queryKey: ['invoices'] });
  };
  return (
    <div>
      <PageHeader
        label="Billing"
        title="Advance Payments"
        actions={
          <Button onClick={() => setDialog('receive')}>
            <Plus className="size-4" aria-hidden /> Advance lein
          </Button>
        }
      />
      <InvoiceTabs />
      <Card className="mb-4">
        <Field label="Patient dhoondein">
          <PatientPicker
            allowNew={false}
            value={patient}
            onChange={(p) => {
              setPatient(p);
              setPage(1);
            }}
          />
        </Field>
        {patient && q.data?.balancePaisa !== undefined && (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <StatTile label="Patient ka advance" value={formatRs(q.data.balancePaisa)} />
            {can('cancel') && q.data.balancePaisa > 0 && (
              <Button variant="secondary" onClick={() => setDialog('refund')}>
                Advance wapas karein
              </Button>
            )}
          </div>
        )}
      </Card>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi advance nahi" emptyHint="Advance lein se patient ki raqam record karein. Yeh agli invoices par lag sakti hai.">
        {(d) => (
          <>
            <DataTable
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'when', header: 'Date', cell: (r) => formatDateTime(r.createdAt) },
                {
                  key: 'patient',
                  header: 'Patient',
                  cell: (r) => (
                    <span>
                      <span className="font-semibold">{r.patient.name}</span>
                      <span className="block text-[12px] text-muted">{formatPhone(r.patient.phone)}</span>
                    </span>
                  ),
                },
                { key: 'type', header: 'Kya hua', cell: (r) => <Chip tone={r.amountPaisa > 0 ? 'success' : 'neutral'}>{ENTRY_LABEL[r.type]}</Chip> },
                { key: 'how', header: 'Mode', cell: (r) => (r.method ? `${METHOD_LABEL[r.method] ?? r.method}${r.reference ? ` · ${r.reference}` : ''}` : '—'), hideSm: true },
                { key: 'receipt', header: 'Receipt', cell: (r) => r.receiptNo ?? '—', hideSm: true },
                { key: 'by', header: 'By', cell: (r) => r.actorName ?? '—', hideSm: true },
                { key: 'note', header: 'Note', cell: (r) => r.note ?? '—', hideSm: true },
                { key: 'amount', header: 'Amount', cell: (r) => <span className={r.amountPaisa < 0 ? 'font-semibold text-danger' : 'font-semibold'}>{formatRs(r.amountPaisa)}</span> },
              ]}
            />
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <MoneyDialog
        title="Advance lein"
        open={dialog === 'receive'}
        onOpenChange={(v) => !v && setDialog(null)}
        options={options.data}
        needsPatient
        patient={patient}
        reasonLabel="Note"
        submitLabel="Advance save karein"
        onSubmit={async (v, key) => {
          await post('/invoices/advances', { patientId: v.patientId, amountPaisa: v.amountPaisa, paymentModeId: v.paymentModeId, bankAccountId: v.bankAccountId, reference: v.reference, note: v.text || undefined }, key);
          changed('Advance save ho gaya');
        }}
      />
      <MoneyDialog
        title="Advance wapas karein"
        description={q.data?.balancePaisa !== undefined ? `Patient ka advance: ${formatRs(q.data.balancePaisa)}` : undefined}
        open={dialog === 'refund'}
        onOpenChange={(v) => !v && setDialog(null)}
        options={options.data}
        patient={patient}
        reasonLabel="Wajah"
        reasonRequired
        submitLabel="Wapas karein"
        danger
        onSubmit={async (v, key) => {
          await post(`/invoices/advances/patient/${v.patientId}/refund`, { amountPaisa: v.amountPaisa, paymentModeId: v.paymentModeId, bankAccountId: v.bankAccountId, reference: v.reference, reason: v.text }, key);
          changed('Advance wapas ho gaya');
        }}
      />
    </div>
  );
}

// ───────────── Payment Modes ─────────────

interface ModeRow {
  id: string;
  name: string;
  method: MoneyMethod;
  active: boolean;
  sortOrder: number;
}

function RenameCell({ name, onSave }: { name: string; onSave: (v: string) => void }) {
  const [text, setText] = React.useState(name);
  React.useEffect(() => setText(name), [name]);
  return <Input aria-label={`Naam: ${name}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim().length >= 2 && text.trim() !== name && onSave(text.trim())} />;
}

export function PaymentModesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invoices', 'modes'], queryFn: () => get<{ items: ModeRow[] }>('/invoices/payment-modes') });
  const [name, setName] = React.useState('');
  const [method, setMethod] = React.useState<MoneyMethod>('BANK_ONLINE');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['invoices'] });
  const add = useMutation({
    mutationFn: () => post('/invoices/payment-modes', { name: name.trim(), method }),
    onSuccess: () => {
      toast.success('Payment mode add ho gaya');
      setName('');
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; active?: boolean }) => patch(`/invoices/payment-modes/${id}`, body),
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <div>
      <PageHeader label="Billing" title="Payment Modes" />
      <InvoiceTabs />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Naya mode</CardTitle>
        </CardHeader>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Naam" htmlFor="pm-name">
            <Input id="pm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Easypaisa" />
          </Field>
          <Field label="Kis tarah gina jaye" htmlFor="pm-method" hint="Bank ledger aur Cash Closing ke liye. Baad mein badal nahi sakta.">
            <Select id="pm-method" value={method} onChange={(e) => setMethod(e.target.value as MoneyMethod)}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK_ONLINE">Online transfer</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </Field>
          <Button loading={add.isPending} disabled={name.trim().length < 2} onClick={() => add.mutate()}>
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </div>
        {add.error && <div className="mt-3"><Notice>{errorText(add.error)}</Notice></div>}
      </Card>
      <QueryState query={q}>
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Naam', cell: (r) => <RenameCell name={r.name} onSave={(v) => change.mutate({ id: r.id, name: v })} /> },
              { key: 'method', header: 'Gina jata hai', cell: (r) => METHOD_LABEL[r.method] },
              { key: 'on', header: 'Status', cell: (r) => <Checkbox label={r.active ? 'On' : 'Off'} checked={r.active} onChange={(e) => change.mutate({ id: r.id, active: e.target.checked })} /> },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}

// ───────────── Invoice Categories ─────────────

interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  _count: { services: number };
}

export function CategoriesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invoices', 'categories'], queryFn: () => get<{ items: CategoryRow[] }>('/invoices/categories') });
  const options = useInvoiceOptions();
  const [name, setName] = React.useState('');
  const [text, setText] = React.useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['invoices'] });
  const add = useMutation({
    mutationFn: () => post('/invoices/categories', { name: name.trim() }),
    onSuccess: () => {
      toast.success('Category add ho gayi');
      setName('');
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; active?: boolean }) => patch(`/invoices/categories/${id}`, body),
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });
  const assign = useMutation({
    mutationFn: ({ serviceId, categoryId }: { serviceId: string; categoryId: string }) => put(`/invoices/services/${serviceId}/category`, { categoryId }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });
  const needle = text.trim().toLowerCase();
  const services = (options.data?.services ?? []).filter((s) => !needle || s.name.toLowerCase().includes(needle)).slice(0, 50);
  return (
    <div>
      <PageHeader label="Billing" title="Invoice Categories" />
      <InvoiceTabs />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nayi category</CardTitle>
            </CardHeader>
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Naam" htmlFor="ic-name">
                <Input id="ic-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button loading={add.isPending} disabled={name.trim().length < 2} onClick={() => add.mutate()}>
                <Plus className="size-4" aria-hidden /> Add
              </Button>
            </div>
            {add.error && <div className="mt-3"><Notice>{errorText(add.error)}</Notice></div>}
          </Card>
          <QueryState query={q}>
            {(d) => (
              <DataTable
                rows={d.items}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'name', header: 'Naam', cell: (r) => <RenameCell name={r.name} onSave={(v) => change.mutate({ id: r.id, name: v })} /> },
                  { key: 'count', header: 'Services', cell: (r) => r._count.services },
                  { key: 'on', header: 'Status', cell: (r) => <Checkbox label={r.active ? 'On' : 'Off'} checked={r.active} onChange={(e) => change.mutate({ id: r.id, active: e.target.checked })} /> },
                ]}
              />
            )}
          </QueryState>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Service ki category</CardTitle>
          </CardHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" aria-label="Service search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Service ka naam…" />
          </div>
          <ul className="divide-y divide-line text-dense">
            {services.map((s) => (
              <li key={s.id} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_12rem]">
                <span className="font-semibold text-ink">{s.name}</span>
                <Select aria-label={`${s.name} ki category`} value={s.invoiceCategoryId ?? ''} onChange={(e) => e.target.value && assign.mutate({ serviceId: s.id, categoryId: e.target.value })}>
                  <option value="">— Chunein —</option>
                  {(options.data?.categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ───────────── Settings ─────────────

interface InvoiceSettings {
  numberPrefix: string;
  numberFormat: string;
  taxEnabled: boolean;
  taxBasisPoints: number;
  clinicName: string;
  logoDataUrl: string | null;
  numberExample: string;
}

/** Shrink a logo so it fits in Settings and prints quickly. PNG keeps a transparent background. */
async function logoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = canvas.toDataURL('image/png');
  return png.length <= 250_000 ? png : canvas.toDataURL('image/jpeg', 0.85);
}

export function InvoiceSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invoices', 'settings'], queryFn: () => get<InvoiceSettings>('/invoices/settings') });
  const [form, setForm] = React.useState<{ numberPrefix: string; numberFormat: string; taxEnabled: boolean; taxPercent: string; clinicName: string; logoDataUrl: string | null } | null>(null);
  React.useEffect(() => {
    if (q.data && !form) setForm({ numberPrefix: q.data.numberPrefix, numberFormat: q.data.numberFormat, taxEnabled: q.data.taxEnabled, taxPercent: String(q.data.taxBasisPoints / 100), clinicName: q.data.clinicName, logoDataUrl: q.data.logoDataUrl });
  }, [q.data, form]);
  const [logoError, setLogoError] = React.useState('');
  const save = useMutation({
    mutationFn: () => {
      const bp = rupeesToPaisa(form!.taxPercent) ?? 0;
      return put<InvoiceSettings>('/invoices/settings', { numberPrefix: form!.numberPrefix.trim(), numberFormat: form!.numberFormat.trim(), taxEnabled: form!.taxEnabled, taxBasisPoints: bp, clinicName: form!.clinicName.trim(), logoDataUrl: form!.logoDataUrl });
    },
    onSuccess: (d) => {
      qc.setQueryData(['invoices', 'settings'], d);
      void qc.invalidateQueries({ queryKey: ['invoices', 'options'] });
      toast.success('Settings save ho gayin');
    },
  });
  const rateValid = rupeesToPaisa(form?.taxPercent ?? '0') !== null && (rupeesToPaisa(form?.taxPercent ?? '0') ?? 0) <= 10_000;
  return (
    <div>
      <PageHeader label="Billing" title="Invoice Settings" />
      <InvoiceTabs />
      <QueryState query={{ ...q, data: form ?? undefined, isPending: q.isPending || !form }}>
        {(f) => (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Invoice number</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                <Field label="Prefix" htmlFor="is-prefix">
                  <Input id="is-prefix" value={f.numberPrefix} onChange={(e) => setForm({ ...f, numberPrefix: e.target.value })} />
                </Field>
                <Field label="Format" htmlFor="is-format" hint="{PREFIX} prefix, {YYYY} saal, {YY} saal ke 2 digit, {SEQ} number (zaroori). Purane numbers kabhi dobara nahi lagte.">
                  <Input id="is-format" value={f.numberFormat} onChange={(e) => setForm({ ...f, numberFormat: e.target.value })} />
                </Field>
                {q.data && <p className="text-dense text-muted">Abhi: {q.data.numberExample}</p>}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tax</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                <Checkbox label="Tax on" checked={f.taxEnabled} onChange={(e) => setForm({ ...f, taxEnabled: e.target.checked })} />
                <Field label="Tax rate (%)" htmlFor="is-rate" hint="Discount ke baad lagta hai, sirf nayi direct invoices par. Accountant se tasdeeq karein." error={rateValid ? undefined : '0 se 100 ke darmiyan likhein.'}>
                  <Input id="is-rate" inputMode="decimal" value={f.taxPercent} onChange={(e) => setForm({ ...f, taxPercent: e.target.value })} />
                </Field>
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Printout</CardTitle>
              </CardHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Clinic ka naam" htmlFor="is-name">
                  <Input id="is-name" value={f.clinicName} onChange={(e) => setForm({ ...f, clinicName: e.target.value })} />
                </Field>
                <div>
                  <p className="mb-1 text-dense font-semibold text-ink">Logo</p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small stored image */}
                  {f.logoDataUrl && <img src={f.logoDataUrl} alt="Clinic logo" className="mb-2 max-h-16 rounded-control border border-line p-1" />}
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex min-h-control cursor-pointer items-center gap-2 rounded-control border border-brand bg-surface px-3 text-dense font-semibold text-brand hover:bg-brand-light">
                      <Upload className="size-4" aria-hidden /> Logo chunein
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        aria-label="Logo chunein"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setLogoError('');
                          try {
                            setForm({ ...f, logoDataUrl: await logoToDataUrl(file) });
                          } catch {
                            setLogoError('Yeh image nahi khul saki. PNG ya JPG chunein.');
                          }
                        }}
                      />
                    </label>
                    {f.logoDataUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...f, logoDataUrl: null })}>
                        Hatayein
                      </Button>
                    )}
                  </div>
                  {logoError && <p className="mt-1 text-dense text-danger">{logoError}</p>}
                </div>
              </div>
            </Card>
            <div className="space-y-3 xl:col-span-2">
              {save.error && <Notice>{errorText(save.error)}</Notice>}
              <div className="flex justify-end">
                <Button loading={save.isPending} disabled={!rateValid || !f.numberFormat.includes('{SEQ}') || !f.clinicName.trim() || !f.numberPrefix.trim()} onClick={() => save.mutate()}>
                  Settings save karein
                </Button>
              </div>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}

// ───────────── History ─────────────

export function InvoiceHistoryPage() {
  return (
    <div>
      <PageHeader label="Billing" title="Billing History" />
      <InvoiceTabs />
      <AuditList />
    </div>
  );
}
