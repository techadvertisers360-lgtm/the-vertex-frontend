'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { DamageRow, Demand } from '@/lib/inventory-types';
import { formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { ReasonDialog } from '@/components/reception/dialogs';
import { ViewFileButton } from '@/components/ui/file-view';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/table';
import { LeaveInbox } from '@/components/manager/inbox';
import { useSearchParams } from 'next/navigation';

/** Full decision history of a record (actor, time, action, reason) — spec §15 "attachments and history". */
function HistoryButton({ recordType, recordId }: { recordType: string; recordId: string }) {
  const [open, setOpen] = React.useState(false);
  const q = useQuery({
    queryKey: ['md', 'history', recordType, recordId],
    queryFn: () => get<{ items: { id: string; at: string; action: string; actor: string | null; actorRole: string | null; reason: string | null }[] }>('/md/history', { recordType, recordId }),
    enabled: open,
  });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        History
      </Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent title="History">
            {q.isPending ? (
              <LoadingRows rows={3} />
            ) : q.isError ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : (
              <ol className="space-y-2 text-dense">
                {q.data.items.map((h) => (
                  <li key={h.id} className="border-l-2 border-line pl-3">
                    <p className="font-semibold text-ink">{titleCase(h.action)}</p>
                    <p className="text-muted">
                      {h.actor}
                      {h.actorRole ? ` (${titleCase(h.actorRole)})` : ''} · {formatDateTime(h.at)}
                    </p>
                    {h.reason && <p className="text-ink">{h.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * MD approvals — stock (spec §4 lock 6, §15). Demands above the Manager limit (or raised by the Manager) and damage
 * write-offs reported by the Manager. Approve / Reject / Return for correction; reason required for reject/return.
 */
function StockApprovals() {
  const qc = useQueryClient();
  const demands = useQuery({ queryKey: ['inventory', 'demands', 'md'], queryFn: () => get<{ items: Demand[]; limitPaisa: number }>('/inventory/demands', { scope: 'md' }) });
  const damage = useQuery({ queryKey: ['inventory', 'damage', 'pending'], queryFn: () => get<{ items: DamageRow[] }>('/inventory/damage', { scope: 'pending' }) });
  const [dialog, setDialog] = React.useState<{ kind: 'demand-reject' | 'demand-return' | 'damage-reject'; id: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['inventory'] });
  const approveDemand = useMutation({
    mutationFn: (id: string) => post<{ demandNumber: string }>(`/inventory/demands/${id}/md-decision`, { action: 'APPROVE' }),
    onSuccess: (r) => {
      toast.success(`Approved — ${r.demandNumber}. Manager purchase kar sakta hai.`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Approve nahi hua'),
  });
  const approveDamage = useMutation({
    mutationFn: (id: string) => post(`/inventory/damage/${id}/decision`, { approve: true }),
    onSuccess: () => {
      toast.success('Write-off approve');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Approve nahi hua'),
  });
  return (
    <div className="space-y-4">
      <SectionLabel>Stock demands above the Manager limit</SectionLabel>
      {demands.isPending ? (
        <LoadingRows rows={2} />
      ) : demands.isError ? (
        <ErrorState error={demands.error} onRetry={() => demands.refetch()} />
      ) : demands.data.items.length === 0 ? (
        <EmptyState title="Koi demand MD approval par nahi" />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {demands.data.items.map((d) => (
            <Card key={d.id} accent="leadership">
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{formatRs(d.estimatedTotalPaisa)}</CardTitle>
                  <p className="text-dense text-muted">
                    {d.requestedBy} ({titleCase(d.requesterRole)}) · {formatDateTime(d.createdAt)} · {d.reason}
                  </p>
                </div>
                {d.estimatedTotalPaisa > demands.data.limitPaisa ? <Chip tone="warning">Above {formatRs(demands.data.limitPaisa)}</Chip> : <Chip>Manager&apos;s own demand</Chip>}
              </CardHeader>
              <ul className="text-dense">
                {d.lines.map((l) => (
                  <li key={l.id} className="flex justify-between border-b border-line py-1">
                    <span>
                      {l.name} × {l.quantity} {l.unit}
                    </span>
                    <span>{formatRs(l.lineTotalPaisa)}</span>
                  </li>
                ))}
              </ul>
              {d.decisionReason && <p className="mt-2 text-dense text-muted">Manager: {d.decisionReason}</p>}
              <div className="mt-2">
                <HistoryButton recordType="StockDemand" recordId={d.id} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => approveDemand.mutate(d.id)} loading={approveDemand.isPending && approveDemand.variables === d.id}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'demand-return', id: d.id })}>
                  Return for correction
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDialog({ kind: 'demand-reject', id: d.id })}>
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <SectionLabel>Damage write-offs reported by the Manager</SectionLabel>
      {damage.isPending ? (
        <LoadingRows rows={1} />
      ) : damage.isError ? (
        <ErrorState error={damage.error} onRetry={() => damage.refetch()} />
      ) : damage.data.items.length === 0 ? (
        <EmptyState title="Koi damage report nahi" />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {damage.data.items.map((r) => (
            <Card key={r.id} accent="leadership">
              <CardTitle>
                {r.itemName} × {r.quantity} {r.unit}
              </CardTitle>
              <p className="text-dense text-muted">
                {r.reportedBy} · {formatDateTime(r.createdAt)} — {r.reason}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => approveDamage.mutate(r.id)} loading={approveDamage.isPending && approveDamage.variables === r.id}>
                  Approve write-off
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'damage-reject', id: r.id })}>
                  Reject
                </Button>
                {r.attachmentId && <ViewFileButton attachmentId={r.attachmentId} label="Photo" />}
                <HistoryButton recordType="DamageReport" recordId={r.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog && (
        <ReasonDialog
          title={dialog.kind === 'demand-return' ? 'Return for correction' : 'Reject'}
          label="Wajah (Manager ko jayegi)"
          submitLabel={dialog.kind === 'demand-return' ? 'Return' : 'Reject'}
          danger={dialog.kind !== 'demand-return'}
          onSubmit={async ({ reason }) => {
            if (dialog.kind === 'damage-reject') await post(`/inventory/damage/${dialog.id}/decision`, { approve: false, reason });
            else await post(`/inventory/demands/${dialog.id}/md-decision`, { action: dialog.kind === 'demand-return' ? 'RETURN' : 'REJECT', reason });
            toast.success('Save — Manager ko bata diya');
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

type Tab = 'stock' | 'leave';

/** Approval Center (spec §15): stock above the Manager limit, damage write-offs, Manager / Hamza / Muaz leave. */
function ApprovalsView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>(params.get('tab') === 'leave' ? 'leave' : 'stock');
  return (
    <div className="space-y-4">
      <PageHeader label="MD" title="Approval center" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stock', label: 'Stock & damage' },
          { value: 'leave', label: 'Leave / early leave' },
        ]}
      />
      {tab === 'stock' ? (
        <StockApprovals />
      ) : (
        <>
          <Notice tone="info">Manager, Hamza Zafar aur Muaz Tahir ki leave. Reject / Return ke liye wajah zaroori; faisla requester ko jata hai.</Notice>
          <LeaveInbox initialId={params.get('id')} />
        </>
      )}
    </div>
  );
}

export default function MdApprovalsPage() {
  return (
    <React.Suspense>
      <ApprovalsView />
    </React.Suspense>
  );
}
