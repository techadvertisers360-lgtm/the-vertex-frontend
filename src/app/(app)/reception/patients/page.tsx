'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, MessageSquareWarning, UserPlus } from 'lucide-react';
import { get } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { PatientBalance, PatientCard, ReceptionAppt, SearchPatient } from '@/lib/types';
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
  const [q, setQ] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const res = useQuery({ queryKey: ['tracker', 'search', q], queryFn: () => get<{ items: SearchPatient[] }>('/reception/search', { q }), enabled: q.trim().length >= 2 });
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
          <Input aria-label="Search patients" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam ya phone" />
          {q.trim().length >= 2 &&
            (res.isPending ? (
              <LoadingRows rows={3} />
            ) : res.isError ? (
              <ErrorState error={res.error} onRetry={() => res.refetch()} />
            ) : res.data.items.length === 0 ? (
              <EmptyState title="Koi patient nahi mila" action={<Button size="sm" onClick={() => setCreating(true)}>New patient</Button>} />
            ) : (
              <ul className="space-y-2">
                {res.data.items.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => open(p.id)} className={`w-full rounded-card border border-line bg-surface p-3 text-left shadow-card hover:bg-brand-light ${id === p.id ? 'bg-brand-light ring-1 ring-brand-medium' : ''}`}>
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-dense text-muted">
                        {formatPhone(p.phone)} · {p.previousVisits} visits
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
        <div>{id ? <PatientProfile id={id} /> : <EmptyState title="Patient chunein" hint="Search karein ya naya patient register karein." />}</div>
      </div>
      <NewPatientDialog open={creating} onOpenChange={setCreating} initialPhone={/\d{4,}/.test(q) ? q : ''} onCreated={(p) => open(p.id)} onUseExisting={open} />
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
