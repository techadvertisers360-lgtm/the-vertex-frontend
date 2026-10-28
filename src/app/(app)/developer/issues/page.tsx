'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/links';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import type { Role } from '@/lib/types';
import { Card, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';

/**
 * Problems staff ran into (D-045): who tried what, when, and why it did not work. Staff only see that the developer
 * has been told; the full reason is here (and arrives live as a notification).
 */
interface Issue {
  id: number;
  at: string;
  who: { id: string; displayName: string; role: Role } | null;
  onBehalfOf: { id: string; displayName: string; role: Role } | null;
  area: string;
  tried: string;
  reason: string;
  context: Record<string, unknown> | null;
}

export default function IssuesPage() {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['developer', 'issues'], queryFn: () => get<{ items: Issue[] }>('/developer/issues'), refetchInterval: pollInterval || 60_000 });
  return (
    <div>
      <PageHeader label="Developer" title="Problems" />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi masla nahi" emptyHint="Jab kisi ko koi masla aaye ga (sheet link, sync, server error) to yahan dikhe ga.">
        {(d) => (
          <div className="space-y-2">
            {d.items.map((i) => (
              <Card key={i.id} accent="danger">
                <div className="flex flex-wrap items-start justify-between gap-2 text-dense">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Chip tone="danger">{i.area}</Chip>
                      <span className="font-semibold text-ink">
                        {i.who ? `${i.who.displayName} (${ROLE_LABEL[i.who.role] ?? i.who.role})` : 'System (auto sync)'}
                        {i.onBehalfOf ? ` — as ${i.onBehalfOf.displayName}` : ''}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted">Karne ki koshish: </span>
                      {i.tried}
                    </p>
                    <p className="break-words text-danger">
                      <span className="text-muted">Kyun nahi hua: </span>
                      {i.reason}
                    </p>
                    {i.context && (
                      <p className="break-all text-muted">
                        {Object.entries(i.context)
                          .filter(([, v]) => v !== null && v !== undefined && v !== '')
                          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-muted" title={formatDateTime(i.at)}>
                    {relativeFromNow(i.at)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
