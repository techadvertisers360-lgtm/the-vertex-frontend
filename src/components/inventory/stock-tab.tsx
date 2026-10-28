'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/time';
import type { ItemDetail, StockRow, Vendor } from '@/lib/inventory-types';
import { formatRs, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { ErrorState, LoadingRows, QueryState } from '@/components/ui/states';
import { DataTable, FilterBar } from '@/components/ui/table';
import { ReasonDialog } from '@/components/reception/dialogs';

function ReturnDialog({ batchId, lot, onDone, onClose }: { batchId: string; lot: string; onDone: () => void; onClose: () => void }) {
  const [qty, setQty] = React.useState('');
  const [reason, setReason] = React.useState('');
  const m = useMutation({
    mutationFn: () => post('/inventory/returns', { batchId, quantity: Number(qty), reason: reason.trim() }),
    onSuccess: () => {
      toast.success('Supplier return save — stock aur payable kam');
      onDone();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Supplier return — lot ${lot}`} description="Stock kam hoga aur vendor ka payable is batch ki unit cost ke hisaab se kam hoga.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(qty) > 0 && reason.trim().length >= 2) m.mutate();
          }}
        >
          <Field label="Quantity" required htmlFor="ret-q">
            <Input id="ret-q" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Wajah" required htmlFor="ret-r">
            <Input id="ret-r" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={!(Number(qty) > 0) || reason.trim().length < 2}>
              Return to supplier
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['inventory', 'item', id], queryFn: () => get<ItemDetail>(`/inventory/items/${id}`) });
  const [action, setAction] = React.useState<{ kind: 'quarantine' | 'release' | 'return'; batchId: string; lot: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['inventory'] });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={q.data?.item.name ?? 'Item'} description={q.data ? `${q.data.item.onHand} ${q.data.item.baseUnit} on hand · minimum ${q.data.item.minQty}` : undefined}>
        {q.isPending ? (
          <LoadingRows rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="space-y-4">
            <div>
              <SectionLabel className="mb-2">Batches (FEFO order)</SectionLabel>
              <DataTable
                rows={q.data.batches.filter((b) => b.balance !== 0)}
                rowKey={(b) => b.id}
                columns={[
                  { key: 'lot', header: 'Lot', cell: (b) => <span className="font-semibold">{b.lotNo}</span> },
                  { key: 'exp', header: 'Expiry', cell: (b) => (b.expiryDate ? formatDay(`${b.expiryDate}T12:00:00Z`) : '—') },
                  { key: 'bal', header: 'Qty', cell: (b) => b.balance },
                  {
                    key: 'st',
                    header: 'Status',
                    cell: (b) =>
                      b.expired || b.status === 'EXPIRED' ? (
                        <Chip tone="danger">Expired</Chip>
                      ) : b.status === 'QUARANTINED' ? (
                        <Chip tone="warning">Quarantined</Chip>
                      ) : b.nearExpiry ? (
                        <Chip tone="warning">Near expiry</Chip>
                      ) : (
                        <Chip tone="success">Usable</Chip>
                      ),
                  },
                  { key: 'cost', header: 'Unit cost', cell: (b) => formatRs(b.unitCostPaisa), hideSm: true },
                  { key: 'v', header: 'Vendor', cell: (b) => b.vendorName ?? '—', hideSm: true },
                  {
                    key: 'act',
                    header: '',
                    cell: (b) => (
                      <span className="flex flex-wrap gap-1">
                        {b.status === 'AVAILABLE' && !b.expired && (
                          <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'quarantine', batchId: b.id, lot: b.lotNo })}>
                            Quarantine
                          </Button>
                        )}
                        {b.status === 'QUARANTINED' && !b.expired && (
                          <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'release', batchId: b.id, lot: b.lotNo })}>
                            Release
                          </Button>
                        )}
                        {b.vendorId && b.balance > 0 && (
                          <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'return', batchId: b.id, lot: b.lotNo })}>
                            Return
                          </Button>
                        )}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
            <div>
              <SectionLabel className="mb-2">Recent ledger</SectionLabel>
              <ul className="max-h-56 divide-y divide-line overflow-auto text-dense">
                {q.data.transactions.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {titleCase(t.type)} · {formatDateTime(t.at)} · {t.actor}
                      {t.reason ? <span className="text-muted"> — {t.reason}</span> : null}
                    </span>
                    <span className={t.quantity < 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {action && action.kind !== 'return' && (
          <ReasonDialog
            title={action.kind === 'quarantine' ? `Quarantine lot ${action.lot}` : `Release lot ${action.lot}`}
            description={action.kind === 'quarantine' ? 'Quarantined stock usable nahi rehta (procedures mein nahi lagega).' : undefined}
            label="Wajah"
            submitLabel={action.kind === 'quarantine' ? 'Quarantine' : 'Release'}
            danger={action.kind === 'quarantine'}
            onSubmit={async ({ reason }) => {
              await post(`/inventory/batches/${action.batchId}/status`, { status: action.kind === 'quarantine' ? 'QUARANTINED' : 'AVAILABLE', reason });
              toast.success('Batch update ho gaya');
              refresh();
            }}
            onClose={() => setAction(null)}
          />
        )}
        {action?.kind === 'return' && <ReturnDialog batchId={action.batchId} lot={action.lot} onDone={refresh} onClose={() => setAction(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewItemDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: ['inventory', 'vendors'], queryFn: () => get<{ items: Vendor[] }>('/inventory/vendors') });
  const [v, setV] = React.useState({ name: '', category: '', baseUnit: 'piece', packUnit: '', packSize: '', minQty: '', preferredVendorId: '' });
  const m = useMutation({
    mutationFn: () => post('/inventory/items', { name: v.name, category: v.category, baseUnit: v.baseUnit, packUnit: v.packUnit || undefined, packSize: v.packSize ? Number(v.packSize) : undefined, minQty: Number(v.minQty || 0), preferredVendorId: v.preferredVendorId || undefined }),
    onSuccess: () => {
      toast.success('Item add ho gaya');
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Naya stock item">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (v.name.trim() && v.category.trim()) m.mutate();
          }}
        >
          <Field label="Naam" required htmlFor="ni-n" className="sm:col-span-2">
            <Input id="ni-n" value={v.name} onChange={set('name')} />
          </Field>
          <Field label="Category" required htmlFor="ni-c">
            <Input id="ni-c" value={v.category} onChange={set('category')} placeholder="consumable / cleaning" />
          </Field>
          <Field label="Base unit" required htmlFor="ni-u">
            <Select id="ni-u" value={v.baseUnit} onChange={set('baseUnit')}>
              {['piece', 'ml', 'bottle', 'box', 'pack', 'g'].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Pack unit (optional)" htmlFor="ni-pu">
            <Input id="ni-pu" value={v.packUnit} onChange={set('packUnit')} placeholder="box" />
          </Field>
          <Field label="Base units per pack" htmlFor="ni-ps">
            <Input id="ni-ps" inputMode="numeric" value={v.packSize} onChange={set('packSize')} />
          </Field>
          <Field label="Minimum (low-stock alert)" required htmlFor="ni-min">
            <Input id="ni-min" inputMode="numeric" value={v.minQty} onChange={set('minQty')} />
          </Field>
          <Field label="Preferred vendor" htmlFor="ni-v">
            <Select id="ni-v" value={v.preferredVendorId} onChange={set('preferredVendorId')}>
              <option value="">—</option>
              {vendors.data?.items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          {m.error && (
            <div className="sm:col-span-2">
              <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>
            </div>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending}>
              Add item
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StockTab() {
  const q = useQuery({ queryKey: ['inventory', 'stock'], queryFn: () => get<{ items: StockRow[] }>('/inventory/stock') });
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [onlyIssues, setOnlyIssues] = React.useState(false);
  return (
    <div className="space-y-3">
      <FilterBar>
        <Input aria-label="Search item" placeholder="Item search" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-64" />
        <label className="flex items-center gap-2 text-dense text-ink">
          <input type="checkbox" className="size-4 accent-brand" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Sirf low / expiry / quarantine
        </label>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> New item
        </Button>
      </FilterBar>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi stock item nahi">
        {(d) => (
          <DataTable
            rows={d.items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()) && (!onlyIssues || i.low || i.expired || i.quarantined || i.nearExpiry))}
            rowKey={(r) => r.id}
            onRowClick={(r) => setOpen(r.id)}
            columns={[
              { key: 'name', header: 'Item', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'cat', header: 'Category', cell: (r) => r.category, hideSm: true },
              { key: 'hand', header: 'On hand', cell: (r) => `${r.onHand} ${r.baseUnit}` },
              { key: 'use', header: 'Usable', cell: (r) => r.usable },
              { key: 'min', header: 'Min', cell: (r) => r.minQty, hideSm: true },
              {
                key: 'flags',
                header: 'Status',
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.low && <Chip tone="danger">Low</Chip>}
                    {r.expired > 0 && <Chip tone="danger">{r.expired} expired</Chip>}
                    {r.quarantined > 0 && <Chip tone="warning">{r.quarantined} quarantined</Chip>}
                    {r.nearExpiry > 0 && <Chip tone="warning">{r.nearExpiry} lot near expiry</Chip>}
                    {!r.low && !r.expired && !r.quarantined && !r.nearExpiry && <Chip tone="success">OK</Chip>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      {open && <ItemDialog id={open} onClose={() => setOpen(null)} />}
      {adding && <NewItemDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
