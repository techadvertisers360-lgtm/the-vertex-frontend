'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PackageCheck, Printer } from 'lucide-react';
import { ApiError, get, idempotencyFor, post, put } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/time';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import type { Demand, Vendor } from '@/lib/inventory-types';
import { formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { UploadButton } from '@/components/ui/upload';
import { ReasonDialog } from '@/components/reception/dialogs';

type Scope = 'review' | 'md' | 'purchase' | 'all';

/** Goods receipt against an approved demand — partial / per vendor; lot, expiry and unit cost per line. */
function ReceiveDialog({ d, onClose }: { d: Demand; onClose: () => void }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const keyFor = React.useRef(idempotencyFor()).current;
  const vendors = useQuery({ queryKey: ['inventory', 'vendors'], queryFn: () => get<{ items: Vendor[] }>('/inventory/vendors') });
  const [vendorId, setVendorId] = React.useState('');
  const [invoiceNo, setInvoiceNo] = React.useState('');
  const [attachmentId, setAttachmentId] = React.useState<string | null>(null);
  const open = d.lines.filter((l) => l.remainingQty > 0 && !l.freeText);
  const [rows, setRows] = React.useState(() => open.map((l) => ({ demandLineId: l.id, qty: String(l.remainingQty), cost: paisaToRupeesInput(l.estUnitCostPaisa), lotNo: '', expiryDate: '', include: true })));
  const lines = rows.filter((r) => r.include);
  const parsed = lines.map((r) => ({ demandLineId: r.demandLineId, quantity: Number(r.qty), unitCostPaisa: rupeesToPaisa(r.cost) ?? 0, lotNo: r.lotNo.trim(), expiryDate: r.expiryDate || undefined }));
  const total = parsed.reduce((s, l) => s + (Number.isInteger(l.quantity) ? l.quantity : 0) * l.unitCostPaisa, 0);
  const invalid = !vendorId || !parsed.length || parsed.some((l) => !(l.quantity > 0) || l.unitCostPaisa <= 0 || !l.lotNo);
  const m = useMutation({
    mutationFn: (body: object) => post('/inventory/receipts', body, keyFor(body)),
    onSuccess: () => {
      toast.success(`Goods received — ${formatRs(total)} vendor payable mein`);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
  });
  const set = (i: number, k: 'qty' | 'cost' | 'lotNo' | 'expiryDate', v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={`Receive goods — ${d.demandNumber}`} description="Partial receipt allowed; har vendor ki alag receipt. Lot aur expiry har line par.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) m.mutate({ demandId: d.id, vendorId, vendorInvoiceNo: invoiceNo.trim() || undefined, attachmentId: attachmentId ?? undefined, lines: parsed });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor" required htmlFor="rc-v">
              <Select id="rc-v" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Vendor chunein</option>
                {vendors.data?.items.filter((v) => v.active).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor invoice no." htmlFor="rc-i">
              <Input id="rc-i" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const l = open[i]!;
              return (
                <div key={r.demandLineId} className="rounded-card border border-line p-3">
                  <label className="mb-2 flex items-center gap-2 text-body font-semibold text-ink">
                    <input type="checkbox" className="size-4 accent-brand" checked={r.include} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                    {l.name} <span className="font-normal text-muted">· baqi {l.remainingQty} {l.unit}</span>
                  </label>
                  {r.include && (
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Field label="Qty" htmlFor={`rq-${i}`}>
                        <Input id={`rq-${i}`} inputMode="numeric" value={r.qty} onChange={(e) => set(i, 'qty', e.target.value.replace(/\D/g, ''))} />
                      </Field>
                      <Field label="Unit cost (Rs)" htmlFor={`rcst-${i}`}>
                        <Input id={`rcst-${i}`} inputMode="decimal" value={r.cost} onChange={(e) => set(i, 'cost', e.target.value)} />
                      </Field>
                      <Field label="Lot / batch" htmlFor={`rl-${i}`}>
                        <Input id={`rl-${i}`} value={r.lotNo} onChange={(e) => set(i, 'lotNo', e.target.value)} />
                      </Field>
                      <Field label="Expiry" htmlFor={`re-${i}`}>
                        <Input id={`re-${i}`} type="date" value={r.expiryDate} onChange={(e) => set(i, 'expiryDate', e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <UploadButton route="vendorInvoice" recordType="Pending" recordId={me.user.id} label={attachmentId ? 'Invoice uploaded ✓' : 'Vendor invoice photo'} onUploaded={setAttachmentId} />
            </div>
            <p className="text-card-title text-ink">Total {formatRs(total)}</p>
          </div>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein.'}</Notice>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={invalid}>
              <PackageCheck className="size-4" /> Save receipt
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Printable demand slip (spec §14 "Unique Demand Number/Slip"). */
function SlipDialog({ d, onClose }: { d: Demand; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={`Demand slip ${d.demandNumber}`}>
        <div id="demand-slip" className="space-y-3 text-body">
          <div className="flex justify-between">
            <div>
              <p className="text-card-title text-ink">The Vertex Health — Stock demand</p>
              <p className="text-dense text-muted">
                {d.demandNumber} · {d.approvedAt ? formatDateTime(d.approvedAt) : ''}
              </p>
            </div>
            <Chip tone="success">Approved by {d.approverRole === 'MD' ? 'MD' : 'Manager'}</Chip>
          </div>
          <table className="w-full text-dense">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-1">Item</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Est. unit</th>
                <th className="py-1 text-right">Est. total</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-1">{l.name}</td>
                  <td className="py-1 text-right">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="py-1 text-right">{formatRs(l.estUnitCostPaisa)}</td>
                  <td className="py-1 text-right">{formatRs(l.lineTotalPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right text-card-title">Estimate {formatRs(d.estimatedTotalPaisa)}</p>
          <p className="text-dense text-muted">
            Requested by {d.requestedBy} ({titleCase(d.requesterRole)}) · approved by {d.approvedBy} · reason: {d.reason}
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemandCard({ d, limitPaisa }: { d: Demand; limitPaisa: number }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const inReview = ['PENDING_MANAGER', 'RETURNED_FOR_CORRECTION'].includes(d.status);
  const [prices, setPrices] = React.useState<Record<string, string>>(() => Object.fromEntries(d.lines.map((l) => [l.id, l.estUnitCostPaisa ? paisaToRupeesInput(l.estUnitCostPaisa) : ''])));
  const [dialog, setDialog] = React.useState<'receive' | 'slip' | 'reject' | 'close' | 'forward' | null>(null);
  const draftTotal = d.lines.reduce((s, l) => s + l.quantity * (rupeesToPaisa(prices[l.id] ?? '') ?? 0), 0);
  const dirty = d.lines.some((l) => (rupeesToPaisa(prices[l.id] ?? '') ?? 0) !== l.estUnitCostPaisa);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['inventory'] });
  const save = useMutation({
    mutationFn: () => put(`/inventory/demands/${d.id}/estimates`, { lines: d.lines.map((l) => ({ lineId: l.id, estUnitCostPaisa: rupeesToPaisa(prices[l.id] ?? '') ?? 0 })) }),
    onSuccess: () => {
      toast.success('Estimate save');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save nahi hua'),
  });
  const approve = useMutation({
    mutationFn: () => post<{ demandNumber: string }>(`/inventory/demands/${d.id}/decision`, { action: 'APPROVE' }),
    onSuccess: (r) => {
      toast.success(`Approved — demand number ${r.demandNumber}`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Approve nahi hua'),
  });
  const own = d.requestedById === me.user.id;
  const over = d.estimatedTotalPaisa > limitPaisa;
  const priced = d.lines.every((l) => l.estUnitCostPaisa > 0);
  return (
    <Card accent={inReview ? 'danger' : d.status === 'PENDING_MD' ? 'leadership' : 'ops'}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{d.demandNumber ?? 'Demand (number on approval)'}</CardTitle>
          <p className="text-dense text-muted">
            {d.requestedBy} ({titleCase(d.requesterRole)}) · {formatDateTime(d.createdAt)} · {d.reason}
          </p>
        </div>
        <StatusChip status={d.status} />
      </CardHeader>
      {d.decisionReason && <Notice tone={d.status === 'REJECTED' ? 'danger' : 'info'}>{d.decisionReason}</Notice>}
      <table className="mt-2 w-full text-dense">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="hidden py-1 text-right sm:table-cell">In stock</th>
            <th className="py-1 text-right">Est. unit (Rs)</th>
            <th className="py-1 text-right">Received</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-1">
                {l.name}
                {l.freeText && <span className="block text-[12px] text-muted">Likha hua item — qeemat kul likhein</span>}
              </td>
              <td className="py-1 text-right">
                {l.quantity} {l.unit}
              </td>
              <td className="hidden py-1 text-right sm:table-cell">{l.onHand ?? '—'}</td>
              <td className="py-1 text-right">
                {inReview ? <Input aria-label={`${l.name} unit cost`} inputMode="decimal" className="ml-auto h-9 w-28 text-right" value={prices[l.id] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} /> : formatRs(l.estUnitCostPaisa)}
              </td>
              <td className="py-1 text-right">{l.receivedQty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-dense">
        <span>
          Estimate <span className="text-card-title text-ink">{formatRs(inReview ? draftTotal : d.estimatedTotalPaisa)}</span> · Manager limit {formatRs(limitPaisa)}
          {d.receivedTotalPaisa > 0 && ` · received ${formatRs(d.receivedTotalPaisa)}`}
        </span>
        {(inReview ? draftTotal : d.estimatedTotalPaisa) > limitPaisa && <Chip tone="warning">MD approval required</Chip>}
        {own && inReview && <Chip tone="warning">Your own demand → MD</Chip>}
      </div>
      {d.receipts.length > 0 && (
        <ul className="mt-2 text-dense text-muted">
          {d.receipts.map((r) => (
            <li key={r.id}>
              {r.vendorName} · {r.vendorInvoiceNo ?? 'no invoice no.'} · {formatRs(r.totalPaisa)} · {formatDateTime(r.receivedAt)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {inReview && (
          <>
            <Button size="sm" variant="secondary" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              Save prices
            </Button>
            <Button size="sm" onClick={() => approve.mutate()} loading={approve.isPending} disabled={dirty || !priced || over || own}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog('forward')} disabled={dirty || !priced}>
              Send to MD
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDialog('reject')}>
              Reject
            </Button>
          </>
        )}
        {['APPROVED', 'PARTIALLY_RECEIVED'].includes(d.status) && (
          <>
            {d.lines.some((l) => !l.freeText && l.remainingQty > 0) ? (
              <Button size="sm" onClick={() => setDialog('receive')}>
                <PackageCheck className="size-4" /> Receive goods
              </Button>
            ) : (
              <span className="text-[12px] text-muted">Likhi hui cheezein stock mein nahi aati — kharid ke baad demand band karein.</span>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDialog('close')}>
              Close demand
            </Button>
          </>
        )}
        {d.demandNumber && (
          <Button size="sm" variant="secondary" onClick={() => setDialog('slip')}>
            <Printer className="size-4" /> Slip
          </Button>
        )}
      </div>
      {dialog === 'receive' && <ReceiveDialog d={d} onClose={() => setDialog(null)} />}
      {dialog === 'slip' && <SlipDialog d={d} onClose={() => setDialog(null)} />}
      {(dialog === 'reject' || dialog === 'close' || dialog === 'forward') && (
        <ReasonDialog
          title={dialog === 'reject' ? 'Demand reject' : dialog === 'close' ? 'Demand band karein' : 'MD ko bhejein'}
          description={dialog === 'close' ? 'Baqi quantity ab nahi aayegi.' : dialog === 'forward' ? 'MD approve karein ge; us se pehle purchase nahi ho sakti.' : undefined}
          label={dialog === 'forward' ? 'Note for MD' : 'Wajah'}
          submitLabel={dialog === 'reject' ? 'Reject' : dialog === 'close' ? 'Close' : 'Send to MD'}
          danger={dialog === 'reject'}
          onSubmit={async ({ reason }) => {
            if (dialog === 'close') await post(`/inventory/demands/${d.id}/close`, { reason });
            else await post(`/inventory/demands/${d.id}/decision`, { action: dialog === 'reject' ? 'REJECT' : 'FORWARD', reason });
            toast.success(dialog === 'forward' ? 'MD ko bhej diya' : 'Save');
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}

export function DemandsTab() {
  const [scope, setScope] = React.useState<Scope>('review');
  const q = useQuery({ queryKey: ['inventory', 'demands', scope], queryFn: () => get<{ items: Demand[]; limitPaisa: number }>('/inventory/demands', { scope }) });
  return (
    <div className="space-y-3">
      <Segmented<Scope>
        value={scope}
        onChange={setScope}
        options={[
          { value: 'review', label: 'Review' },
          { value: 'md', label: 'With MD' },
          { value: 'purchase', label: 'Approved — to purchase' },
          { value: 'all', label: 'All' },
        ]}
      />
      <SectionLabel>{scope === 'review' ? 'Har line ki estimated qeemat likhein. Rs 20,000 tak Manager approve; is se upar MD.' : ' '}</SectionLabel>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi demand nahi">
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((x) => (
              <DemandCard key={`${x.id}-${x.status}-${x.estimatedTotalPaisa}`} d={x} limitPaisa={d.limitPaisa} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
