'use client';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError, put } from '@/lib/api';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import { addDays, clinicDate } from '@/lib/time';
import type { PlanVersion } from '@/lib/doctor-types';
import type { Suggestion } from '@/lib/types';
import { formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Checkbox, Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { SlotPicker, SuggestionButtons, useServices, type SlotValue } from '@/components/booking/slot-picker';

interface ItemForm {
  key: string;
  serviceId: string;
  procedureName: string;
  sameDay: boolean;
  slot: SlotValue | null;
  price: string;
  discount: string;
}

const newItem = (): ItemForm => ({ key: crypto.randomUUID(), serviceId: '', procedureName: '', sameDay: true, slot: null, price: '', discount: '' });
const r2p = (s: string) => (s.trim() === '' ? 0 : rupeesToPaisa(s));

/**
 * Treatment plan editor (spec §10): consultation reason, 1–6 dated items (same-day or future session with a real
 * slot from the scheduling engine), fee / discounts / advance and 5–6 installments. The preview mirrors the server
 * formula for display only — the server recomputes and stores the authoritative, immutable version.
 */
export function PlanEditor({ appointmentId, doctorId, existing, locked }: { appointmentId: string; doctorId: string; existing: PlanVersion | null; locked: boolean }) {
  const qc = useQueryClient();
  const services = useServices();
  const procedures = (services.data?.items ?? []).filter((s) => s.type === 'PROCEDURE');
  const [reason, setReason] = React.useState(existing?.consultationReason ?? '');
  const [fee, setFee] = React.useState(paisaToRupeesInput(existing?.consultationFeePaisa ?? null));
  const [waived, setWaived] = React.useState(existing?.consultationFeeWaived ?? false);
  const [feeDiscount, setFeeDiscount] = React.useState(paisaToRupeesInput(existing?.consultationDiscountPaisa || null));
  const [items, setItems] = React.useState<ItemForm[]>(
    existing?.items
      .filter((i) => i.status !== 'SUPERSEDED')
      .map((i) => ({
        key: i.id,
        serviceId: i.serviceId ?? '',
        procedureName: i.procedureName,
        sameDay: i.sameDay,
        slot: i.sameDay ? null : { start: i.scheduledStart, roomId: i.roomId ?? undefined, roomCode: i.roomCode },
        price: paisaToRupeesInput(i.pricePaisa),
        discount: paisaToRupeesInput(i.discountPaisa || null),
      })) ?? [],
  );
  const [totalDiscount, setTotalDiscount] = React.useState(paisaToRupeesInput(existing?.totalDiscountPaisa || null));
  const [advance, setAdvance] = React.useState(paisaToRupeesInput(existing?.advanceRequestedPaisa || null));
  const [instCount, setInstCount] = React.useState(String(existing?.installmentCount ?? 0));
  const [firstDue, setFirstDue] = React.useState(existing?.installments[0]?.dueDate ?? addDays(clinicDate(), 30));
  const [intervalDays, setIntervalDays] = React.useState('30');
  const [itemConflict, setItemConflict] = React.useState<{ index: number; message: string; suggestions: Suggestion[] } | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);

  const setItem = (key: string, patch: Partial<ItemForm>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  // ── preview (display only) ──
  const feeP = r2p(fee) ?? 0;
  const consultNet = waived ? 0 : feeP - (r2p(feeDiscount) ?? 0);
  const itemsNet = items.reduce((s, i) => s + (r2p(i.price) ?? 0) - (r2p(i.discount) ?? 0), 0);
  const grand = consultNet + itemsNet - (r2p(totalDiscount) ?? 0);
  const balance = grand - (r2p(advance) ?? 0);
  const n = Number(instCount) || 0;
  const perInst = n > 0 && balance > 0 ? Math.floor(balance / 100 / n) * 100 : 0;

  const save = useMutation({
    mutationFn: (body: unknown) => put<{ version: PlanVersion }>(`/doctor/appointments/${appointmentId}/plan`, body),
    onSuccess: (r) => {
      toast.success(`Plan v${r.version.versionNo} save — total ${formatRs(r.version.grandTotalPaisa)}`);
      setItemConflict(null);
      void qc.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') {
        const d = e.details as { itemIndex?: number; suggestions?: Suggestion[] };
        setItemConflict({ index: d.itemIndex ?? -1, message: e.message, suggestions: d.suggestions ?? [] });
      }
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (reason.trim().length < 2) errs.push('Consultation reason likhein.');
    const money = [fee, feeDiscount, totalDiscount, advance, ...items.flatMap((i) => [i.price, i.discount])];
    if (money.some((m) => m.trim() !== '' && rupeesToPaisa(m) === null)) errs.push('Amounts sahi likhein (e.g. 2500 ya 2500.50).');
    items.forEach((it, idx) => {
      if (!it.procedureName.trim()) errs.push(`Item ${idx + 1}: procedure chunein / likhein.`);
      if (it.price.trim() === '') errs.push(`Item ${idx + 1}: price likhein.`);
      if (!it.sameDay && !it.slot) errs.push(`Item ${idx + 1}: future session ka slot chunein.`);
    });
    if (balance > 0 && n < 1) errs.push('Baqi balance ke liye installments chunein (ya advance barhayein).');
    setErrors(errs);
    if (errs.length) return;
    save.mutate({
      consultationReason: reason.trim(),
      consultationFeePaisa: feeP,
      consultationFeeWaived: waived,
      consultationDiscountPaisa: r2p(feeDiscount) ?? 0,
      items: items.map((it) => ({
        serviceId: it.serviceId || undefined,
        procedureName: it.procedureName.trim(),
        sameDay: it.sameDay,
        start: it.sameDay ? undefined : it.slot!.start,
        roomId: it.sameDay ? undefined : it.slot!.roomId,
        pricePaisa: r2p(it.price) ?? 0,
        discountPaisa: r2p(it.discount) ?? 0,
      })),
      totalDiscountPaisa: r2p(totalDiscount) ?? 0,
      advanceRequestedPaisa: r2p(advance) ?? 0,
      installmentCount: balance > 0 ? n : 0,
      firstInstallmentDate: balance > 0 && n > 0 ? firstDue : undefined,
      installmentIntervalDays: balance > 0 && n > 0 ? Number(intervalDays) || 30 : undefined,
    });
  };

  const serverError = save.error instanceof ApiError && save.error.code !== 'SLOT_UNAVAILABLE' ? save.error.message : null;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card accent="ops">
        <CardHeader>
          <CardTitle>Consultation</CardTitle>
          {existing && <span className="text-dense text-muted">Saved v{existing.versionNo}</span>}
        </CardHeader>
        <Field label="Consultation reason / findings" required htmlFor="pl-reason">
          <Textarea id="pl-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} />
        </Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Consultation fee (Rs)" htmlFor="pl-fee">
            <Input id="pl-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} disabled={locked || waived} />
          </Field>
          <Field label="Fee discount (Rs)" htmlFor="pl-fd">
            <Input id="pl-fd" inputMode="decimal" value={feeDiscount} onChange={(e) => setFeeDiscount(e.target.value)} disabled={locked || waived} />
          </Field>
          <div className="flex items-end">
            <Checkbox label="Consultation fee waive" checked={waived} onChange={(e) => setWaived(e.target.checked)} disabled={locked} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Treatment items ({items.length}/6)</CardTitle>
          <Button type="button" size="sm" variant="secondary" onClick={() => setItems((xs) => [...xs, newItem()])} disabled={locked || items.length >= 6}>
            <Plus className="size-4" /> Add item
          </Button>
        </CardHeader>
        {items.length === 0 && <p className="text-dense text-muted">Sirf consultation hai to items ki zaroorat nahi.</p>}
        <div className="space-y-4">
          {items.map((it, idx) => (
            <div key={it.key} className="rounded-card border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Session {idx + 1}</SectionLabel>
                <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} disabled={locked} aria-label={`Remove item ${idx + 1}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Procedure" htmlFor={`it-s-${it.key}`}>
                  <Select
                    id={`it-s-${it.key}`}
                    value={it.serviceId}
                    disabled={locked}
                    onChange={(e) => {
                      const svc = procedures.find((s) => s.id === e.target.value);
                      setItem(it.key, { serviceId: e.target.value, procedureName: svc?.name ?? it.procedureName, slot: null });
                    }}
                  >
                    <option value="">Other (likhein)</option>
                    {procedures.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Name" required htmlFor={`it-n-${it.key}`}>
                  <Input id={`it-n-${it.key}`} value={it.procedureName} onChange={(e) => setItem(it.key, { procedureName: e.target.value })} disabled={locked} />
                </Field>
                <Field label="Price (Rs)" required htmlFor={`it-p-${it.key}`}>
                  <Input id={`it-p-${it.key}`} inputMode="decimal" value={it.price} onChange={(e) => setItem(it.key, { price: e.target.value })} disabled={locked} />
                </Field>
                <Field label="Discount (Rs)" htmlFor={`it-d-${it.key}`}>
                  <Input id={`it-d-${it.key}`} inputMode="decimal" value={it.discount} onChange={(e) => setItem(it.key, { discount: e.target.value })} disabled={locked} />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="inline-flex min-h-control items-center gap-2 text-body">
                  <input type="radio" className="accent-brand" checked={it.sameDay} onChange={() => setItem(it.key, { sameDay: true, slot: null })} disabled={locked} /> Aaj (same-day)
                </label>
                <label className="inline-flex min-h-control items-center gap-2 text-body">
                  <input type="radio" className="accent-brand" checked={!it.sameDay} onChange={() => setItem(it.key, { sameDay: false })} disabled={locked} /> Future session
                </label>
              </div>
              {!it.sameDay && !locked && (
                <div className="mt-2 rounded-card bg-canvas p-3">
                  {itemConflict?.index === idx && (
                    <div className="mb-2 space-y-2">
                      <Notice tone="warning">{itemConflict.message}</Notice>
                      <SuggestionButtons suggestions={itemConflict.suggestions} onPick={(s) => setItem(it.key, { slot: { start: s.start, roomId: s.roomId, roomCode: s.roomCode } })} />
                    </div>
                  )}
                  <SlotPicker doctorId={doctorId} type="PROCEDURE" serviceId={it.serviceId || undefined} value={it.slot} onChange={(slot) => setItem(it.key, { slot })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Charges & installments</CardTitle>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Total discount (Rs)" htmlFor="pl-td">
            <Input id="pl-td" inputMode="decimal" value={totalDiscount} onChange={(e) => setTotalDiscount(e.target.value)} disabled={locked} />
          </Field>
          <Field label="Advance requested (Rs)" htmlFor="pl-adv">
            <Input id="pl-adv" inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} disabled={locked} />
          </Field>
          <Field label="Installments" htmlFor="pl-n" hint="Baqi balance ke liye (max 6)">
            <Select id="pl-n" value={instCount} onChange={(e) => setInstCount(e.target.value)} disabled={locked}>
              {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                <option key={k} value={k}>
                  {k === 0 ? 'None' : k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="First due date" htmlFor="pl-fdd">
            <Input id="pl-fdd" type="date" min={clinicDate()} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} disabled={locked || n === 0} />
          </Field>
          <Field label="Every (days)" htmlFor="pl-int">
            <Input id="pl-int" inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, ''))} disabled={locked || n === 0} />
          </Field>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 rounded-card bg-canvas p-3 text-dense sm:grid-cols-4">
          <div>
            <dt className="text-muted">Consultation</dt>
            <dd className="font-semibold">{formatRs(consultNet)}</dd>
          </div>
          <div>
            <dt className="text-muted">Items (net)</dt>
            <dd className="font-semibold">{formatRs(itemsNet)}</dd>
          </div>
          <div>
            <dt className="text-muted">Total</dt>
            <dd className="text-card-title">{formatRs(grand)}</dd>
          </div>
          <div>
            <dt className="text-muted">Balance after advance</dt>
            <dd className="font-semibold">
              {formatRs(balance)}
              {n > 0 && balance > 0 ? ` · ${n} × ~${formatRs(perInst)}` : ''}
            </dd>
          </div>
        </dl>
        <p className="mt-1 text-[12px] text-muted">Preview — final totals server calculate karta hai aur Reception ko immutable version jata hai.</p>
      </Card>

      {errors.length > 0 && (
        <Notice>
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
      {serverError && <Notice>{serverError}</Notice>}
      {!locked && (
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            {existing ? 'Save new plan version' : 'Save plan'}
          </Button>
        </div>
      )}
    </form>
  );
}
