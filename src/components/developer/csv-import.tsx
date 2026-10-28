'use client';
import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileUp } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, PageHeader, StatTile } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/form';
import { DataTable, Segmented } from '@/components/ui/table';

/**
 * Developer CSV import (D-055, D-060): procedure products, pharmacy products, or the procedure / service list. "Check
 * karein" shows what would change without saving; "Import karein" saves it. Uploading the same file again adds
 * nothing twice.
 */
export type ImportKind = 'PROCEDURE' | 'PHARMACY' | 'SERVICE';
type Kind = ImportKind;
type Action = 'NEW' | 'UPDATE' | 'SAME' | 'EXISTS';
interface Issue {
  row: number;
  message: string;
}
interface Result {
  kind: Kind;
  dryRun: boolean;
  dataRows: number;
  products: { new: number; updated: number; same: number };
  batches: { new: number; existing: number };
  vendorsNew: number;
  quantityIn: number;
  errors: Issue[];
  warnings: Issue[];
  preview: { row: number; name: string; detail: string; action: Action }[];
}

const COLUMNS: Record<Kind, string[]> = {
  PROCEDURE: ['Item ID', 'Stock Category', 'Department', 'Procedure / Use', 'Product or Supply', 'Inventory Unit', 'Purchase Unit', 'Units per Purchase Pack', 'Item Type', 'Sterile', 'Stock / Selection Note'],
  PHARMACY: ['Batch No', 'Name', 'Distributor', 'Purchase Price', 'Selling Price', 'Stock Unit', 'Quantity', 'Total Purchase Price', 'Total Selling Price', 'Expiration Date'],
  SERVICE: ['Category', 'Procedure / Service', 'Source', 'Note'],
};
const REQUIRED: Record<Kind, string[]> = { PROCEDURE: ['Product or Supply'], PHARMACY: ['Name', 'Quantity'], SERVICE: ['Procedure / Service'] };
const LABEL: Record<Kind, string> = { PROCEDURE: 'Procedure products', PHARMACY: 'Pharmacy products', SERVICE: 'Procedures / Services' };
const HELP: Record<Kind, string> = {
  PROCEDURE: 'Ek hi product kai procedures mein ho to ek product banta hai — "Procedure / Use" mein sab likhe jaate hain. Quantity is file mein nahi hoti.',
  PHARMACY: 'Har row ek batch hai: quantity seedha stock mein aati hai, Distributor vendor ban jata hai, Selling Price pharmacy ki price hai. Date: 2027-05-31 ya 31/05/2027.',
  SERVICE: 'Har row ek procedure / service hai. Yeh Reception ki "Procedures & Services" list mein aur booking / treatment plan mein chunne ke liye aa jati hai.',
};
const DONE: Record<Kind, string> = {
  PROCEDURE: 'Procedure products Reception aur Manager ke stock mein nazar aayein ge.',
  PHARMACY: 'Pharmacy products Reception aur Manager ke stock mein nazar aayein ge.',
  SERVICE: 'Procedures / services Reception ki list mein nazar aayein gi.',
};
const ACTION: Record<Action, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  NEW: { label: 'Naya', tone: 'success' },
  UPDATE: { label: 'Update', tone: 'info' },
  SAME: { label: 'Same', tone: 'neutral' },
  EXISTS: { label: 'Pehle se', tone: 'neutral' },
};
const MAX_BYTES = 900_000;

function downloadTemplate(kind: Kind) {
  const blob = new Blob([`${COLUMNS[kind].map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')}\n`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = { PROCEDURE: 'procedure-products.csv', PHARMACY: 'pharmacy-products.csv', SERVICE: 'procedures-services.csv' }[kind];
  a.click();
  URL.revokeObjectURL(a.href);
}

export function CsvImport({ title, kinds }: { title: string; kinds: Kind[] }) {
  const [kind, setKind] = React.useState<Kind>(kinds[0]!);
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const m = useMutation({
    mutationFn: (dryRun: boolean) => post<Result>('/developer/stock-import', { kind, csv: file!.text, fileName: file!.name, dryRun }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      if (!r.dryRun) toast.success('Import ho gaya');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Kuch ghalat ho gaya — dobara koshish karein.'),
  });

  const reset = (k: Kind = kind) => {
    setKind(k);
    setFile(null);
    setResult(null);
    setError(null);
    if (input.current) input.current.value = '';
  };

  const pick = async (f: File | undefined) => {
    setResult(null);
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) {
      setFile(null);
      return setError('File bohat bari hai (900 KB tak). Do hisson mein upload karein.');
    }
    if (!/\.csv$/i.test(f.name)) {
      setFile(null);
      return setError('Sirf .csv file — Excel mein "Save As → CSV (Comma delimited)" karein.');
    }
    setFile({ name: f.name, text: await f.text() });
  };

  const nothingToSave = result && result.products.new + result.products.updated + result.batches.new === 0;

  return (
    <div className="space-y-4">
      <PageHeader label="Developer" title={title} />
      {kinds.length > 1 && <Segmented value={kind} onChange={(k) => reset(k)} options={kinds.map((k) => ({ value: k, label: LABEL[k] }))} />}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Pehli row mein yeh column hon</CardTitle>
            <p className="mt-1 text-dense text-muted">
              Order koi bhi ho; zaroori: <span className="font-semibold text-ink">{REQUIRED[kind].join(', ')}</span>.{' '}
              {HELP[kind]}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => downloadTemplate(kind)}>
            <Download className="size-4" aria-hidden /> Khaali CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLUMNS[kind].map((c) => (
            <Chip key={c} tone={REQUIRED[kind].includes(c) ? 'brand' : 'neutral'}>
              {c}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" id="stock-csv" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="secondary" onClick={() => input.current?.click()}>
            <FileUp className="size-4" aria-hidden /> CSV file chunein
          </Button>
          {file && <span className="min-w-0 truncate text-dense text-ink">{file.name}</span>}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" disabled={!file} loading={m.isPending && m.variables === true} onClick={() => m.mutate(true)}>
              Check karein
            </Button>
            <Button disabled={!file || !result?.dryRun || !!nothingToSave} loading={m.isPending && m.variables === false} onClick={() => m.mutate(false)}>
              Import karein
            </Button>
          </div>
        </div>
        {file && !result && !error && <p className="text-dense text-muted">{'Pehle "Check karein" — dekhein kya aaye ga, phir "Import karein".'}</p>}
      </Card>

      {error && (
        <Notice action={file ? <Button size="sm" variant="secondary" onClick={() => m.mutate(true)}>Dobara</Button> : undefined}>
          {error}
        </Notice>
      )}

      {result && (
        <div className="space-y-3">
          <Notice tone={result.dryRun ? 'info' : 'success'}>
            {result.dryRun
              ? nothingToSave
                ? 'Is file mein kuch naya nahi — sab pehle se hai.'
                : 'Yeh sirf check hai — abhi kuch save nahi hua. Theek hai to "Import karein".'
              : `Import ho gaya. ${DONE[result.kind]}`}
          </Notice>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Rows" value={result.dataRows} />
            <StatTile label={result.kind === 'SERVICE' ? 'Naye procedures / services' : 'Naye products'} value={result.products.new} hint={`${result.products.updated} update · ${result.products.same} same`} />
            {result.kind === 'PHARMACY' ? (
              <>
                <StatTile label="Naye batches" value={result.batches.new} hint={`${result.batches.existing} pehle se · ${result.vendorsNew} naye vendor`} />
                <StatTile label="Stock aaye ga" value={result.quantityIn} hint="units" />
              </>
            ) : (
              <StatTile label="Ghalat rows" value={result.errors.length} accent={result.errors.length ? 'danger' : 'ops'} />
            )}
          </div>
          {result.errors.length > 0 && (
            <Card accent="danger" className="p-4">
              <CardTitle>{result.errors.length} rows chhoot jayein gi</CardTitle>
              <ul className="mt-2 space-y-1 text-dense text-danger">
                {result.errors.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    <span className="text-muted">Row {e.row}: </span>
                    {e.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {result.warnings.length > 0 && (
            <Notice tone="warning">
              <ul className="space-y-1">
                {result.warnings.slice(0, 100).map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {result.preview.length > 0 && (
            <DataTable
              rows={result.preview}
              rowKey={(r) => `${r.row}-${r.name}-${r.detail}`}
              columns={[
                { key: 'row', header: 'Row', cell: (r) => r.row, className: 'w-16' },
                { key: 'name', header: result.kind === 'SERVICE' ? 'Procedure / Service' : 'Product', cell: (r) => <span className="font-semibold text-ink">{r.name}</span> },
                { key: 'detail', header: 'Detail', cell: (r) => <span className="text-muted">{r.detail}</span> },
                { key: 'action', header: '', cell: (r) => <Chip tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Chip> },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
