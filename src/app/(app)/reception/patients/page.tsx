'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, History, MessageSquareWarning, UserPlus } from 'lucide-react';
import { get } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/time';
import type { PatientBalance, PatientCard, ReceptionAppt } from '@/lib/types';
import { InstallmentList } from '@/components/reception/installments';
import { formatPhone, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Input } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';
import { ApptActions } from '@/components/reception/appt-actions';
import { NewPatientDialog, PatientComplaintDialog, ReceptionBookDialog } from '@/components/reception/dialogs';

interface PatientPage {
  total: number;
  items: { id: string; name: string; phone: string; visits: number; lastVisitAt: string | null }[];
  nextCursor: string | null;
}

function PatientProfile({ id }: { id: string }) {
  const [booking, setBooking] = React.useState(false);
  const [complaint, setComplaint] = React.useState(false);
  const q = useQuery({
    queryKey: ['tracker', 'patient', id],
    queryFn: () => get<PatientCard & { appointments: ReceptionAppt[]; outstandingPaisa: number; balances: PatientBalance[] }>(`/reception/patients/${id}`),
  });
  if (q.isPending) return <LoadingRows rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  return (
    <div className="space-y-4">
      <Card accent="ops">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>Patient</SectionLabel>
            <h2 className="text-title text-ink">{p.name}</h2>
            <p className="text-body text-muted">
              {formatPhone(p.phone)}
              {p.ageYears ? ` · ${p.ageYears} yrs` : ''}
              {p.gender ? ` · ${titleCase(p.gender)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone={p.whatsappConsent ? 'success' : 'neutral'}>WhatsApp {p.whatsappConsent ? 'consent' : 'no consent'}</Chip>
              <Chip tone={p.contactConsent ? 'success' : 'neutral'}>Contact {p.contactConsent ? 'consent' : 'no consent'}</Chip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/reception/patients/${p.id}`}>
                <History className="size-4" /> Open History
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => setComplaint(true)}>
              <MessageSquareWarning className="size-4" /> Complaint
            </Button>
            <Button onClick={() => setBooking(true)}>
              <CalendarPlus className="size-4" /> Book appointment
            </Button>
          </div>
        </div>
      </Card>
      {p.outstandingPaisa > 0 && (
        <Card accent="danger">
          <CardHeader>
            <CardTitle>Outstanding balance</CardTitle>
            <span className="text-card-title text-danger">{formatRs(p.outstandingPaisa)}</span>
          </CardHeader>
          {p.balances.map((b) => (
            <div key={b.id} className="mb-2">
              <p className="text-dense text-muted">
                {b.number} · total {formatRs(b.totalPaisa)} · paid {formatRs(b.paidPaisa)} · balance {formatRs(b.balancePaisa)}
              </p>
              {b.installments.length > 0 && <InstallmentList items={b.installments} title="Installment schedule" />}
            </div>
          ))}
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Visits & appointments</CardTitle>
        </CardHeader>
        {p.appointments.length === 0 ? (
          <EmptyState title="Abhi koi appointment nahi" />
        ) : (
          <DataTable
            rows={p.appointments}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'Date / time', cell: (r) => formatDateTime(r.startAt) },
              { key: 'doctor', header: 'Doctor', cell: (r) => r.doctorName },
              { key: 'type', header: 'Type', cell: (r) => `${titleCase(r.type)}${r.serviceName ? ` · ${r.serviceName}` : ''}`, hideSm: true },
              { key: 'status', header: 'Status', cell: (r) => <StatusChip status={r.status} /> },
              { key: 'actions', header: '', cell: (r) => <ApptActions appt={r} compact /> },
            ]}
          />
        )}
      </Card>
      {booking && <ReceptionBookDialog patient={p} open={booking} onOpenChange={setBooking} />}
      {complaint && <PatientComplaintDialog patient={p} onClose={() => setComplaint(false)} />}
    </div>
  );
}

function PatientsView() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const qc = useQueryClient();
  const [text, setText] = React.useState('');
  const [q, setQ] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const [creating, setCreating] = React.useState(false);
  const list = useInfiniteQuery({
    queryKey: ['patient-records', q],
    queryFn: ({ pageParam }) => get<PatientPage>('/patient-records', { q: q || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const open = (pid: string) => router.push(`/reception/patients?id=${pid}`);
  return (
    <div>
      <PageHeader
        label="Reception"
        title="Patients"
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="size-4" /> New patient
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Input aria-label="Search patients" value={text} onChange={(e) => setText(e.target.value)} placeholder="Naam ya phone" />
          {list.isPending ? (
            <LoadingRows rows={5} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="Koi patient nahi mila" action={<Button size="sm" onClick={() => setCreating(true)}>New patient</Button>} />
          ) : (
            <>
              <p className="text-dense text-muted">{list.data.pages[0]?.total ?? 0} patients</p>
              <ul className="space-y-2">
                {rows.map((p) => (
                  <li key={p.id} className={`rounded-card border border-line bg-surface p-3 shadow-card ${id === p.id ? 'bg-brand-light ring-1 ring-brand-medium' : ''}`}>
                    <button onClick={() => open(p.id)} className="w-full rounded-control text-left hover:text-brand">
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-dense text-muted">
                        {formatPhone(p.phone)} · {p.visits} visits
                        {p.lastVisitAt ? ` · Last ${formatDate(p.lastVisitAt)}` : ''}
                      </p>
                    </button>
                    <Button size="sm" variant="secondary" className="mt-2" asChild>
                      <Link href={`/reception/patients/${p.id}`} aria-label={`Open History: ${p.name}`}>
                        <History className="size-4" /> Open History
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
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
        {/* Below the two-column width the chosen patient comes first; otherwise it would open under the whole list. */}
        <div className={id ? 'order-first xl:order-none' : ''}>{id ? <PatientProfile id={id} /> : <EmptyState title="Patient chunein" hint="List se patient chunein ya naya patient register karein." />}</div>
      </div>
      <NewPatientDialog
        open={creating}
        onOpenChange={setCreating}
        initialPhone={/\d{4,}/.test(text) ? text : ''}
        onCreated={(p) => {
          void qc.invalidateQueries({ queryKey: ['patient-records'] });
          open(p.id);
        }}
        onUseExisting={open}
      />
    </div>
  );
}

export default function PatientsPage() {
  return (
    <React.Suspense>
      <PatientsView />
    </React.Suspense>
  );
}
