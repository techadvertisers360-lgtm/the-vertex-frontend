'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, HeartPulse } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { formatTime, relativeFromNow } from '@/lib/time';
import { vitalsSummary, type QueueItem } from '@/lib/doctor-types';
import { titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, HeroBanner, StatTile } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';

type Tab = 'waiting' | 'with' | 'sent' | 'done';
const TAB_STATUSES: Record<Tab, string[]> = {
  waiting: ['CHECKED_IN', 'WAITING'],
  with: ['WITH_DOCTOR'],
  sent: ['RECEPTION', 'PROCEDURE'],
  done: ['DONE'],
};

function QueueCard({ item }: { item: QueueItem }) {
  const router = useRouter();
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () => post(`/doctor/appointments/${item.id}/accept`),
    onSuccess: () => {
      toast.success(`${item.patient.name} accepted — consultation timer shuru`);
      void qc.invalidateQueries({ queryKey: ['queue'] });
      router.push(`/doctor/consult/${item.id}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Accept nahi hua'),
  });
  const waiting = item.status === 'CHECKED_IN' || item.status === 'WAITING';
  return (
    <Card accent={waiting ? 'ops' : 'none'} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-card-title text-ink">{item.patient.name}</p>
          {item.patient.ageYears && <span className="text-dense text-muted">{item.patient.ageYears} yrs</span>}
          <StatusChip status={item.status} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-dense text-muted">
          <span>
            <Clock className="mr-1 inline size-3.5" />
            Appt {formatTime(item.startAt)}
          </span>
          {item.checkedInAt && <span>Arrived {formatTime(item.checkedInAt)} ({relativeFromNow(item.checkedInAt)})</span>}
          <span>
            <HeartPulse className="mr-1 inline size-3.5" />
            {vitalsSummary(item.vitals)}
          </span>
          <span>
            {titleCase(item.type)}
            {item.roomCode ? ` · ${item.roomCode}` : ''}
          </span>
        </p>
        {item.reason && <p className="mt-1 text-dense text-ink">{item.reason}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {waiting && (
          <Button onClick={() => accept.mutate()} loading={accept.isPending}>
            Accept
          </Button>
        )}
        {item.status === 'WITH_DOCTOR' && (
          <Button asChild>
            <Link href={`/doctor/consult/${item.id}`}>Open consultation</Link>
          </Button>
        )}
        {(item.status === 'RECEPTION' || item.status === 'DONE' || item.status === 'PROCEDURE') && (
          <Button asChild variant="secondary">
            <Link href={`/doctor/patients/${item.patient.id}`}>History</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

/** My Queue (spec §10): own appointments only, live via Socket.IO (30 s polling when offline). */
export default function DoctorQueuePage() {
  const { me } = useSession();
  const { pollInterval, connected } = useRealtime();
  const [tab, setTab] = React.useState<Tab>('waiting');
  const q = useQuery({ queryKey: ['queue', 'today'], queryFn: () => get<{ items: QueueItem[] }>('/doctor/queue'), refetchInterval: pollInterval });
  const aftercare = useQuery({ queryKey: ['queue', 'aftercare'], queryFn: () => get<{ items: unknown[] }>('/doctor/aftercare'), refetchInterval: pollInterval });
  const items = q.data?.items ?? [];
  const count = (t: Tab) => items.filter((i) => TAB_STATUSES[t].includes(i.status)).length;
  const shown = items.filter((i) => TAB_STATUSES[tab].includes(i.status));

  return (
    <div className="space-y-4">
      <HeroBanner label="Doctor" title="My Queue" subtitle={me.user.displayName} actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Waiting" value={count('waiting')} accent={count('waiting') ? 'danger' : 'ops'} onClick={() => setTab('waiting')} active={tab === 'waiting'} />
        <StatTile label="With me" value={count('with')} onClick={() => setTab('with')} active={tab === 'with'} />
        <StatTile label="At reception" value={count('sent')} onClick={() => setTab('sent')} active={tab === 'sent'} />
        <Link href="/doctor/aftercare">
          <StatTile label="Aftercare due" value={aftercare.data?.items.length ?? '—'} hint="patient done" />
        </Link>
      </div>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'waiting', label: 'Waiting', count: count('waiting') },
          { value: 'with', label: 'With me', count: count('with') },
          { value: 'sent', label: 'At reception', count: count('sent') },
          { value: 'done', label: 'Done', count: count('done') },
        ]}
      />
      {q.isPending ? (
        <LoadingRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState title={tab === 'waiting' ? 'Abhi koi patient waiting nahi' : 'Aaj koi record nahi'} hint="Reception check-in ke baad patient yahan foran nazar aata hai." />
      ) : (
        <div className="space-y-3">
          {shown.map((i) => (
            <QueueCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </div>
  );
}
