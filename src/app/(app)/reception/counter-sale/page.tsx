'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Printer, Search, Trash2 } from 'lucide-react';
import { ApiError, get, idempotencyFor, post } from '@/lib/api';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime, formatTime } from '@/lib/time';
import { cn, formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/**
 * Counter sale (D-061): someone comes only for pharmacy products. Reception picks products (selling price filled in,
 * can be changed), gives a discount per product (% or Rs), and takes payment — part cash, part bank transfer if
 * needed. Saving makes a closed invoice, deducts stock and records the payments, so it shows in the cash closing.
 * Amounts shown here are a preview; the server computes the real ones.
 */
interface Product {
  id: string;
  name: string;
  baseUnit: string;
  salePricePaisa: number | null;
  usable: number;
}
interface Bank {
  id: string;
  name: string;
  bankName: string;
}
interface Line {
  key: string;
  item: Product;
  qty: string;
  price: string;
  discType: 'NONE' | 'PERCENT' | 'FIXED';
  disc: string;
}
interface Receipt {
  id: string;
  number: string;
  at: string;
  buyerName: string | null;
  buyerPhone: string | null;
  soldBy: string | null;
  lines: { id: string; description: string; quantity: number; unitPricePaisa: number; discountPaisa: number; lineTotalPaisa: number }[];
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  cashPaisa: number;
  bankPaisa: number;
  payments: { receiptNo: string; method: string; amountPaisa: number; reference: string | null; bank: string | null }[];
}
interface DayList {
  date: string;
  items: { id: string; number: string; at: string; buyerName: string | null; items: number; discountPaisa: number; totalPaisa: number; cashPaisa: number; bankPaisa: number }[];
  totals: { count: number; totalPaisa: number; cashPaisa: number; bankPaisa: number; discountPaisa: number };
}

/** Same rule as the server (pharmacyAmounts): integer paisa, percent rounded to the nearest paisa. */
function amounts(l: Line) {
  const qty = Number(l.qty);
  const price = rupeesToPaisa(l.price);
  if (!Number.isInteger(qty) || qty <= 0 || price === null) return null;
  const gross = price * qty;
  let discount = 0;
  if (l.discType === 'PERCENT' && l.disc.trim()) {
    const pct = Number(l.disc);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    discount = Math.floor((gross * Math.round(pct * 100) + 5_000) / 10_000);
  } else if (l.discType === 'FIXED' && l.disc.trim()) {
    const d = rupeesToPaisa(l.disc);
    if (d === null) return null;
    discount = d;
  }
  if (discount > gross) return null;
  return { qty, price, gross, discount, net: gross - discount };
}

function ProductPicker({ products, onPick }: { products: Product[]; onPick: (p: Product) => void }) {
  const [q, setQ] = React.useState('');
  const needle = q.trim().toLowerCase();
  const shown = products.filter((p) => !needle || p.name.toLowerCase().includes(needle)).slice(0, 50);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product ka naam likhein…" aria-label="Product search" />
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-auto rounded-control border border-line">
        {shown.length === 0 && <li className="px-3 py-3 text-dense text-muted">Koi product nahi mila.</li>}
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={p.usable <= 0}
              onClick={() => onPick(p)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-dense hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{p.name}</span>
                <span className={cn('text-[12px]', p.usable > 0 ? 'text-muted' : 'text-danger')}>
                  {p.usable > 0 ? `${p.usable} ${p.baseUnit} stock mein` : 'Stock khatam'}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-ink">{p.salePricePaisa !== null ? formatRs(p.salePricePaisa) : '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReceiptCard({ r, onNew }: { r: Receipt; onNew: () => void }) {
  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader>
        <div>
          <CardTitle>Invoice {r.number}</CardTitle>
          <p className="text-dense text-muted">
            Counter sale · {formatDateTime(r.at)}
            {r.buyerName ? ` · ${r.buyerName}` : ''}
            {r.buyerPhone ? ` · ${r.buyerPhone}` : ''}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
          <Button size="sm" onClick={onNew}>
            <Plus className="size-4" aria-hidden /> Nayi sale
          </Button>
        </div>
      </CardHeader>
      <table className="w-full text-dense">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2 pr-2 font-semibold">Product</th>
            <th className="py-2 pr-2 text-right font-semibold">Qty</th>
            <th className="py-2 pr-2 text-right font-semibold">Price</th>
            <th className="py-2 pr-2 text-right font-semibold">Discount</th>
            <th className="py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-2 pr-2 text-ink">{l.description}</td>
              <td className="py-2 pr-2 text-right">{l.quantity}</td>
              <td className="py-2 pr-2 text-right">{formatRs(l.unitPricePaisa)}</td>
              <td className="py-2 pr-2 text-right">{l.discountPaisa ? `− ${formatRs(l.discountPaisa)}` : '—'}</td>
              <td className="py-2 text-right font-semibold text-ink">{formatRs(l.lineTotalPaisa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-3 max-w-xs space-y-1 text-dense">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd>{formatRs(r.subtotalPaisa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Discount</dt>
          <dd>{r.discountPaisa ? `− ${formatRs(r.discountPaisa)}` : '—'}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1 text-card-title">
          <dt>Total</dt>
          <dd className="text-ink">{formatRs(r.totalPaisa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Cash</dt>
          <dd>{formatRs(r.cashPaisa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Bank</dt>
          <dd>{formatRs(r.bankPaisa)}</dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-0.5 text-[12px] text-muted">
        {r.payments.map((p) => (
          <li key={p.receiptNo}>
            {p.receiptNo} · {p.method === 'CASH' ? 'Cash' : p.method === 'BANK_ONLINE' ? 'Bank transfer' : p.method === 'CARD' ? 'Card' : p.method} · {formatRs(p.amountPaisa)}
            {p.bank ? ` · ${p.bank}` : ''}
            {p.reference ? ` · ref ${p.reference}` : ''}
          </li>
        ))}
        {r.soldBy && <li>Sale: {r.soldBy}</li>}
      </ul>
    </Card>
  );
}

function TodaySales({ onOpen }: { onOpen: (id: string) => void }) {
  const { pollInterval } = useRealtime();
  const q = useQuery({ queryKey: ['counter-sales', 'today'], queryFn: () => get<DayList>('/reception/counter-sales'), refetchInterval: pollInterval || 60_000 });
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Aaj ki counter sales</CardTitle>
      </CardHeader>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi record nahi">
        {(d) => (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Sales" value={d.totals.count} />
              <StatTile label="Total" value={formatRs(d.totals.totalPaisa)} hint={d.totals.discountPaisa ? `discount ${formatRs(d.totals.discountPaisa)}` : undefined} />
              <StatTile label="Cash" value={formatRs(d.totals.cashPaisa)} />
              <StatTile label="Bank" value={formatRs(d.totals.bankPaisa)} />
            </div>
            <ul className="divide-y divide-line text-dense">
              {d.items.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpen(s.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-canvas">
                    <span>
                      <span className="font-semibold text-ink">{s.number}</span> <span className="text-muted">· {formatTime(s.at)}</span>
                      {s.buyerName && <span className="text-muted"> · {s.buyerName}</span>}
                      <span className="block text-[12px] text-muted">{s.items} products</span>
                    </span>
                    <span className="text-right">
                      <span className="font-semibold text-ink">{formatRs(s.totalPaisa)}</span>
                      <span className="block text-[12px] text-muted">
                        cash {formatRs(s.cashPaisa)} · bank {formatRs(s.bankPaisa)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </QueryState>
    </Card>
  );
}

export default function CounterSalePage() {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ['pharmacy-products'], queryFn: () => get<{ items: Product[] }>('/reception/pharmacy/products') });
  const banks = useQuery({ queryKey: ['bank-accounts'], queryFn: () => get<{ items: Bank[] }>('/reception/bank-accounts') });
  const [lines, setLines] = React.useState<Line[]>([]);
  const [buyer, setBuyer] = React.useState({ name: '', phone: '' });
  // Opened from the walk-in desk (D-075): the patient's name and phone come in the link.
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('name') || sp.get('phone')) setBuyer({ name: sp.get('name') ?? '', phone: sp.get('phone') ?? '' });
  }, []);
  const [pay, setPay] = React.useState({ cash: '', bank: '', bankAccountId: '', reference: '' });
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);
  const keyFor = React.useRef(idempotencyFor());

  const add = (p: Product) =>
    setLines((ls) => {
      const found = ls.find((l) => l.item.id === p.id);
      if (found) return ls.map((l) => (l === found ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      return [...ls, { key: crypto.randomUUID(), item: p, qty: '1', price: paisaToRupeesInput(p.salePricePaisa), discType: 'NONE', disc: '' }];
    });
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const priced = lines.map((l) => ({ l, a: amounts(l) }));
  const valid = lines.length > 0 && priced.every((p) => p.a && p.a.qty <= p.l.item.usable);
  const subtotal = priced.reduce((s, p) => s + (p.a?.gross ?? 0), 0);
  const discount = priced.reduce((s, p) => s + (p.a?.discount ?? 0), 0);
  const total = subtotal - discount;
  const cash = pay.cash.trim() ? rupeesToPaisa(pay.cash) : 0;
  const bank = pay.bank.trim() ? rupeesToPaisa(pay.bank) : 0;
  const paid = (cash ?? 0) + (bank ?? 0);
  const payValid = cash !== null && bank !== null && paid === total && (!bank || (pay.bankAccountId && pay.reference.trim()));

  const body = {
    buyerName: buyer.name.trim() || undefined,
    buyerPhone: buyer.phone.trim() || undefined,
    lines: priced.map(({ l, a }) => ({
      itemId: l.item.id,
      quantity: a?.qty ?? 0,
      unitPricePaisa: a?.price ?? 0,
      discount: l.discType === 'PERCENT' && l.disc.trim() ? { type: 'PERCENT' as const, percent: Number(l.disc) } : l.discType === 'FIXED' && l.disc.trim() ? { type: 'FIXED' as const, amountPaisa: rupeesToPaisa(l.disc) ?? 0 } : { type: 'NONE' as const },
    })),
    payments: [
      ...(cash ? [{ method: 'CASH' as const, amountPaisa: cash }] : []),
      ...(bank ? [{ method: 'BANK_ONLINE' as const, amountPaisa: bank, bankAccountId: pay.bankAccountId, reference: pay.reference.trim() }] : []),
    ],
  };
  const m = useMutation({
    mutationFn: () => post<Receipt>('/reception/counter-sales', body, keyFor.current(body)),
    onSuccess: (r) => {
      toast.success(`Sale save — ${r.number}`);
      setReceipt(r);
      setLines([]);
      setBuyer({ name: '', phone: '' });
      setPay({ cash: '', bank: '', bankAccountId: '', reference: '' });
      keyFor.current = idempotencyFor(); // the next sale is a new sale, even with the same products
      void qc.invalidateQueries({ queryKey: ['pharmacy-products'] });
      void qc.invalidateQueries({ queryKey: ['counter-sales'] });
    },
  });
  const open = useMutation({ mutationFn: (id: string) => get<Receipt>(`/reception/counter-sales/${id}`), onSuccess: setReceipt });

  return (
    <div className="space-y-4">
      <PageHeader label="Reception" title="Counter Sale (Pharmacy)" />
      {receipt ? (
        <ReceiptCard r={receipt} onNew={() => setReceipt(null)} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Product chunein</CardTitle>
            </CardHeader>
            <QueryState query={products} empty={(d) => d.items.length === 0} emptyTitle="Koi pharmacy product nahi" emptyHint="Stock & batches → Pharmacy mein product add karein.">
              {(d) => <ProductPicker products={d.items} onPick={add} />}
            </QueryState>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bill</CardTitle>
            </CardHeader>
            {lines.length === 0 ? (
              <p className="py-6 text-center text-dense text-muted">Bayen taraf se product chunein.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-dense">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-2 font-semibold">Product</th>
                      <th className="w-20 py-2 pr-2 font-semibold">Qty</th>
                      <th className="w-28 py-2 pr-2 font-semibold">Price (Rs)</th>
                      <th className="w-44 py-2 pr-2 font-semibold">Discount</th>
                      <th className="py-2 pr-2 text-right font-semibold">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {priced.map(({ l, a }) => {
                      const over = a && a.qty > l.item.usable;
                      return (
                        <tr key={l.key} className="border-b border-line align-top">
                          <td className="py-2 pr-2">
                            <span className="font-semibold text-ink">{l.item.name}</span>
                            <span className={cn('block text-[12px]', over ? 'text-danger' : 'text-muted')}>
                              {over ? `Sirf ${l.item.usable} ${l.item.baseUnit} stock mein` : `${l.item.usable} ${l.item.baseUnit} stock`}
                              {l.item.salePricePaisa !== null && rupeesToPaisa(l.price) !== l.item.salePricePaisa && ` · asal price ${formatRs(l.item.salePricePaisa)}`}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            <Input inputMode="numeric" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label="Quantity" />
                          </td>
                          <td className="py-2 pr-2">
                            <Input inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} aria-label="Price per unit" />
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex gap-1">
                              <Select className="w-20" value={l.discType} onChange={(e) => setLine(l.key, { discType: e.target.value as Line['discType'], disc: '' })} aria-label="Discount type">
                                <option value="NONE">—</option>
                                <option value="PERCENT">%</option>
                                <option value="FIXED">Rs</option>
                              </Select>
                              {l.discType !== 'NONE' && <Input inputMode="decimal" value={l.disc} onChange={(e) => setLine(l.key, { disc: e.target.value })} aria-label="Discount" />}
                            </div>
                            {a && a.discount > 0 && <span className="text-[12px] text-success">− {formatRs(a.discount)}</span>}
                          </td>
                          <td className="py-2 pr-2 text-right font-semibold text-ink">{a ? formatRs(a.net) : <span className="text-danger">Sahi likhein</span>}</td>
                          <td className="py-2">
                            <Button size="icon" variant="ghost" className="text-danger" aria-label={`${l.item.name} hatayein`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-dense font-semibold text-ink">Customer (optional)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Naam" htmlFor="cs-name">
                    <Input id="cs-name" value={buyer.name} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} />
                  </Field>
                  <Field label="Phone" htmlFor="cs-phone">
                    <Input id="cs-phone" inputMode="tel" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} />
                  </Field>
                </div>
                <dl className="space-y-1 rounded-control bg-canvas p-3 text-dense">
                  <div className="flex justify-between">
                    <dt className="text-muted">Subtotal</dt>
                    <dd>{formatRs(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Discount</dt>
                    <dd>{discount ? `− ${formatRs(discount)}` : '—'}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-1 text-card-title">
                    <dt>Total</dt>
                    <dd className="text-ink">{formatRs(total)}</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-3">
                <p className="text-dense font-semibold text-ink">Payment</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cash (Rs)" htmlFor="cs-cash">
                    <Input id="cs-cash" inputMode="decimal" value={pay.cash} onChange={(e) => setPay((p) => ({ ...p, cash: e.target.value }))} />
                  </Field>
                  <Field label="Bank transfer (Rs)" htmlFor="cs-bank">
                    <Input id="cs-bank" inputMode="decimal" value={pay.bank} onChange={(e) => setPay((p) => ({ ...p, bank: e.target.value }))} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={!total} onClick={() => setPay((p) => ({ ...p, cash: paisaToRupeesInput(total), bank: '' }))}>
                    Poora cash
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={!total} onClick={() => setPay((p) => ({ ...p, bank: paisaToRupeesInput(total), cash: '' }))}>
                    Poora bank
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={!total || cash === null || (cash ?? 0) >= total} onClick={() => setPay((p) => ({ ...p, bank: paisaToRupeesInput(total - (cash ?? 0)) }))}>
                    Baqi bank mein
                  </Button>
                </div>
                {!!bank && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Bank account" required htmlFor="cs-acct">
                      <Select id="cs-acct" value={pay.bankAccountId} onChange={(e) => setPay((p) => ({ ...p, bankAccountId: e.target.value }))}>
                        <option value="">— Chunein —</option>
                        {(banks.data?.items ?? []).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} · {b.bankName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Transaction reference" required htmlFor="cs-ref">
                      <Input id="cs-ref" value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} />
                    </Field>
                  </div>
                )}
                {lines.length > 0 && cash !== null && bank !== null && paid !== total && (
                  <p className={cn('text-dense', paid > total ? 'text-danger' : 'text-warning')}>{paid > total ? `Total se ${formatRs(paid - total)} zyada` : `Baqi ${formatRs(total - paid)}`}</p>
                )}
              </div>
            </div>

            {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — aap ka data mehfooz hai, dobara koshish karein.'}</Notice>}
            <div className="mt-4 flex justify-end">
              <Button disabled={!valid || !payValid} loading={m.isPending} onClick={() => m.mutate()}>
                Sale save karein · {formatRs(total)}
              </Button>
            </div>
          </Card>
        </div>
      )}
      <TodaySales onOpen={(id) => open.mutate(id)} />
    </div>
  );
}
