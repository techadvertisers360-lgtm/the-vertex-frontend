'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, Pencil, Pill, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { ApiError, get, idempotencyFor, patch, post } from '@/lib/api';
import { paisaToRupeesInput, rupeesToPaisa } from '@/lib/money';
import { clinicDate, formatDate } from '@/lib/time';
import { cn, formatRs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ChoiceField } from '@/components/ui/choice-field';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Select } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { INTAKE_STATUS, type Intake } from '@/components/inventory/stock-verify-tab';

/**
 * Reception "Stock & batches" (D-048): two categories — products used in procedures, and pharmacy products sold at
 * billing. Add a product (or more of an existing one) with name, quantity and price. Both lists and add forms use the
 * columns of the stock CSV (D-057); the pharmacy list has one row per batch. Each product can be edited or deleted
 * (hidden, history kept — D-058).
 */
type Kind = 'PROCEDURE' | 'PHARMACY';

interface Batch {
  id: string;
  lotNo: string;
  distributor: string | null;
  costPaisa: number | null;
  quantity: number;
  expiryDate: string | null;
}

interface Row {
  id: string;
  name: string;
  unit: string;
  active: boolean;
  minQty: number;
  onHand: number;
  usable: number;
  low: boolean;
  pricePaisa: number | null;
  nextExpiry: string | null;
  expired: boolean;
  pendingQty: number;
  // stock CSV columns (D-055 / D-057)
  code: string | null;
  category: string;
  department: string | null;
  procedureUse: string | null;
  packUnit: string | null;
  packSize: number | null;
  itemType: string | null;
  sterile: boolean | null;
  note: string | null;
  salePricePaisa: number | null;
  batches: Batch[];
}

const CATS: {
  kind: Kind;
  label: string;
  hint: string;
  icon: React.ElementType;
}[] = [
  {
    kind: 'PROCEDURE',
    label: 'Procedure',
    hint: 'Procedure mein use hone wali products',
    icon: FlaskConical,
  },
  {
    kind: 'PHARMACY',
    label: 'Pharmacy',
    hint: 'Patient ko bechi jane wali products',
    icon: Pill,
  },
];

const UNITS = ['piece', 'ml', 'bottle', 'tube', 'box', 'strip', 'vial', 'pack'];

const EMPTY = {
  name: '',
  quantity: '',
  price: '',
  unit: 'piece',
  expiry: '',
  minQty: '',
  // procedure
  code: '',
  category: '',
  department: '',
  procedureUse: '',
  packUnit: '',
  packSize: '',
  itemType: '',
  sterile: '',
  note: '',
  // pharmacy
  lotNo: '',
  distributor: '',
  cost: '',
};
type FormState = typeof EMPTY;
type SetField = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;

/** Dropdown choices for the form fields, taken from the products already saved (D-059). */
type Options = Record<string, string[]>;
const OptionsContext = React.createContext<Options>({});

function useOptionLists(rows: Row[]): Options {
  return React.useMemo(() => {
    const distinct = (values: (string | null | undefined)[]) => [...new Set(values.map((v) => v?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      names: distinct(rows.map((r) => r.name)),
      units: distinct([...UNITS, ...rows.map((r) => r.unit)]),
      categories: distinct(rows.map((r) => r.category)),
      departments: distinct(rows.map((r) => r.department)),
      packUnits: distinct([...UNITS, ...rows.map((r) => r.packUnit)]),
      itemTypes: distinct(rows.map((r) => r.itemType)),
      distributors: distinct(rows.flatMap((r) => (r.batches ?? []).map((b) => b.distributor))),
    };
  }, [rows]);
}

function TextField({
  f,
  set,
  k,
  label,
  kind,
  required,
  hint,
  list,
  placeholder,
  numeric,
}: {
  f: FormState;
  set: SetField;
  k: keyof FormState;
  label: string;
  kind: Kind;
  required?: boolean;
  hint?: string;
  list?: string;
  placeholder?: string;
  numeric?: boolean;
}) {
  const options = React.useContext(OptionsContext);
  const id = `${k}-${kind}-field`;
  const setValue = (v: string) => set(k)({ target: { value: v } } as React.ChangeEvent<HTMLInputElement>);
  return (
    <Field label={label} required={required} hint={hint} htmlFor={id}>
      {list && list !== 'names' ? (
        <ChoiceField id={id} value={f[k]} onChange={setValue} options={options[list] ?? []} />
      ) : (
        <>
          {/* the product name stays free text, with the saved names as suggestions */}
          <Input id={id} list={list ? `${list}-${kind}` : undefined} inputMode={numeric ? 'decimal' : undefined} value={f[k]} onChange={set(k)} placeholder={placeholder} autoComplete="off" />
          {list && (
            <datalist id={`${list}-${kind}`}>
              {(options[list] ?? []).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          )}
        </>
      )}
    </Field>
  );
}

/** The procedure catalogue fields — same labels as the stock CSV (D-057). */
function ProcedureFields({ f, set, kind, nameHint }: { f: FormState; set: SetField; kind: Kind; nameHint?: string }) {
  const p = { f, set, kind };
  return (
    <>
      <TextField {...p} k="name" label="Product or Supply" required list="names" placeholder="e.g. Gloves" hint={nameHint} />
      <TextField {...p} k="code" label="Item ID" />
      <TextField {...p} k="category" label="Stock Category" list="categories" />
      <TextField {...p} k="department" label="Department" list="departments" />
      <TextField {...p} k="procedureUse" label="Procedure / Use" hint="Kai procedures hon to ; se alag karein" />
      <TextField {...p} k="unit" label="Inventory Unit" list="units" />
      <TextField {...p} k="packUnit" label="Purchase Unit" list="packUnits" />
      <TextField {...p} k="packSize" label="Units per Purchase Pack" numeric />
      <TextField {...p} k="itemType" label="Item Type" list="itemTypes" />
      <Field label="Sterile" htmlFor={`sterile-${kind}-field`}>
        <Select id={`sterile-${kind}-field`} value={f.sterile} onChange={set('sterile')}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Field>
      <TextField {...p} k="note" label="Stock / Selection Note" />
    </>
  );
}

const packSizeOf = (f: FormState) => (f.packSize.trim() === '' ? null : Number(f.packSize));
const packSizeOk = (f: FormState) => {
  const n = packSizeOf(f);
  return n === null || (Number.isInteger(n) && n > 0);
};

function AddForm({ kind, rows, onClose }: { kind: Kind; rows: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState(EMPTY);
  const existing = rows.some((r) => r.name.toLowerCase() === f.name.trim().toLowerCase());
  const qty = f.quantity.trim() === '' ? 0 : Number(f.quantity);
  const price = f.price.trim() === '' ? (qty === 0 && kind === 'PROCEDURE' ? 0 : null) : rupeesToPaisa(f.price);
  const cost = f.cost.trim() === '' ? undefined : rupeesToPaisa(f.cost);
  const valid = f.name.trim().length >= 2 && Number.isInteger(qty) && qty >= 0 && (kind === 'PROCEDURE' || qty > 0) && price !== null && cost !== null && packSizeOk(f);
  const keyFor = React.useRef(idempotencyFor()).current;
  const body = {
    kind,
    name: f.name.trim(),
    quantity: qty,
    pricePaisa: price ?? 0,
    unit: f.unit.trim() || undefined,
    expiryDate: f.expiry || undefined,
    ...(kind === 'PHARMACY'
      ? {
          lotNo: f.lotNo.trim() || undefined,
          distributor: f.distributor.trim() || undefined,
          costPaisa: cost ?? undefined,
        }
      : {
          details: {
            code: f.code.trim() || undefined,
            category: f.category.trim() || undefined,
            department: f.department.trim() || undefined,
            procedureUse: f.procedureUse.trim() || undefined,
            packUnit: f.packUnit.trim() || undefined,
            packSize: packSizeOf(f) ?? undefined,
            itemType: f.itemType.trim() || undefined,
            sterile: f.sterile === '' ? undefined : f.sterile === 'yes',
            note: f.note.trim() || undefined,
          },
        }),
  };
  const m = useMutation({
    mutationFn: () => post('/reception/stock', body, keyFor(body)),
    onSuccess: () => {
      toast.success(qty > 0 ? `${f.name.trim()} × ${qty} add — Manager ke verify karne ke baad stock mein aayega` : `${f.name.trim()} save ho gaya`);
      void qc.invalidateQueries({ queryKey: ['stock-intakes'] });
      void qc.invalidateQueries({ queryKey: ['reception-stock'] });
      setF(EMPTY);
    },
  });
  const set: SetField = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const p = { f, set, kind };
  const total = (v: number | null | undefined) => (v !== null && v !== undefined && qty > 0 ? formatRs(v * qty) : '—');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{kind === 'PHARMACY' ? 'Pharmacy product add karein' : 'Procedure product add karein'}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Band karein
        </Button>
      </CardHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) m.mutate();
        }}
      >
        {kind === 'PROCEDURE' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ProcedureFields {...p} nameHint={existing ? 'Pehle se hai — details update aur quantity add hogi' : undefined} />
            </div>
            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
              <TextField {...p} k="quantity" label="Quantity" numeric hint="Khaali = sirf product save (stock nahi)" />
              <TextField {...p} k="price" label="Price (Rs, per unit)" numeric required={qty > 0} />
              <Field label="Expiry" htmlFor={`expiry-${kind}-field`}>
                <Input id={`expiry-${kind}-field`} type="date" value={f.expiry} onChange={set('expiry')} />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField {...p} k="lotNo" label="Batch No" />
            <TextField {...p} k="name" label="Name" required list="names" placeholder="e.g. Sunblock SPF 50" hint={existing ? 'Pehle se hai — naya batch add hoga' : undefined} />
            <TextField {...p} k="distributor" label="Distributor" list="distributors" />
            <TextField {...p} k="unit" label="Stock Unit" list="units" />
            <TextField {...p} k="cost" label="Purchase Price" numeric hint="Rs, per unit" />
            <TextField {...p} k="price" label="Selling Price" numeric required hint="Rs, per unit — patient se" />
            <TextField {...p} k="quantity" label="Quantity" numeric required />
            <Field label="Expiration Date" htmlFor={`expiry-${kind}-field`}>
              <Input id={`expiry-${kind}-field`} type="date" value={f.expiry} onChange={set('expiry')} />
            </Field>
            <p className="text-dense text-muted sm:col-span-2 lg:col-span-4">
              Total Purchase Price: <span className="font-semibold text-ink">{total(cost)}</span> · Total Selling Price: <span className="font-semibold text-ink">{total(price)}</span>
            </p>
          </div>
        )}
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
        <div className="flex justify-end">
          <Button type="submit" disabled={!valid} loading={m.isPending}>
            <Plus className="size-4" /> {qty === 0 ? (existing ? 'Details save karein' : 'Add product') : existing ? 'Stock add karein' : 'Add product'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Edit any column of a product (D-058). Quantity is not edited here — stock only changes through entries. */
function EditDialog({ kind, row, onClose }: { kind: Kind; row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState<FormState>({
    ...EMPTY,
    name: row.name,
    unit: row.unit,
    minQty: String(row.minQty),
    price: paisaToRupeesInput(row.salePricePaisa),
    code: row.code ?? '',
    category: row.category ?? '',
    department: row.department ?? '',
    procedureUse: row.procedureUse ?? '',
    packUnit: row.packUnit ?? '',
    packSize: row.packSize ? String(row.packSize) : '',
    itemType: row.itemType ?? '',
    sterile: row.sterile === null ? '' : row.sterile ? 'yes' : 'no',
    note: row.note ?? '',
  });
  const set: SetField = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const minQty = f.minQty.trim() === '' ? 0 : Number(f.minQty);
  const price = kind === 'PHARMACY' && f.price.trim() !== '' ? rupeesToPaisa(f.price) : undefined;
  const valid = f.name.trim().length >= 2 && Number.isInteger(minQty) && minQty >= 0 && price !== null && packSizeOk(f);
  const m = useMutation({
    mutationFn: () =>
      patch(`/reception/stock/${row.id}`, {
        name: f.name.trim(),
        unit: f.unit.trim() || undefined,
        minQty,
        ...(price !== undefined ? { pricePaisa: price } : {}),
        ...(kind === 'PROCEDURE'
          ? {
              details: {
                code: f.code.trim() || null,
                category: f.category.trim() || null,
                department: f.department.trim() || null,
                procedureUse: f.procedureUse.trim() || null,
                packUnit: f.packUnit.trim() || null,
                packSize: packSizeOf(f),
                itemType: f.itemType.trim() || null,
                sterile: f.sterile === '' ? null : f.sterile === 'yes',
                note: f.note.trim() || null,
              },
            }
          : {}),
      }),
    onSuccess: () => {
      toast.success('Product update ho gaya');
      void qc.invalidateQueries({ queryKey: ['reception-stock'] });
      onClose();
    },
  });
  const p = { f, set, kind };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="Product edit karein" description={row.name}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) m.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {kind === 'PROCEDURE' ? (
              <ProcedureFields {...p} />
            ) : (
              <>
                <TextField {...p} k="name" label="Name" required />
                <TextField {...p} k="unit" label="Stock Unit" list="units" />
                <TextField {...p} k="price" label="Selling Price" numeric hint="Rs, per unit — patient se" />
              </>
            )}
            <TextField {...p} k="minQty" label="Minimum stock" numeric hint="Is se kam ho to Kam stock alert; 0 = alert nahi" />
          </div>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} loading={m.isPending}>
              Save karein
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Delete" hides the product from the lists; its stock history stays and it can be brought back (D-058). */
function RemoveDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => patch(`/reception/stock/${row.id}`, { active: false }),
    onSuccess: () => {
      toast.success(`${row.name} list se hata diya`);
      void qc.invalidateQueries({ queryKey: ['reception-stock'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Product delete karein?" description={row.name}>
        <div className="space-y-3">
          <p className="text-dense text-muted">
            Product list aur procedure / pharmacy mein nazar nahi aaye ga. Is ki stock history mehfooz rahegi — &ldquo;Deleted products&rdquo; se wapas la sakte hain.
          </p>
          {row.onHand > 0 && (
            <Notice tone="warning">
              Abhi {row.onHand} {row.unit} stock mein hai.
            </Notice>
          )}
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Delete nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type RowAction = (r: Row, what: 'edit' | 'remove' | 'restore') => void;

function Actions({ r, onAction, restoring }: { r: Row; onAction: RowAction; restoring: boolean }) {
  if (!r.active)
    return (
      <Button size="sm" variant="secondary" loading={restoring} onClick={() => onAction(r, 'restore')}>
        <RotateCcw className="size-4" aria-hidden /> Wapas layein
      </Button>
    );
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" aria-label={`${r.name} edit karein`} title="Edit" onClick={() => onAction(r, 'edit')}>
        <Pencil className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" className="text-danger hover:bg-danger-bg" aria-label={`${r.name} delete karein`} title="Delete" onClick={() => onAction(r, 'remove')}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Spreadsheet-style grid: the columns are exactly the stock CSV's, in the same order (D-057), so the screen reads like
 * the file. Header stays on top while scrolling; Edit / Delete stay pinned on the right.
 */
const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-r border-line bg-canvas px-3 py-2.5 text-left font-semibold text-ink';
const td = 'border-b border-r border-line px-3 py-2 align-top';
const pinTh = 'right-0 z-20 border-l border-r-0';
const pinTd = 'sticky right-0 border-l border-r-0 bg-inherit';
const rowCls = (n: number, active: boolean) => cn(n % 2 ? 'bg-canvas' : 'bg-surface', 'hover:bg-brand-light', !active && 'opacity-60');
const dash = <span className="text-muted">—</span>;
const val = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? dash : v);

function StockCell({ i }: { i: Row }) {
  return (
    <>
      <span className="font-semibold text-ink">{i.usable}</span>
      {i.onHand !== i.usable && <span className="block text-[12px] text-muted">kul {i.onHand}</span>}
      {i.pendingQty > 0 && <span className="block text-[12px] text-warning">+{i.pendingQty} verify pending</span>}
      {i.low && (
        <Chip tone="warning" className="mt-1">
          Kam stock
        </Chip>
      )}
    </>
  );
}

const PROCEDURE_COLS: {
  label: string;
  className?: string;
  cell: (i: Row) => React.ReactNode;
}[] = [
  {
    label: 'Item ID',
    className: 'whitespace-nowrap',
    cell: (i) => val(i.code),
  },
  {
    label: 'Stock Category',
    className: 'min-w-[140px]',
    cell: (i) => val(i.category),
  },
  {
    label: 'Department',
    className: 'min-w-[130px]',
    cell: (i) => val(i.department),
  },
  {
    label: 'Procedure / Use',
    className: 'min-w-[220px]',
    cell: (i) => val(i.procedureUse),
  },
  {
    label: 'Product or Supply',
    className: 'min-w-[200px] font-semibold text-ink',
    cell: (i) => i.name,
  },
  {
    label: 'Inventory Unit',
    className: 'whitespace-nowrap',
    cell: (i) => val(i.unit),
  },
  {
    label: 'Purchase Unit',
    className: 'whitespace-nowrap',
    cell: (i) => val(i.packUnit),
  },
  {
    label: 'Units per Purchase Pack',
    className: 'text-right',
    cell: (i) => val(i.packSize),
  },
  {
    label: 'Item Type',
    className: 'min-w-[120px]',
    cell: (i) => val(i.itemType),
  },
  {
    label: 'Sterile',
    className: 'whitespace-nowrap',
    cell: (i) => (i.sterile === null || i.sterile === undefined ? dash : i.sterile ? 'Yes' : 'No'),
  },
  {
    label: 'Stock / Selection Note',
    className: 'min-w-[220px] text-muted',
    cell: (i) => val(i.note),
  },
  {
    label: 'Stock',
    className: 'whitespace-nowrap text-right',
    cell: (i) => <StockCell i={i} />,
  },
];

function ProcedureTable({ rows, onAction, busyId }: { rows: Row[]; onAction: RowAction; busyId: string | null }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-dense">
      <thead>
        <tr>
          {PROCEDURE_COLS.map((c) => (
            <th key={c.label} className={cn(th, c.className?.includes('text-right') && 'text-right')}>
              {c.label}
            </th>
          ))}
          <th className={cn(th, pinTh)}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i, n) => (
          <tr key={i.id} className={rowCls(n, i.active)}>
            {PROCEDURE_COLS.map((c) => (
              <td key={c.label} className={cn(td, c.className)}>
                {c.cell(i)}
              </td>
            ))}
            <td className={cn(td, pinTd, 'py-1')}>
              <Actions r={i} onAction={onAction} restoring={busyId === i.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One row per batch with stock, like the pharmacy CSV; a product without stock gets one row. */
function PharmacyTable({ rows, onAction, busyId }: { rows: Row[]; onAction: RowAction; busyId: string | null }) {
  const today = clinicDate();
  const lines = rows.flatMap<{
    i: Row;
    b: Batch | null;
    first: boolean;
    n: number;
  }>((i, n) => (i.batches?.length ? i.batches.map((b, k) => ({ i, b, first: k === 0, n })) : [{ i, b: null, first: true, n }]));
  const money = (p: number | null | undefined, q: number) => (p === null || p === undefined ? dash : formatRs(p * q));
  const right = 'whitespace-nowrap text-right';
  return (
    <table className="w-full border-separate border-spacing-0 text-dense">
      <thead>
        <tr>
          {['Batch No', 'Name', 'Distributor', 'Purchase Price', 'Selling Price', 'Stock Unit', 'Quantity', 'Total Purchase Price', 'Total Selling Price', 'Expiration Date'].map((h) => (
            <th key={h} className={cn(th, /Price|Quantity/.test(h) && 'text-right')}>
              {h}
            </th>
          ))}
          <th className={cn(th, pinTh)}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map(({ i, b, first, n }) => (
          <tr key={b?.id ?? i.id} className={rowCls(n, i.active)}>
            <td className={cn(td, 'whitespace-nowrap')}>{val(b?.lotNo)}</td>
            <td className={cn(td, 'min-w-[200px]')}>
              <span className={cn('font-semibold text-ink', !first && 'font-normal text-muted')}>{i.name}</span>
              {first && i.pendingQty > 0 && <span className="block text-[12px] text-warning">+{i.pendingQty} verify pending</span>}
              {first && i.low && (
                <Chip tone="warning" className="ml-1">
                  Kam stock
                </Chip>
              )}
            </td>
            <td className={cn(td, 'min-w-[140px]')}>{val(b?.distributor)}</td>
            <td className={cn(td, right)}>{b?.costPaisa != null ? formatRs(b.costPaisa) : dash}</td>
            <td className={cn(td, right)}>{i.salePricePaisa != null ? formatRs(i.salePricePaisa) : dash}</td>
            <td className={cn(td, 'whitespace-nowrap')}>{val(i.unit)}</td>
            <td className={cn(td, right, 'font-semibold text-ink')}>{b?.quantity ?? 0}</td>
            <td className={cn(td, right)}>{b ? money(b.costPaisa, b.quantity) : dash}</td>
            <td className={cn(td, right)}>{b ? money(i.salePricePaisa, b.quantity) : dash}</td>
            <td className={cn(td, 'whitespace-nowrap', b?.expiryDate && b.expiryDate <= today && 'text-danger')}>{b?.expiryDate ? formatDate(b.expiryDate) : dash}</td>
            <td className={cn(td, pinTd, 'py-1')}>{first && <Actions r={i} onAction={onAction} restoring={busyId === i.id} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductList({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['reception-stock', kind],
    queryFn: () => get<{ items: Row[] }>(`/reception/stock?kind=${kind}`),
  });
  const [search, setSearch] = React.useState('');
  const [showRemoved, setShowRemoved] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [removing, setRemoving] = React.useState<Row | null>(null);
  const restore = useMutation({
    mutationFn: (r: Row) => patch(`/reception/stock/${r.id}`, { active: true }),
    onSuccess: (_d, r) => {
      toast.success(`${r.name} wapas list mein`);
      void qc.invalidateQueries({ queryKey: ['reception-stock'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Nahi hua — dobara koshish karein'),
  });
  const onAction: RowAction = (r, what) => (what === 'edit' ? setEditing(r) : what === 'remove' ? setRemoving(r) : restore.mutate(r));
  const items = React.useMemo(() => q.data?.items ?? [], [q.data]);
  const options = useOptionLists(items);
  const removedCount = items.filter((i) => !i.active).length;
  const needle = search.trim().toLowerCase();
  const match = (i: Row) =>
    (showRemoved ? !i.active : i.active) &&
    (!needle ||
      [i.name, i.code, i.category, i.department, i.procedureUse, i.itemType, i.note, ...(i.batches ?? []).flatMap((b) => [b.lotNo, b.distributor])].some((v) => v?.toLowerCase().includes(needle)));

  return (
    <OptionsContext.Provider value={options}>
      <div className="space-y-4">
        {adding && <AddForm kind={kind} rows={items} onClose={() => setAdding(false)} />}
        <Card className="p-0 sm:p-0">
          <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
            <CardTitle className="mr-auto">
              {showRemoved ? 'Deleted products' : kind === 'PHARMACY' ? 'Pharmacy products' : 'Procedure products'}
              <span className="ml-2 text-dense font-normal text-muted">{items.filter(match).length}</span>
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Naam, Item ID, procedure…" aria-label="Search products" />
            </div>
            {(removedCount > 0 || showRemoved) && (
              <Button variant="ghost" size="sm" onClick={() => setShowRemoved((v) => !v)}>
                {showRemoved ? 'Active products' : `Deleted products (${removedCount})`}
              </Button>
            )}
            {!adding && !showRemoved && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden /> Naya product
              </Button>
            )}
          </div>
          <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi koi product nahi" emptyHint="“Naya product” se add karein ya Developer CSV import karein.">
            {(d) => {
              const rows = d.items.filter(match);
              return rows.length ? (
                <div className="max-h-[70vh] overflow-auto border-t border-line">
                  {kind === 'PHARMACY' ? (
                    <PharmacyTable rows={rows} onAction={onAction} busyId={restore.isPending ? (restore.variables?.id ?? null) : null} />
                  ) : (
                    <ProcedureTable rows={rows} onAction={onAction} busyId={restore.isPending ? (restore.variables?.id ?? null) : null} />
                  )}
                </div>
              ) : (
                <p className="border-t border-line px-5 py-6 text-dense text-muted">{showRemoved ? 'Koi deleted product nahi.' : 'Is search se koi product nahi mila.'}</p>
              );
            }}
          </QueryState>
        </Card>
        {editing && <EditDialog kind={kind} row={editing} onClose={() => setEditing(null)} />}
        {removing && <RemoveDialog row={removing} onClose={() => setRemoving(null)} />}
        <MyEntries kind={kind} />
      </div>
    </OptionsContext.Provider>
  );
}

/** Reception's recent stock entries and the Manager's decision on each (D-052). */
function MyEntries({ kind }: { kind: Kind }) {
  const q = useQuery({
    queryKey: ['stock-intakes', 'recent'],
    queryFn: () => get<{ items: Intake[] }>('/reception/stock-intakes', { scope: 'recent' }),
  });
  const rows = q.data?.items.filter((i) => i.kind === kind).slice(0, 20) ?? [];
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meri entries (Manager verification)</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line text-dense">
        {rows.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-semibold text-ink">
                {i.name} × {i.quantity}
              </span>{' '}
              <Chip tone={INTAKE_STATUS[i.status].tone}>{INTAKE_STATUS[i.status].label}</Chip>
              {i.reason && <span className="block text-[12px] text-danger">{i.reason}</span>}
            </span>
            <span className="text-[12px] text-muted">{formatDate(i.addedAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ReceptionStockPage() {
  const [kind, setKind] = React.useState<Kind | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader label="Reception" title="Stock & batches" />
      <div className="grid gap-3 sm:grid-cols-2">
        {CATS.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => setKind(c.kind)}
            aria-pressed={kind === c.kind}
            className={cn(
              'flex items-center gap-3 rounded-card border bg-surface p-4 text-left shadow-card transition-colors',
              kind === c.kind ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand-medium',
            )}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-light text-brand">
              <c.icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-card-title font-bold text-ink">{c.label}</span>
              <span className="text-dense text-muted">{c.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {kind ? <ProductList key={kind} kind={kind} /> : <p className="text-dense text-muted">Category chunein: Procedure ya Pharmacy.</p>}
    </div>
  );
}
