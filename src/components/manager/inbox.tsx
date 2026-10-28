'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { useSession } from '@/lib/session';
import type { Complaint, LeaveRequest } from '@/lib/types';
import { formatPhone, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Notice, Select, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { leaveWhen, ListAndDetail, ReplyBox, Thread } from '@/components/requests/panels';
import { ReasonDialog } from '@/components/reception/dialogs';

type Filter = 'open' | 'all';
const OPEN = ['PENDING', 'IN_REVIEW', 'RETURNED_FOR_CORRECTION', 'NEED_DETAILS', 'IN_PROGRESS'];

/** Leave / early leave addressed to the Manager (spec §14, §21): Approve / Reject / Return with reason; history kept. */
export function LeaveInbox({ initialId }: { initialId?: string | null }) {
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<Filter>('open');
  const [selected, setSelected] = React.useState<string | null>(initialId ?? null);
  const [decision, setDecision] = React.useState('APPROVED');
  const [reason, setReason] = React.useState('');
  const list = useQuery({ queryKey: ['requests', 'leave', 'inbox'], queryFn: () => get<{ items: LeaveRequest[] }>('/requests/leave', { box: 'inbox' }) });
  const detail = useQuery({ queryKey: ['requests', 'leave', selected], queryFn: () => get<LeaveRequest>(`/requests/leave/${selected}`), enabled: !!selected });
  const decide = useMutation({
    mutationFn: () => post(`/requests/leave/${selected}/decision`, { status: decision, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success(`Leave: ${titleCase(decision)} — requester ko bata diya`);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
  });
  const items = (list.data?.items ?? []).filter((r) => filter === 'all' || OPEN.includes(r.status));
  const needsReason = decision === 'REJECTED' || decision === 'RETURNED_FOR_CORRECTION';
  return (
    <div className="space-y-3">
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Open', count: (list.data?.items ?? []).filter((r) => OPEN.includes(r.status)).length },
          { value: 'all', label: 'All' },
        ]}
      />
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Koi leave request nahi" />
      ) : (
        <ListAndDetail
          items={items}
          selectedId={selected}
          onSelect={setSelected}
          renderRow={(r) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-dense font-semibold text-ink">
                  {r.requester?.displayName} · {r.kind === 'LEAVE' ? 'Leave' : 'Early leave'}
                </p>
                <StatusChip status={r.status} />
              </div>
              <p className="text-[12px] text-muted">{leaveWhen(r)}</p>
            </>
          )}
          detail={
            !selected ? (
              <EmptyState title="Request chunein" />
            ) : detail.isPending ? (
              <LoadingRows />
            ) : detail.isError ? (
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            ) : (
              <Card accent="ops">
                <CardHeader>
                  <div>
                    <SectionLabel>{detail.data.requester ? `${detail.data.requester.displayName} · ${titleCase(detail.data.requester.role)}` : ''}</SectionLabel>
                    <CardTitle>{detail.data.kind === 'LEAVE' ? 'Leave' : 'Early leave'}</CardTitle>
                    <p className="text-dense text-muted">{leaveWhen(detail.data)}</p>
                  </div>
                  <StatusChip status={detail.data.status} />
                </CardHeader>
                <p className="text-body text-ink">{detail.data.reason}</p>
                {detail.data.coveragePlan && <p className="mt-1 text-dense text-muted">Coverage: {detail.data.coveragePlan}</p>}
                <div className="mt-3">
                  <Thread messages={detail.data.thread ?? []} />
                </div>
                {['PENDING', 'IN_REVIEW'].includes(detail.data.status) && (
                  <form
                    className="mt-3 space-y-2 border-t border-line pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!needsReason || reason.trim()) decide.mutate();
                    }}
                  >
                    <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
                      <Select aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
                        <option value="APPROVED">Approve</option>
                        <option value="REJECTED">Reject</option>
                        <option value="RETURNED_FOR_CORRECTION">Return for correction</option>
                        <option value="IN_REVIEW">Mark in review</option>
                      </Select>
                      <Textarea aria-label="Reason / comment" rows={1} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={needsReason ? 'Wajah zaroori' : 'Comment (optional)'} />
                    </div>
                    {decide.error && <Notice>{decide.error instanceof ApiError ? decide.error.message : 'Save nahi hua'}</Notice>}
                    <div className="flex justify-end">
                      <Button type="submit" loading={decide.isPending} disabled={needsReason && !reason.trim()}>
                        Save decision
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            )
          }
        />
      )}
    </div>
  );
}

/** Complaints addressed to the Manager + all patient complaints (spec §14): reply, status, escalate to MD. */
export function ComplaintsInbox({ initialId }: { initialId?: string | null }) {
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<Filter>('open');
  const [selected, setSelected] = React.useState<string | null>(initialId ?? null);
  const { me } = useSession();
  const role = me.user.role;
  const [escalate, setEscalate] = React.useState<'MD' | 'HAMZA' | 'DELEGATE' | null>(null);
  const list = useQuery({ queryKey: ['requests', 'complaints', 'inbox'], queryFn: () => get<{ items: Complaint[] }>('/requests/complaints', { box: 'inbox' }) });
  const detail = useQuery({ queryKey: ['requests', 'complaints', selected], queryFn: () => get<Complaint>(`/requests/complaints/${selected}`), enabled: !!selected });
  const reply = useMutation({
    mutationFn: (v: { body: string; status?: string }) => post(`/requests/complaints/${selected}/messages`, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests', 'complaints'] });
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
  });
  const items = (list.data?.items ?? []).filter((r) => filter === 'all' || OPEN.includes(r.status));
  return (
    <div className="space-y-3">
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Open', count: (list.data?.items ?? []).filter((r) => OPEN.includes(r.status)).length },
          { value: 'all', label: 'All' },
        ]}
      />
      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Koi complaint nahi" />
      ) : (
        <ListAndDetail
          items={items}
          selectedId={selected}
          onSelect={setSelected}
          renderRow={(c) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="line-clamp-1 text-dense font-semibold text-ink">{c.subject}</p>
                <StatusChip status={c.status} />
              </div>
              <p className="text-[12px] text-muted">
                {titleCase(c.source)} · {c.patientName ?? c.raisedBy?.displayName ?? ''} · {formatDateTime(c.createdAt)}
              </p>
            </>
          )}
          detail={
            !selected ? (
              <EmptyState title="Complaint chunein" />
            ) : detail.isPending ? (
              <LoadingRows />
            ) : detail.isError ? (
              <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
            ) : (
              <Card accent={detail.data.source === 'PATIENT' ? 'danger' : 'ops'}>
                <CardHeader>
                  <div className="min-w-0">
                    <SectionLabel>
                      {titleCase(detail.data.source)} complaint{detail.data.raisedBy ? ` · ${detail.data.raisedBy.displayName}` : ''}
                    </SectionLabel>
                    <CardTitle>{detail.data.subject}</CardTitle>
                    {detail.data.patient && (
                      <p className="text-dense text-muted">
                        Patient: {detail.data.patient.name} · {formatPhone(detail.data.patient.phone)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {detail.data.escalatedToMdAt && <Chip tone="danger">Escalated to MD</Chip>}
                    <StatusChip status={detail.data.status} />
                  </div>
                </CardHeader>
                <Thread messages={detail.data.thread ?? []} />
                <div className="mt-3">
                  <ReplyBox pending={reply.isPending} statuses={['IN_REVIEW', 'RESOLVED', 'REJECTED']} onSend={(body, status) => reply.mutateAsync({ body, status })} />
                </div>
                {detail.data.canAct && !['RESOLVED', 'REJECTED'].includes(detail.data.status) && (
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {role === 'MANAGER' && !detail.data.escalatedToMdAt && (
                      <Button variant="ghost" className="text-danger" onClick={() => setEscalate('MD')}>
                        Escalate to MD
                      </Button>
                    )}
                    {role === 'MANAGER' && (
                      <Button variant="ghost" onClick={() => setEscalate('HAMZA')}>
                        Escalate to Hamza Zafar
                      </Button>
                    )}
                    {(role === 'MD' || role === 'MARKETING_DIRECTOR') && (
                      <Button variant="secondary" onClick={() => setEscalate('DELEGATE')}>
                        Delegate to Manager
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )
          }
        />
      )}
      {escalate && selected && (
        <ReasonDialog
          title={escalate === 'DELEGATE' ? 'Manager ko dein' : escalate === 'MD' ? 'MD ko escalate karein' : 'Hamza Zafar ko escalate karein'}
          label={escalate === 'DELEGATE' ? 'Manager ke liye hidayat' : 'Wajah'}
          submitLabel={escalate === 'DELEGATE' ? 'Delegate' : 'Escalate'}
          danger={escalate === 'MD'}
          onSubmit={async ({ reason }) => {
            if (escalate === 'DELEGATE') await post(`/requests/complaints/${selected}/delegate`, { note: reason });
            else await post(`/requests/complaints/${selected}/escalate`, { reason, to: escalate });
            toast.success(escalate === 'DELEGATE' ? 'Manager ko de diya — aap thread par rahenge' : 'Escalate ho gaya');
            void qc.invalidateQueries({ queryKey: ['requests', 'complaints'] });
          }}
          onClose={() => setEscalate(null)}
        />
      )}
    </div>
  );
}

