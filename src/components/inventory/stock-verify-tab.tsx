'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/time';
import { formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/** Stock entries Reception added, verified (or rejected) by the Manager (D-052). */

export interface Intake {
  id: string;
  itemId: string;
  name: string;
  kind: 'PROCEDURE' | 'PHARMACY';
  unit: string;
  quantity: number;
  pricePaisa: number;
  currentSalePricePaisa: number | null;
  expiryDate: string | null;
  lotNo: string | null;
  distributor: string | null;
  costPaisa: number | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  addedBy: string | null;
  addedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
}

export const INTAKE_STATUS: Record<Intake['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Verification pending', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

function PendingRow({ i }: { i: Intake }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['stock-intakes'] });
    void qc.invalidateQueries({ queryKey: ['reception-stock'] });
    void qc.invalidateQueries({ queryKey: ['manager', 'dashboard'] });
  };
  const verify = useMutation({
    mutationFn: () => post(`/reception/stock-intakes/${i.id}/verify`),
    onSuccess: () => {
      toast.success(`${i.name} × ${i.quantity} verify — ab stock mein`);
      done();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Verify nahi hua'),
  });
  const reject = useMutation({
    mutationFn: () => post(`/reception/stock-intakes/${i.id}/reject`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success('Reject — Reception ko wajah bata di gayi');
      done();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Reject nahi hua'),
  });
  const priceChange = i.kind === 'PHARMACY' && i.currentSalePricePaisa !== null && i.currentSalePricePaisa !== i.pricePaisa;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-ink">
          {i.name} × {i.quantity} {i.unit}
        </span>{' '}
        <Chip tone={i.kind === 'PHARMACY' ? 'gold' : 'brand'}>{i.kind === 'PHARMACY' ? 'Pharmacy' : 'Procedure'}</Chip>
        <span className="block text-[12px] text-muted">
          {formatRs(i.pricePaisa)} / unit{priceChange ? ` (pehle ${formatRs(i.currentSalePricePaisa)})` : ''}
          {i.costPaisa !== null ? ` · purchase ${formatRs(i.costPaisa)}` : ''}
          {i.lotNo ? ` · batch ${i.lotNo}` : ''}
          {i.distributor ? ` · ${i.distributor}` : ''}
          {i.expiryDate ? ` · expiry ${formatDate(i.expiryDate)}` : ''} · {i.addedBy} · {formatDateTime(i.addedAt)}
        </span>
      </span>
      {rejecting ? (
        <span className="flex items-center gap-1">
          <Input aria-label="Reject ki wajah" className="h-8 w-48" placeholder="Wajah (Reception ko jayegi)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="danger" disabled={reason.trim().length < 2} loading={reject.isPending} onClick={() => reject.mutate()}>
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <span className="flex gap-1">
          <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate()}>
            <CheckCircle2 className="size-4" /> Verify
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRejecting(true)}>
            <XCircle className="size-4" /> Reject
          </Button>
        </span>
      )}
    </li>
  );
}

export function StockVerifyTab() {
  const pending = useQuery({ queryKey: ['stock-intakes', 'pending'], queryFn: () => get<{ items: Intake[] }>('/reception/stock-intakes', { scope: 'pending' }) });
  const recent = useQuery({ queryKey: ['stock-intakes', 'recent'], queryFn: () => get<{ items: Intake[] }>('/reception/stock-intakes', { scope: 'recent' }) });
  return (
    <div className="space-y-4">
      <Card accent="ops">
        <CardHeader>
          <CardTitle>Verify karna baqi</CardTitle>
          <Chip tone={pending.data?.items.length ? 'warning' : 'success'}>{pending.data?.items.length ?? 0}</Chip>
        </CardHeader>
        <p className="mb-2 text-dense text-muted">Reception ne yeh stock add kiya hai. Verify karne tak yeh na procedure mein use hota hai na pharmacy mein bikta hai.</p>
        <QueryState query={pending} empty={(d) => d.items.length === 0} emptyTitle="Sab verify ho chuka">
          {(d) => (
            <ul className="divide-y divide-line text-dense">
              {d.items.map((i) => (
                <PendingRow key={i.id} i={i} />
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent</CardTitle>
        </CardHeader>
        <QueryState query={recent} empty={(d) => d.items.filter((i) => i.status !== 'PENDING').length === 0} emptyTitle="Abhi koi faisla nahi">
          {(d) => (
            <ul className="divide-y divide-line text-dense">
              {d.items
                .filter((i) => i.status !== 'PENDING')
                .map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold text-ink">
                        {i.name} × {i.quantity}
                      </span>{' '}
                      <Chip tone={INTAKE_STATUS[i.status].tone}>{INTAKE_STATUS[i.status].label}</Chip>
                      {i.reason && <span className="block text-[12px] text-muted">{i.reason}</span>}
                    </span>
                    <span className="text-[12px] text-muted">
                      {i.decidedBy} · {i.decidedAt ? formatDateTime(i.decidedAt) : ''}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </QueryState>
      </Card>
    </div>
  );
}
