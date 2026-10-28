'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { StockForUsage } from '@/lib/procedure-types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows, QueryState } from '@/components/ui/states';
import { UploadButton } from '@/components/ui/upload';
import { useSession } from '@/lib/session';

export interface MyDemand {
  id: string;
  demandNumber: string | null;
  status: string;
  reason: string;
  decisionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  lines: { itemId: string | null; name: string; unit: string; quantity: number; receivedQty: number }[];
}

interface Line {
  itemId: string;
  qty: string;
}

/** New stock demand: item, quantity, reason → Manager queue (spec §12–13). No prices are shown or sent. */
export function DemandForm() {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const stock = useQuery({ queryKey: ['stock', 'items'], queryFn: () => get<{ items: StockForUsage[] }>('/stock/items') });
  const [lines, setLines] = React.useState<Line[]>([{ itemId: '', qty: '' }]);
  const [reason, setReason] = React.useState('');
  const parsed = lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantity: Number(l.qty) }));
  const invalid = !parsed.length || parsed.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0) || reason.trim().length < 3;
  const m = useMutation({
    mutationFn: (body: { lines: { itemId: string; quantity: number }[]; reason: string }) => post('/stock/demands', body, keyFor(body)),
    onSuccess: () => {
      toast.success('Demand Manager ko bhej di');
      setLines([{ itemId: '', qty: '' }]);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['stock', 'demands'] });
    },
  });
  const items = stock.data?.items ?? [];

  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>Nayi stock demand</CardTitle>
      </CardHeader>
      {stock.isPending ? (
        <LoadingRows rows={2} />
      ) : stock.isError ? (
        <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) m.mutate({ lines: parsed, reason: reason.trim() });
          }}
        >
          {lines.map((l, i) => {
            const item = items.find((x) => x.id === l.itemId);
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-end gap-2">
                <Field label={i === 0 ? 'Item' : ''} htmlFor={`d-item-${i}`}>
                  <Select id={`d-item-${i}`} value={l.itemId} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                    <option value="">Item chunein</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id} disabled={lines.some((x, j) => j !== i && x.itemId === it.id)}>
                        {it.name} — abhi {it.usableQty} {it.baseUnit}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={i === 0 ? `Qty${item ? ` (${item.baseUnit})` : ''}` : ''} htmlFor={`d-qty-${i}`}>
                  <Input id={`d-qty-${i}`} inputMode="numeric" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { itemId: '', qty: '' }])}>
            <Plus className="size-4" /> Aur item
          </Button>
          <Field label="Wajah" required htmlFor="d-reason">
            <Textarea id="d-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kis kaam ke liye / kahan kam hai" />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Demand nahi gayi — dobara koshish karein.'}</Notice>}
          <Button type="submit" loading={m.isPending} disabled={invalid}>
            Send to Manager
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Office Boy demand (client 2026-10-28, D-066): item names written by hand + reason → Manager. No item list, no prices. */
export function WrittenDemandForm() {
  const qc = useQueryClient();
  const keyFor = React.useRef(idempotencyFor()).current;
  const [names, setNames] = React.useState<string[]>(['']);
  const [reason, setReason] = React.useState('');
  const lines = names.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const dup = new Set(lines.map((n) => n.toLowerCase())).size !== lines.length;
  const invalid = !lines.length || lines.some((n) => n.length < 2) || dup || reason.trim().length < 3;
  const m = useMutation({
    mutationFn: (body: { lines: { itemName: string }[]; reason: string }) => post('/stock/demands', body, keyFor(body)),
    onSuccess: () => {
      toast.success('Demand Manager ko bhej di');
      setNames(['']);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['stock', 'demands'] });
    },
  });
  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>Nayi stock demand</CardTitle>
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) m.mutate({ lines: lines.map((itemName) => ({ itemName })), reason: reason.trim() });
        }}
      >
        {names.map((n, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Field label={i === 0 ? 'Item ka naam' : ''} htmlFor={`wd-item-${i}`}>
              <Input id={`wd-item-${i}`} value={n} maxLength={120} placeholder="Jaise: Surf 2 packet, tissue roll" onChange={(e) => setNames((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
            </Field>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove item" disabled={names.length === 1} onClick={() => setNames((xs) => xs.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" disabled={names.length >= 30} onClick={() => setNames((xs) => [...xs, ''])}>
          <Plus className="size-4" /> Aur item
        </Button>
        {dup && <Notice tone="warning">Ek item ek hi dafa likhein.</Notice>}
        <Field label="Wajah" required htmlFor="wd-reason">
          <Textarea id="wd-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kis kaam ke liye / kahan khatam ho gaya" />
        </Field>
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Demand nahi gayi — dobara koshish karein.'}</Notice>}
        <Button type="submit" loading={m.isPending} disabled={invalid}>
          Send to Manager
        </Button>
      </form>
    </Card>
  );
}

export function MyDemands() {
  const q = useQuery({ queryKey: ['stock', 'demands', 'mine'], queryFn: () => get<{ items: MyDemand[] }>('/stock/demands/mine') });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meri demands</CardTitle>
      </CardHeader>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi demand nahi">
        {(d) => (
          <ul className="divide-y divide-line">
            {d.items.map((x) => (
              <li key={x.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-dense font-semibold text-ink">{x.demandNumber ?? 'Demand number approval par milega'}</span>
                  <StatusChip status={x.status} />
                </div>
                <p className="text-dense text-ink">{x.lines.map((l) => (l.itemId ? `${l.name} × ${l.quantity} ${l.unit}` : l.name)).join(', ')}</p>
                <p className="text-dense text-muted">
                  {formatDateTime(x.createdAt)} · {x.reason}
                </p>
                {x.decisionReason && <p className="text-dense text-muted">Manager: {x.decisionReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

/**
 * Damage / breakage report (spec §18): goes to the Manager; photo optional. Office Boy (D-068) writes the item's name
 * and what happened — no item list, no quantity; Assistants pick the stock item and quantity for the write-off.
 */
export function DamageForm({ written }: { written?: boolean }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const stock = useQuery({ queryKey: ['stock', 'items'], queryFn: () => get<{ items: StockForUsage[] }>('/stock/items'), enabled: !written });
  const mine = useQuery({ queryKey: ['stock', 'damage', 'mine'], queryFn: () => get<{ items: { id: string; written: boolean; itemName: string; unit: string; quantity: number; reason: string; status: string; decisionReason: string | null; createdAt: string }[] }>('/inventory/damage/mine') });
  const [itemId, setItemId] = React.useState('');
  const [itemName, setItemName] = React.useState('');
  const [qty, setQty] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [photo, setPhoto] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      post(
        '/inventory/damage',
        written
          ? { itemName: itemName.trim(), reason: reason.trim(), attachmentId: photo ?? undefined }
          : { itemId, quantity: Number(qty), reason: reason.trim(), attachmentId: photo ?? undefined },
      ),
    onSuccess: () => {
      toast.success('Damage report Manager ko bhej di');
      setItemId('');
      setItemName('');
      setQty('');
      setReason('');
      setPhoto(null);
      void qc.invalidateQueries({ queryKey: ['stock', 'damage'] });
    },
  });
  const invalid = (written ? itemName.trim().length < 2 : !itemId || !(Number(qty) > 0)) || reason.trim().length < 2;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Damage / breakage report</CardTitle>
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) m.mutate();
        }}
      >
        {written ? (
          <Field label="Item ka naam" required htmlFor="dm-n">
            <Input id="dm-n" value={itemName} maxLength={120} placeholder="Jaise: chai ka cup, mop" onChange={(e) => setItemName(e.target.value)} />
          </Field>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
            <Field label="Item" htmlFor="dm-i">
              <Select id="dm-i" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Item chunein</option>
                {stock.data?.items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qty" htmlFor="dm-q">
              <Input id="dm-q" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        )}
        <Field label="Kya hua?" required htmlFor="dm-r">
          <Textarea id="dm-r" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={written ? 'Kaise toota / kharab hua, kahan' : undefined} />
        </Field>
        <UploadButton route="damagePhoto" recordType="Pending" recordId={me.user.id} label={photo ? 'Photo uploaded ✓' : 'Photo (optional)'} accept="image/*" onUploaded={setPhoto} />
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Report nahi gayi — dobara koshish karein.'}</Notice>}
        <Button type="submit" loading={m.isPending} disabled={invalid}>
          Send to Manager
        </Button>
      </form>
      {mine.data && mine.data.items.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line text-dense">
          {mine.data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {r.written ? r.itemName : `${r.itemName} × ${r.quantity} ${r.unit}`} · {formatDateTime(r.createdAt)}
                {r.decisionReason ? <span className="text-muted"> — {r.decisionReason}</span> : null}
              </span>
              <StatusChip status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DemandsPage({ label, written }: { label: string; written?: boolean }) {
  return (
    <div className="space-y-4">
      <PageHeader label={label} title="Stock demand" />
      <div className="grid gap-4 xl:grid-cols-2">
        {written ? <WrittenDemandForm /> : <DemandForm />}
        <MyDemands />
        <DamageForm written={written} />
      </div>
    </div>
  );
}
