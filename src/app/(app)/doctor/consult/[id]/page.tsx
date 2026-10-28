'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Send, Timer } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { formatTime } from '@/lib/time';
import { vitalsSummary, type Consultation } from '@/lib/doctor-types';
import { formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { PlanEditor } from '@/components/doctor/plan-editor';

function ConsultTimer({ since }: { since: string | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <Chip tone="brand" className="text-[13px]">
      <Timer className="mr-1 size-3.5" /> {mm}:{ss}
    </Chip>
  );
}

export default function ConsultationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['queue', 'consult', id], queryFn: () => get<Consultation>(`/doctor/appointments/${id}`) });
  const send = useMutation({
    mutationFn: () => post(`/doctor/appointments/${id}/send-to-reception`),
    onSuccess: () => {
      toast.success('Patient Reception bhej diya — charges aur plan Reception ko mil gaye');
      void qc.invalidateQueries({ queryKey: ['queue'] });
      router.push('/doctor');
    },
  });

  if (q.isPending) return <LoadingRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const a = c.appointment;
  const version = c.plan?.version ?? null;
  const editable = (a.status === 'WITH_DOCTOR' || a.status === 'RECEPTION') && !c.invoiceExists;

  return (
    <div className="space-y-4">
      <Link href="/doctor" className="inline-flex items-center gap-1 text-dense font-semibold text-brand-medium hover:underline">
        <ArrowLeft className="size-4" /> My Queue
      </Link>
      <Card accent="ops">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>Consultation</SectionLabel>
            <h1 className="text-title text-ink">{c.patient.name}</h1>
            <p className="text-body text-muted">
              {c.patient.ageYears ? `${c.patient.ageYears} yrs · ` : ''}
              {c.patient.gender ? `${titleCase(c.patient.gender)} · ` : ''}appt {formatTime(a.startAt)}
              {a.roomCode ? ` · Room ${a.roomCode}` : ''}
            </p>
            <p className="mt-1 text-dense text-ink">{vitalsSummary(c.vitals[0] ?? null)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={a.status} />
            {a.status === 'WITH_DOCTOR' && <ConsultTimer since={a.acceptedAt} />}
            <Button asChild variant="secondary">
              <Link href={`/doctor/patients/${c.patient.id}`}>History</Link>
            </Button>
          </div>
        </div>
        {a.reason && <p className="mt-3 rounded-control bg-canvas px-3 py-2 text-dense">{a.reason}</p>}
      </Card>

      {c.invoiceExists && <Notice tone="info">Reception ne invoice bana di hai — plan ab locked hai.</Notice>}
      {!editable && !c.invoiceExists && a.status !== 'WITH_DOCTOR' && <Notice tone="info">Plan sirf consultation ke dauran edit hota hai.</Notice>}

      <PlanEditor key={version?.id ?? 'new'} appointmentId={a.id} doctorId={a.doctorId} existing={version} locked={!editable} />

      {a.status === 'WITH_DOCTOR' && (
        <Card>
          <CardHeader>
            <CardTitle>Send to Reception</CardTitle>
            {version && <span className="text-dense text-muted">Total {formatRs(version.grandTotalPaisa)} · advance {formatRs(version.advanceRequestedPaisa)}</span>}
          </CardHeader>
          <p className="mb-3 text-dense text-muted">Consultation close karne ke bajaye patient ko Reception bhejein — charges, same-day / future sessions aur advance Reception ko jate hain.</p>
          {send.error && <Notice>{send.error instanceof ApiError ? send.error.message : 'Bhej nahi saka'}</Notice>}
          <Button className="mt-2" onClick={() => send.mutate()} loading={send.isPending} disabled={!version}>
            <Send className="size-4" /> Send to Reception
          </Button>
          {!version && <p className="mt-2 text-[12px] text-muted">Pehle plan save karein.</p>}
        </Card>
      )}
    </div>
  );
}
