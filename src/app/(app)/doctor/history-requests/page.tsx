'use client';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';

interface HistoryRequest {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  expiresAt: string | null;
  active: boolean;
  patientId: string | null;
  patientName: string | null;
}

/** Other-Doctor history access (spec §4, §10): no patient data is shown until the Manager approves. */
export default function HistoryRequestsPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = React.useState('');
  const [reason, setReason] = React.useState('');
  const list = useQuery({ queryKey: ['doctor', 'history-requests'], queryFn: () => get<{ items: HistoryRequest[] }>('/doctor/history-requests') });
  const m = useMutation({
    mutationFn: () => post('/doctor/history-requests', { phone, reason }),
    onSuccess: () => {
      toast.success('Request Manager ko bhej di gayi');
      setPhone('');
      setReason('');
      void qc.invalidateQueries({ queryKey: ['doctor', 'history-requests'] });
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader label="Doctor" title="History access requests" />
      <Card accent="ops">
        <CardHeader>
          <CardTitle>Doosre Doctor ke patient ki history</CardTitle>
        </CardHeader>
        <form
          className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (phone.trim().length >= 10 && reason.trim().length >= 5) m.mutate();
          }}
        >
          <Field label="Patient phone" required htmlFor="hr-phone">
            <Input id="hr-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" />
          </Field>
          <Field label="Reason" required htmlFor="hr-reason">
            <Textarea id="hr-reason" rows={1} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Referral / second opinion" />
          </Field>
          <Button type="submit" loading={m.isPending} disabled={phone.trim().length < 10 || reason.trim().length < 5}>
            Request access
          </Button>
        </form>
        {m.error && (
          <div className="mt-3">
            <Notice>{m.error instanceof ApiError ? m.error.message : 'Request nahi gayi'}</Notice>
          </div>
        )}
        <p className="mt-2 text-[12px] text-muted">Manager approval ke baad hi naam aur history dikhegi; access limited waqt ke liye hota hai.</p>
      </Card>
      <QueryState query={list} empty={(d) => d.items.length === 0} emptyTitle="Koi request nahi">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'Requested', cell: (r) => formatDateTime(r.createdAt) },
              { key: 'patient', header: 'Patient', cell: (r) => r.patientName ?? <span className="text-muted">Approval pending</span> },
              { key: 'reason', header: 'Reason', cell: (r) => r.reason, hideSm: true },
              { key: 'status', header: 'Status', cell: (r) => (r.status === 'APPROVED' && !r.active ? <Chip>Expired</Chip> : <StatusChip status={r.status} />) },
              {
                key: 'open',
                header: '',
                cell: (r) =>
                  r.active && r.patientId ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/doctor/patients/${r.patientId}`}>Open history</Link>
                    </Button>
                  ) : r.decisionReason ? (
                    <span className="text-dense text-muted">{r.decisionReason}</span>
                  ) : null,
              },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
