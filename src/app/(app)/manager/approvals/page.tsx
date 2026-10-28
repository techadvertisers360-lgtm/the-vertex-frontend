'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, post } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/time';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/form';
import { ErrorState, LoadingRows, EmptyState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { ReasonDialog } from '@/components/reception/dialogs';

interface Pending {
  historyAccess: { id: string; doctorName: string | null; reason: string; createdAt: string; patient: { id: string; name: string; phone: string } | null }[];
  alternateHours: { id: string; doctorName: string | null; date: string; startMinute: number | null; endMinute: number | null; reason: string | null; createdAt: string }[];
}
type Tab = 'history' | 'alternate';
const hm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

/**
 * Approvals (spec §4, §10–11, §14): another Doctor's patient history (time-limited, no data before approval) and
 * Doctor alternate hours (never bookable before approval). Rejection needs a reason.
 */
function ApprovalsView() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'history');
  const [reject, setReject] = React.useState<{ kind: 'history-access' | 'alternate-hours'; id: string } | null>(null);
  const q = useQuery({ queryKey: ['manager', 'approvals'], queryFn: () => get<Pending>('/manager/approvals') });
  const approve = useMutation({
    mutationFn: (v: { kind: 'history-access' | 'alternate-hours'; id: string }) => post(`/manager/approvals/${v.kind}/${v.id}`, { approve: true }),
    onSuccess: (_r, v) => {
      toast.success(v.kind === 'history-access' ? 'History access approve — Doctor ko time-limited access mila' : 'Alternate hours approve — ab bookable');
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Approve nahi hua'),
  });

  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Approvals" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'history', label: 'Other-Doctor history', count: q.data?.historyAccess.length },
          { value: 'alternate', label: 'Alternate hours', count: q.data?.alternateHours.length },
        ]}
      />
      {q.isPending ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : tab === 'history' ? (
        q.data.historyAccess.length === 0 ? (
          <EmptyState title="Koi history access request nahi" />
        ) : (
          <div className="space-y-3">
            <Notice tone="info">Approval ke baad Doctor ko mehdood waqt ke liye poori history dikhegi, har view audit hoga.</Notice>
            {q.data.historyAccess.map((h) => (
              <Card key={h.id} accent="ops" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-dense">
                  <p className="text-card-title text-ink">{h.doctorName}</p>
                  <p className="text-muted">
                    Patient: {h.patient?.name} · {h.patient && formatPhone(h.patient.phone)} · {formatDateTime(h.createdAt)}
                  </p>
                  <p className="text-ink">{h.reason}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button onClick={() => approve.mutate({ kind: 'history-access', id: h.id })} loading={approve.isPending && approve.variables?.id === h.id}>
                    Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setReject({ kind: 'history-access', id: h.id })}>
                    Reject
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : q.data.alternateHours.length === 0 ? (
        <EmptyState title="Koi alternate hours request nahi" />
      ) : (
        <div className="space-y-3">
          {q.data.alternateHours.map((a) => (
            <Card key={a.id} accent="ops" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-dense">
                <p className="text-card-title text-ink">{a.doctorName}</p>
                <p className="text-muted">
                  {formatDay(`${a.date}T12:00:00Z`)} · {hm(a.startMinute)}–{hm(a.endMinute)}
                </p>
                {a.reason && <p className="text-ink">{a.reason}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Chip tone="warning">Not bookable until approved</Chip>
                <Button onClick={() => approve.mutate({ kind: 'alternate-hours', id: a.id })} loading={approve.isPending && approve.variables?.id === a.id}>
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => setReject({ kind: 'alternate-hours', id: a.id })}>
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {reject && (
        <ReasonDialog
          title="Reject"
          label="Wajah (Doctor ko jayegi)"
          submitLabel="Reject"
          danger
          onSubmit={async ({ reason }) => {
            await post(`/manager/approvals/${reject.kind}/${reject.id}`, { approve: false, reason });
            toast.success('Reject — Doctor ko bata diya');
            void qc.invalidateQueries({ queryKey: ['manager'] });
          }}
          onClose={() => setReject(null)}
        />
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <React.Suspense>
      <ApprovalsView />
    </React.Suspense>
  );
}
