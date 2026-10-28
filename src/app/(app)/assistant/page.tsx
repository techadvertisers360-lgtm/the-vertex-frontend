'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, Stethoscope } from 'lucide-react';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { formatTime, relativeFromNow } from '@/lib/time';
import { stepLabel, type MyRoom, type ProcedureTaskView } from '@/lib/procedure-types';
import { Button } from '@/components/ui/button';
import { Card, HeroBanner, SectionLabel, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { AttendanceCard } from '@/components/requests/attendance-card';
import { PlannedTodayCard } from '@/components/procedures/planned-today';

interface Today {
  attendance: { checkInAt: string; checkOutAt: string | null } | null;
  rooms: MyRoom[];
  procedures: ProcedureTaskView[];
}

/** Assistant home (spec §12): today's procedures first, then room duty; live via Socket.IO. */
export default function AssistantHome() {
  const { me } = useSession();
  const { pollInterval, connected } = useRealtime();
  const q = useQuery({ queryKey: ['queue', 'assistant', 'today'], queryFn: () => get<Today>('/assistant/today'), refetchInterval: pollInterval });
  const d = q.data;
  const roomsPending = d?.rooms.filter((r) => !r.acceptedAt || !r.openingAt).length ?? 0;

  return (
    <div className="space-y-4">
      <HeroBanner label="Assistant" title="My Tasks" subtitle={me.user.displayName} actions={<Chip tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Refresh every 30 s'}</Chip>} />
      <AttendanceCard />
      <PlannedTodayCard endpoint="/assistant/procedures/planned" title="Aaj aap ke rooms mein planned" emptyHidden hint="Patient aane par Reception aap ko assign karegi — tab steps khulenge." />
      {q.isPending ? (
        <LoadingRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile label="Procedures" value={d!.procedures.length} accent={d!.procedures.some((p) => p.currentStep === 'ACCEPT') ? 'danger' : 'ops'} />
            <Link href="/assistant/rooms">
              <StatTile label="Rooms today" value={d!.rooms.length} hint={roomsPending ? `${roomsPending} opening baqi` : 'all opened'} accent={roomsPending ? 'danger' : 'ops'} />
            </Link>
          </div>

          <section className="space-y-3">
            <SectionLabel>Assigned procedures</SectionLabel>
            {d!.procedures.length === 0 ? (
              <EmptyState title="Abhi koi procedure assign nahi" hint="Reception procedure assign karegi to yahan aur notification mein aayega." />
            ) : (
              d!.procedures.map((p) => (
                <Card key={p.id} accent={p.currentStep === 'ACCEPT' ? 'danger' : 'ops'} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stethoscope className="size-4 text-brand" />
                      <p className="text-card-title text-ink">{p.patient?.name}</p>
                      {p.status === 'BLOCKED' ? <Chip tone="danger">Emergency</Chip> : <Chip tone="info">Next: {stepLabel(p.currentStep)}</Chip>}
                    </div>
                    <p className="mt-1 text-dense text-muted">
                      {p.procedure?.procedureName} · {p.doctorName} · Room {p.roomCode}
                      {p.assignedAt && ` · assigned ${formatTime(p.assignedAt)} (${relativeFromNow(p.assignedAt)})`}
                    </p>
                  </div>
                  <Button asChild className="shrink-0">
                    <Link href={`/assistant/procedures/${p.id}`}>{p.currentStep === 'ACCEPT' ? 'Open & accept' : 'Continue'}</Link>
                  </Button>
                </Card>
              ))
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>My rooms</SectionLabel>
            {d!.rooms.length === 0 ? (
              <EmptyState title="Aaj koi room assign nahi" hint="Manager rooms assign karega." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {d!.rooms.map((r) => (
                  <Link key={r.id} href="/assistant/rooms">
                    <Card className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-card-title text-ink">
                        <DoorOpen className="size-4 text-brand" /> {r.room.code}
                      </span>
                      <Chip tone={r.closingAt ? 'success' : r.openingAt ? 'info' : r.acceptedAt ? 'warning' : 'danger'}>
                        {r.closingAt ? 'Closed' : r.openingAt ? 'Open' : r.acceptedAt ? 'Opening baqi' : 'Accept karein'}
                      </Chip>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
