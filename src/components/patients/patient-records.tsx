'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, FileText, ImageOff, Pencil } from 'lucide-react';
import { ApiError, get, patch } from '@/lib/api';
import { formatDate, formatDateTime, formatTime } from '@/lib/time';
import { vitalsSummary } from '@/lib/doctor-types';
import { formatPhone, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, SectionLabel, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows, Skeleton } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { ViewFileButton } from '@/components/ui/file-view';

/**
 * Patient Records for Manager and MD (D-078): every patient, searchable; one patient's whole history A to Z —
 * visits, timeline, vitals, plans, procedures with before/after photos, invoices and payments, feedback. The history is
 * view only; the patient's own details can be corrected (D-079).
 */

interface PatientRow {
  id: string;
  name: string;
  phone: string;
  ageYears: number | null;
  gender: string | null;
  createdAt: string;
  visits: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  paidPaisa: number;
}
interface PatientPage {
  total: number;
  items: PatientRow[];
  nextCursor: string | null;
}

interface Doc {
  id: string;
  route: string;
  fileName: string;
  mime: string;
  createdAt: string;
}
interface Procedure {
  id: string;
  procedureName: string;
  sessionNumber: number | null;
  status: string;
  currentStep: string;
  doctorName: string | null;
  assistantName: string | null;
  assistants: { name: string | null; reason: string | null; startedAt: string; endedAt: string | null }[];
  roomCode: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  consentAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  sentToReceptionAt: string | null;
  consentAttachmentId: string | null;
  beforePhotoAttachmentId: string | null;
  beforePhotoSkipReason: string | null;
  afterPhotoAttachmentId: string | null;
  afterPhotoSkipReason: string | null;
  itemsUsed: { name: string; quantity: number; unit: string; reason: string | null }[];
  documents: Doc[];
}
interface Invoice {
  id: string;
  number: string;
  kind: 'VISIT' | 'COUNTER';
  status: string;
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  closedAt: string | null;
  createdAt: string;
  lines: { id: string; description: string; quantity: number; unitPricePaisa: number; discountPaisa: number; lineTotalPaisa: number; reversesLineId: string | null; reason: string | null }[];
  payments: { receiptNo: string; amountPaisa: number; method: string; reference: string | null; cashierName: string | null; receivedAt: string }[];
  prescriptionAttachmentId: string | null;
  documents: Doc[];
}
interface PlanVersion {
  versionNo: number;
  consultationReason: string;
  consultationFeePaisa: number;
  consultationFeeWaived: boolean;
  itemsSubtotalPaisa: number;
  itemsDiscountPaisa: number;
  totalDiscountPaisa: number;
  grandTotalPaisa: number;
  advanceRequestedPaisa: number;
  balancePaisa: number;
  installmentCount: number;
  createdBy: string | null;
  createdAt: string;
  items: { id: string; sessionNumber: number; procedureName: string; sameDay: boolean; scheduledStart: string; pricePaisa: number; discountPaisa: number; status: string }[];
  installments: { seq: number; dueDate: string; amountPaisa: number }[];
}
interface Visit {
  id: string;
  startAt: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  status: string;
  source: string;
  reason: string | null;
  service: string | null;
  doctorName: string | null;
  roomCode: string | null;
  bookedBy: string | null;
  leadMemberName: string | null;
  session: number | null;
  cancelReason: string | null;
  timeline: { from: string | null; to: string; by: string | null; reason: string | null; at: string }[];
  vitals: { bpSystolic: number | null; bpDiastolic: number | null; glucoseMgDl: number | null; weightGrams: number | null; heightMm: number | null; skipped: boolean; skipReason: string | null; createdAt: string }[];
  plan: { doctorName: string | null; currentVersionNo: number; versions: PlanVersion[] } | null;
  procedures: Procedure[];
  invoice: Invoice | null;
  feedback: { skipped: boolean; doctorRating: number | null; staffRating: number | null; clinicRating: number | null; suggestion: string | null; submittedAt: string | null } | null;
  followUp: { dueDate: string; doctorRating: number | null; staffRating: number | null; clinicRating: number | null; issue: string | null; suggestion: string | null; status: string; completedAt: string | null } | null;
  aftercare: { skipped: boolean; content: string | null; createdAt: string } | null;
}
interface PatientRecord {
  patient: { id: string; name: string; phone: string; ageYears: number | null; gender: string | null; contactConsent: boolean; whatsappConsent: boolean; createdAt: string; createdBy: string | null; mergedPatients: number };
  summary: { visits: number; consultations: number; proceduresDone: number; cancelled: number; firstVisitAt: string | null; lastVisitAt: string | null; billedPaisa: number; paidPaisa: number; balancePaisa: number };
  visits: Visit[];
  otherProcedures: Procedure[];
  otherInvoices: Invoice[];
}

const DOC_LABEL: Record<string, string> = {
  prescriptionPhoto: 'Prescription',
  consentForm: 'Consent form',
  beforePhoto: 'Before photo',
  afterPhoto: 'After photo',
  itemsUsedEvidence: 'Items used',
};

// ───────────── List ─────────────

export function PatientRecordsList({ base }: { base: string }) {
  const router = useRouter();
  const [text, setText] = React.useState('');
  const [q, setQ] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const list = useInfiniteQuery({
    queryKey: ['patient-records', q],
    queryFn: ({ pageParam }) => get<PatientPage>('/patient-records', { q: q || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-3">
      <PageHeader label="Patients" title="Patient Records" />
      <div className="max-w-md">
        <Input aria-label="Search patients" value={text} onChange={(e) => setText(e.target.value)} placeholder="Naam ya phone se search karein" />
      </div>
      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Koi patient nahi mila" />
      ) : (
        <>
          <p className="text-dense text-muted">{list.data.pages[0]?.total ?? 0} patients</p>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`${base}/${r.id}`)}
            columns={[
              { key: 'name', header: 'Patient', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.phone) },
              { key: 'age', header: 'Age', cell: (r) => r.ageYears ?? '—' },
              { key: 'visits', header: 'Visits', cell: (r) => r.visits },
              { key: 'last', header: 'Last visit', cell: (r) => (r.lastVisitAt ? formatDate(r.lastVisitAt) : '—') },
              { key: 'paid', header: 'Paid', cell: (r) => formatRs(r.paidPaisa) },
            ]}
          />
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                Aur patients
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ───────────── Record ─────────────

/** A clinical photo shown inline; it loads through /api/files (scope-checked, audited). */
function PhotoThumb({ attachmentId, label }: { attachmentId: string; label: string }) {
  const q = useQuery({ queryKey: ['file-url', attachmentId], queryFn: () => get<{ url: string | null; mode: string }>(`/files/${attachmentId}/url`), staleTime: 4 * 60_000 });
  return (
    <figure className="w-36 overflow-hidden rounded-card border border-line bg-surface">
      {q.isPending ? (
        <Skeleton className="aspect-square w-full" />
      ) : q.data?.url ? (
        <a href={q.data.url} target="_blank" rel="noopener noreferrer" title="Bari photo kholen">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived URLs; next/image cannot optimise them */}
          <img src={q.data.url} alt={label} className="aspect-square w-full object-cover" />
        </a>
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-canvas text-[12px] text-muted">
          <ImageOff className="size-5" aria-hidden />
          {q.data?.mode === 'stub' ? 'Dev stub' : 'Nahi khuli'}
        </div>
      )}
      <figcaption className="px-2 py-1 text-[12px] font-semibold text-ink">{label}</figcaption>
    </figure>
  );
}

function Docs({ docs }: { docs: Doc[] }) {
  if (!docs.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-2 rounded-control border border-line px-2 py-1 text-dense">
          <FileText className="size-4 text-brand-medium" aria-hidden /> {DOC_LABEL[d.route] ?? d.route}
          <ViewFileButton attachmentId={d.id} />
        </li>
      ))}
    </ul>
  );
}

const dt = (d: string | null) => (d ? formatTime(d) : '—');

function ProcedureBlock({ p }: { p: Procedure }) {
  const photos = [
    p.beforePhotoAttachmentId ? { id: p.beforePhotoAttachmentId, label: 'Before' } : null,
    p.afterPhotoAttachmentId ? { id: p.afterPhotoAttachmentId, label: 'After' } : null,
  ].filter((x): x is { id: string; label: string } => !!x);
  const shown = new Set([p.beforePhotoAttachmentId, p.afterPhotoAttachmentId]);
  return (
    <div className="rounded-card bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {p.procedureName}
          {p.sessionNumber ? ` · session ${p.sessionNumber}` : ''}
        </p>
        <StatusChip status={p.status} />
      </div>
      <p className="text-dense text-muted">
        Doctor: {p.doctorName ?? 'Doctor nahi'} · Assistant: {p.assistantName ?? '—'} · Room {p.roomCode ?? '—'}
      </p>
      {p.assistants.length > 1 && (
        <p className="text-dense text-muted">
          Assistants: {p.assistants.map((a) => `${a.name ?? '—'}${a.reason ? ` (${a.reason})` : ''}`).join(' → ')}
        </p>
      )}
      <p className="text-dense text-muted">
        Assign {dt(p.assignedAt)} · Accept {dt(p.acceptedAt)} · Consent {dt(p.consentAt)} · Start {dt(p.startedAt)} · End {dt(p.endedAt)}
      </p>
      {(p.beforePhotoSkipReason || p.afterPhotoSkipReason) && (
        <p className="text-dense text-ink">
          {p.beforePhotoSkipReason && `Before photo skip: ${p.beforePhotoSkipReason}. `}
          {p.afterPhotoSkipReason && `After photo skip: ${p.afterPhotoSkipReason}.`}
        </p>
      )}
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((ph) => (
            <PhotoThumb key={ph.id} attachmentId={ph.id} label={ph.label} />
          ))}
        </div>
      )}
      {p.itemsUsed.length > 0 && (
        <div className="mt-2">
          <SectionLabel>Items used</SectionLabel>
          <ul className="text-dense text-ink">
            {p.itemsUsed.map((u, i) => (
              <li key={i}>
                {u.name} — {u.quantity} {u.unit}
                {u.reason ? ` (${u.reason})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Docs docs={p.documents.filter((d) => !shown.has(d.id))} />
    </div>
  );
}

function InvoiceBlock({ inv }: { inv: Invoice }) {
  return (
    <div className="rounded-card bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {inv.kind === 'COUNTER' ? 'Pharmacy' : 'Invoice'} {inv.number} · {formatDateTime(inv.createdAt)}
        </p>
        <StatusChip status={inv.status} />
      </div>
      <ul className="mt-1 text-dense">
        {inv.lines.map((l) => (
          <li key={l.id} className="flex flex-wrap justify-between gap-2">
            <span>
              {l.description}
              {l.quantity > 1 ? ` × ${l.quantity}` : ''}
              {l.reason ? ` (${l.reason})` : ''}
            </span>
            <span>{formatRs(l.lineTotalPaisa)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-dense text-ink">
        Total {formatRs(inv.totalPaisa)}
        {inv.discountPaisa ? ` (discount ${formatRs(inv.discountPaisa)})` : ''} · Paid {formatRs(inv.paidPaisa)} · Balance {formatRs(inv.balancePaisa)}
      </p>
      {inv.payments.length > 0 && (
        <ul className="mt-1 text-[12px] text-muted">
          {inv.payments.map((p) => (
            <li key={p.receiptNo}>
              {p.receiptNo} · {formatDateTime(p.receivedAt)} · {titleCase(p.method)} {formatRs(p.amountPaisa)}
              {p.reference ? ` · ${p.reference}` : ''}
              {p.cashierName ? ` · ${p.cashierName}` : ''}
            </li>
          ))}
        </ul>
      )}
      <Docs docs={inv.documents} />
    </div>
  );
}

const stars = (n: number | null) => (n ? `${n}/5` : '—');

function VisitCard({ v }: { v: Visit }) {
  const [open, setOpen] = React.useState(false);
  const plan = v.plan?.versions.find((x) => x.versionNo === v.plan?.currentVersionNo) ?? v.plan?.versions.at(-1) ?? null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{formatDateTime(v.startAt)}</CardTitle>
          <p className="text-dense text-muted">
            {titleCase(v.type)}
            {v.service ? ` (${v.service})` : ''}
            {v.session ? ` · session ${v.session}` : ''} · {v.doctorName ?? 'Doctor nahi'}
            {v.roomCode ? ` · Room ${v.roomCode}` : ''}
          </p>
          <p className="text-[12px] text-muted">
            Booking: {titleCase(v.source)}
            {v.bookedBy ? ` · ${v.bookedBy}` : ''}
            {v.leadMemberName ? ` · Lead: ${v.leadMemberName}` : ''}
          </p>
        </div>
        <StatusChip status={v.status} />
      </CardHeader>
      {v.reason && <p className="text-dense text-ink">{v.reason}</p>}
      {v.cancelReason && <p className="text-dense text-danger">Cancel: {v.cancelReason}</p>}
      {v.vitals[0] && <p className="mt-1 text-dense text-muted">{v.vitals[0].skipped ? `Vitals skipped${v.vitals[0].skipReason ? ` — ${v.vitals[0].skipReason}` : ''}` : vitalsSummary(v.vitals[0])}</p>}

      {plan && (
        <div className="mt-3 rounded-card bg-canvas p-3">
          <SectionLabel>
            Treatment plan v{plan.versionNo}
            {v.plan && v.plan.versions.length > 1 ? ` (${v.plan.versions.length} versions)` : ''} · {v.plan?.doctorName ?? 'Doctor nahi'}
          </SectionLabel>
          <p className="text-dense text-ink">{plan.consultationReason}</p>
          <ul className="mt-1 text-dense">
            {plan.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {i.sessionNumber}. {i.procedureName} · {i.sameDay ? 'same-day' : formatDate(i.scheduledStart)} · {formatRs(i.pricePaisa - i.discountPaisa)}
                </span>
                <StatusChip status={i.status} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-muted">
            Consultation {plan.consultationFeeWaived ? 'waived' : formatRs(plan.consultationFeePaisa)} · Plan total {formatRs(plan.grandTotalPaisa)} · Advance {formatRs(plan.advanceRequestedPaisa)}
            {plan.installmentCount ? ` · ${plan.installmentCount} installments` : ''}
          </p>
        </div>
      )}

      {v.procedures.length > 0 && (
        <div className="mt-3 space-y-2">
          {v.procedures.map((p) => (
            <ProcedureBlock key={p.id} p={p} />
          ))}
        </div>
      )}

      {v.invoice && (
        <div className="mt-3">
          <InvoiceBlock inv={v.invoice} />
        </div>
      )}

      {(v.feedback || v.followUp || v.aftercare) && (
        <div className="mt-3 space-y-1 text-dense">
          {v.aftercare && <p>Aftercare: {v.aftercare.skipped ? 'Skipped' : (v.aftercare.content ?? '—')}</p>}
          {v.feedback && (
            <p>
              Feedback:{' '}
              {v.feedback.skipped
                ? 'Skipped'
                : v.feedback.submittedAt
                  ? `Doctor ${stars(v.feedback.doctorRating)} · Staff ${stars(v.feedback.staffRating)} · Clinic ${stars(v.feedback.clinicRating)}${v.feedback.suggestion ? ` · “${v.feedback.suggestion}”` : ''}`
                  : 'Abhi nahi diya'}
            </p>
          )}
          {v.followUp && (
            <p>
              Follow-up ({formatDate(v.followUp.dueDate)}): {titleCase(v.followUp.status)}
              {v.followUp.completedAt ? ` · Doctor ${stars(v.followUp.doctorRating)} · Staff ${stars(v.followUp.staffRating)} · Clinic ${stars(v.followUp.clinicRating)}` : ''}
              {v.followUp.issue ? ` · Masla: ${v.followUp.issue}` : ''}
            </p>
          )}
        </div>
      )}

      {v.timeline.length > 0 && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Timeline chhupayein' : `Timeline dekhein (${v.timeline.length})`}
          </Button>
          {open && (
            <ol className="mt-1 space-y-0.5 border-l border-line pl-3 text-[12px] text-muted">
              {v.timeline.map((t, i) => (
                <li key={i}>
                  {formatDateTime(t.at)} · {titleCase(t.to)}
                  {t.by ? ` · ${t.by}` : ''}
                  {t.reason ? ` · ${t.reason}` : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

/** Correct a wrong entry in the patient's details (D-079): name, phone, age, gender, with a reason. */
function EditPatientButton({ patient }: { patient: PatientRecord['patient'] }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(patient.name);
  const [phone, setPhone] = React.useState(patient.phone);
  const [age, setAge] = React.useState(patient.ageYears?.toString() ?? '');
  const [gender, setGender] = React.useState(patient.gender ?? '');
  const [reason, setReason] = React.useState('');
  const [dups, setDups] = React.useState<{ id: string; name: string; ageYears: number | null }[] | null>(null);
  const [shared, setShared] = React.useState(false);
  const reset = () => {
    setName(patient.name);
    setPhone(patient.phone);
    setAge(patient.ageYears?.toString() ?? '');
    setGender(patient.gender ?? '');
    setReason('');
    setDups(null);
    setShared(false);
  };
  const m = useMutation({
    mutationFn: () =>
      patch(`/patient-records/${patient.id}`, {
        name: name.trim(),
        phone: phone.trim(),
        ageYears: age ? Number(age) : null,
        gender: gender || null,
        reason: reason.trim(),
        confirmSharedPhone: shared || undefined,
      }),
    onSuccess: () => {
      toast.success('Patient ki details update ho gayi');
      void qc.invalidateQueries({ queryKey: ['patient-records'] });
      setOpen(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'DUPLICATE_PHONE') setDups((e.details as { existing?: { id: string; name: string; ageYears: number | null }[] } | undefined)?.existing ?? []);
    },
  });
  const valid = name.trim().length >= 2 && phone.trim().length >= 7 && reason.trim().length >= 3 && (!dups || shared);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          reset();
          m.reset();
          setOpen(true);
        }}
      >
        <Pencil className="size-4" aria-hidden /> Edit details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Patient details edit" description="Sirf ghalat entry theek karein. Visits, bills aur photos yahan se nahi badalte.">
          <form
            className="space-y-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) m.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required htmlFor="ep-name">
                <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Phone" required htmlFor="ep-phone">
                <Input
                  id="ep-phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setDups(null);
                    setShared(false);
                  }}
                />
              </Field>
              <Field label="Age" htmlFor="ep-age">
                <Input id="ep-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              </Field>
              <Field label="Gender" htmlFor="ep-g">
                <Select id="ep-g" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">—</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </div>
            <Field label="Tabdeeli ki wajah" required htmlFor="ep-reason">
              <Textarea id="ep-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reception ne naam ghalat likha tha" />
            </Field>
            {dups && (
              <div className="space-y-2 rounded-card border border-warning/40 bg-warning-bg p-3">
                <p className="text-dense font-semibold text-warning">Is number par pehle se patient registered hai:</p>
                <ul className="text-dense">
                  {dups.map((d) => (
                    <li key={d.id}>
                      <strong>{d.name}</strong>
                      {d.ageYears ? `, ${d.ageYears} yrs` : ''}
                    </li>
                  ))}
                </ul>
                <Checkbox label="Haan, yeh alag shakhs hai jo yehi number istemal karta hai" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              </div>
            )}
            {m.error && !(m.error instanceof ApiError && m.error.code === 'DUPLICATE_PHONE') && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid} loading={m.isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PatientRecordView({ id, base }: { id: string; base: string }) {
  const q = useQuery({ queryKey: ['patient-records', 'one', id], queryFn: () => get<PatientRecord>(`/patient-records/${id}`) });
  if (q.isPending) return <LoadingRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { patient: p, summary: s, visits, otherProcedures, otherInvoices } = q.data;
  return (
    <div className="space-y-4">
      <Link href={base} className="inline-flex items-center gap-1 text-dense font-semibold text-brand-medium hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Patient Records
      </Link>
      <Card accent="ops">
        <SectionLabel>Patient record (view only)</SectionLabel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-title text-ink">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-1">
            <EditPatientButton patient={p} />
            {s.visits > 1 && <Chip tone="brand">Dobara aaya — {s.visits} visits</Chip>}
            {p.mergedPatients > 0 && <Chip tone="gold">{p.mergedPatients} merged record</Chip>}
          </div>
        </div>
        <p className="text-body text-muted">
          {formatPhone(p.phone)}
          {p.ageYears ? ` · ${p.ageYears} yrs` : ''}
          {p.gender ? ` · ${titleCase(p.gender)}` : ''}
        </p>
        <p className="text-[12px] text-muted">
          Register: {formatDate(p.createdAt)}
          {p.createdBy ? ` · ${p.createdBy}` : ''} · WhatsApp {p.whatsappConsent ? 'haan' : 'nahi'}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Visits" value={s.visits} hint={s.firstVisitAt ? `Pehli ${formatDate(s.firstVisitAt)}` : undefined} />
        <StatTile label="Procedures done" value={s.proceduresDone} hint={`${s.consultations} consultations`} />
        <StatTile label="Total paid" value={formatRs(s.paidPaisa)} hint={`Bill ${formatRs(s.billedPaisa)}`} />
        <StatTile label="Balance" value={formatRs(s.balancePaisa)} hint={s.cancelled ? `${s.cancelled} cancel / reschedule` : undefined} accent={s.balancePaisa > 0 ? 'danger' : 'ops'} />
      </div>

      {visits.length === 0 && otherInvoices.length === 0 && otherProcedures.length === 0 ? (
        <EmptyState title="Koi visit nahi" />
      ) : (
        <>
          {visits.map((v) => (
            <VisitCard key={v.id} v={v} />
          ))}
          {otherProcedures.length > 0 && (
            <Card>
              <CardTitle>Doosre procedures</CardTitle>
              <div className="mt-2 space-y-2">
                {otherProcedures.map((x) => (
                  <ProcedureBlock key={x.id} p={x} />
                ))}
              </div>
            </Card>
          )}
          {otherInvoices.length > 0 && (
            <Card>
              <CardTitle>Pharmacy / doosri invoices</CardTitle>
              <div className="mt-2 space-y-2">
                {otherInvoices.map((x) => (
                  <InvoiceBlock key={x.id} inv={x} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
