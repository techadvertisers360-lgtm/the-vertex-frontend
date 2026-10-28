'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatTime } from '@/lib/time';
import type { PlannedToday } from '@/lib/procedure-types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';

/**
 * Today's planned sessions released by the procedure-day scheduler (spec §19, §23). Reception assigns the Assistant
 * once the patient checks in; a missing room / duty Assistant is flagged (the Manager was alerted).
 */
export function PlannedTodayCard({ endpoint, title = 'Aaj ke planned sessions', hint, emptyHidden = false }: { endpoint: string; title?: string; hint?: string; emptyHidden?: boolean }) {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['tracker', 'planned-today', endpoint], queryFn: () => get<{ items: PlannedToday[] }>(endpoint), refetchInterval: pollInterval });
  if (emptyHidden && q.data && q.data.items.length === 0) return null;
  const missing = q.data?.items.filter((i) => i.assignmentMissing).length ?? 0;
  return (
    <Card accent={missing ? 'danger' : 'ops'}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {missing > 0 && <Chip tone="danger">{missing} assignment missing</Chip>}
      </CardHeader>
      {hint && <p className="mb-2 text-dense text-muted">{hint}</p>}
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi planned session nahi">
        {(d) => (
          <ul className="divide-y divide-line text-dense">
            {d.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{p.startAt ? formatTime(p.startAt) : '—'}</span> · {p.patient?.name} · {p.procedure ? `${p.procedure.procedureName} (session ${p.procedure.sessionNumber})` : 'Procedure'}
                  <span className="block text-muted">
                    {p.doctorName} · Room {p.roomCode ?? '—'} · {p.dutyAssistantName ? `Duty: ${p.dutyAssistantName}` : 'Duty Assistant nahi'}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {p.assignmentMissing && <Chip tone="danger">{p.roomCode ? 'Room par Assistant nahi' : 'Room set nahi'}</Chip>}
                  {p.appointmentStatus && <StatusChip status={p.appointmentStatus} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}
