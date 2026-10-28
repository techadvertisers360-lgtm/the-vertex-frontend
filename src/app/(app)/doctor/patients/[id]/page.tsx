'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Lock } from 'lucide-react';
import { ApiError, get } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/time';
import { vitalsSummary, type PatientHistory } from '@/lib/doctor-types';
import { formatPhone, formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { ViewFileButton } from '@/components/ui/file-view';

const DOC_LABEL: Record<string, string> = { prescriptionPhoto: 'Prescription', consentForm: 'Consent form', beforePhoto: 'Before photo', afterPhoto: 'After photo' };

/** Date-wise history, view-only — no delete, no product cost (spec §10). */
export default function PatientHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['doctor', 'history', id], queryFn: () => get<PatientHistory>(`/doctor/patients/${id}/history`), retry: false });

  if (q.isPending) return <LoadingRows rows={5} />;
  if (q.isError) {
    const forbidden = q.error instanceof ApiError && q.error.status === 403;
    return forbidden ? (
      <EmptyState
        title="Is patient ki history ke liye Manager approval chahiye"
        hint="Doosre Doctor ke patient ki history sirf approved request ke baad khulti hai."
        action={
          <Button asChild>
            <Link href="/doctor/history-requests">
              <Lock className="size-4" /> History request bhejein
            </Link>
          </Button>
        }
      />
    ) : (
      <ErrorState error={q.error} onRetry={() => q.refetch()} />
    );
  }
  const h = q.data;
  return (
    <div className="space-y-4">
      <Link href="/doctor/patients" className="inline-flex items-center gap-1 text-dense font-semibold text-brand-medium hover:underline">
        <ArrowLeft className="size-4" /> My Patients
      </Link>
      <Card accent="ops">
        <SectionLabel>Patient history (view only)</SectionLabel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-title text-ink">{h.patient.name}</h1>
          <Chip tone={h.access === 'own' ? 'brand' : 'gold'}>{h.access === 'own' ? 'Own patient' : 'Manager-approved access'}</Chip>
        </div>
        <p className="text-body text-muted">
          {formatPhone(h.patient.phone)}
          {h.patient.ageYears ? ` · ${h.patient.ageYears} yrs` : ''}
        </p>
      </Card>
      {h.visits.length === 0 ? (
        <EmptyState title="Koi visit nahi" />
      ) : (
        h.visits.map((v) => (
          <Card key={v.id}>
            <CardHeader>
              <div>
                <CardTitle>{formatDateTime(v.startAt)}</CardTitle>
                <p className="text-dense text-muted">
                  {titleCase(v.type)} · {v.doctorName}
                </p>
              </div>
              <StatusChip status={v.status} />
            </CardHeader>
            {v.reason && <p className="text-dense text-ink">{v.reason}</p>}
            <p className="mt-1 text-dense text-muted">{vitalsSummary(v.vitals[0] ?? null)}</p>
            {v.plan && (
              <div className="mt-3 rounded-card bg-canvas p-3">
                <SectionLabel>Plan v{v.plan.versionNo}</SectionLabel>
                <p className="text-dense text-ink">{v.plan.consultationReason}</p>
                <ul className="mt-1 text-dense">
                  {v.plan.items.map((i) => (
                    <li key={i.sessionNumber} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {i.sessionNumber}. {i.procedureName} · {i.sameDay ? 'same-day' : formatDate(i.scheduledStart)}
                      </span>
                      <StatusChip status={i.status} />
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-muted">Plan total {formatRs(v.plan.grandTotalPaisa)}</p>
              </div>
            )}
            {v.documents.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {v.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-control border border-line px-2 py-1 text-dense">
                    <FileText className="size-4 text-brand-medium" /> {DOC_LABEL[d.route] ?? d.route}
                    <ViewFileButton attachmentId={d.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
