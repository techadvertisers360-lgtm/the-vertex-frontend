'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';

interface StockCheck {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  payload: { procedure?: string; session?: number | null; when?: string; doctorName?: string; room?: string | null } | null;
}

/** Stock checks created 2 days before every procedure session (spec §19): check items for it, then mark done. */
export function StockChecksTab() {
  const qc = useQueryClient();
  const { pollInterval } = useRealtime();
  const [scope, setScope] = React.useState<'open' | 'done'>('open');
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['manager', 'stock-checks', scope], queryFn: () => get<{ items: StockCheck[] }>('/manager/stock-checks', { scope }), refetchInterval: pollInterval || 60_000 });
  const done = useMutation({
    mutationFn: (id: string) => post(`/manager/stock-checks/${id}/complete`, { note: notes[id]?.trim() || undefined }),
    onSuccess: () => {
      toast.success('Stock check done');
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save nahi hua'),
  });
  return (
    <div className="space-y-3">
      <Segmented<'open' | 'done'>
        value={scope}
        onChange={setScope}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done / cancelled' },
        ]}
      />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle={scope === 'open' ? 'Koi stock check baqi nahi' : 'Abhi koi record nahi'} emptyHint="Har procedure session se 2 din pehle yahan stock check aata hai.">
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((t) => (
              <Card key={t.id} accent={scope === 'open' ? 'danger' : 'ops'}>
                <p className="text-body font-semibold text-ink">{t.title}</p>
                <p className="text-dense text-muted">
                  {[t.payload?.when, t.payload?.doctorName, t.payload?.room ? `Room ${t.payload.room}` : null].filter(Boolean).join(' · ')}
                  {t.dueAt && scope === 'open' ? ` · procedure ${relativeFromNow(t.dueAt)}` : ''}
                </p>
                {scope === 'open' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input aria-label="Note" className="min-w-0 flex-1" placeholder="Note (optional) — e.g. gel 3 tubes available" value={notes[t.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))} />
                    <Button size="sm" loading={done.isPending && done.variables === t.id} onClick={() => done.mutate(t.id)}>
                      <Check className="size-4" /> Stock checked
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1 text-dense">
                    {t.status === 'COMPLETED' ? <Chip tone="success">Checked</Chip> : <Chip tone="neutral">Cancelled (procedure cancel / reschedule)</Chip>}{' '}
                    {t.completedAt ? `${formatDateTime(t.completedAt)}${t.completedBy ? ` · ${t.completedBy}` : ''}` : ''}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
