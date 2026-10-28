'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { ApiError, get, patch, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { ChoiceField } from '@/components/ui/choice-field';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

/**
 * Reception "Procedures & Services" (D-060): the procedure / service list with the columns of the developer's CSV —
 * Category, Procedure / Service, Source, Note. Reception adds, edits and deletes (hides — bookings and plans keep
 * pointing at it; "Deleted" brings it back). The same list feeds the booking and treatment-plan pickers.
 */
interface Svc {
  id: string;
  name: string;
  category: string | null;
  source: string | null;
  note: string | null;
  active: boolean;
}

const EMPTY = { category: '', name: '', source: '', note: '' };
type FormState = typeof EMPTY;
const distinct = (values: (string | null)[]) => [...new Set(values.map((v) => v?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

function ServiceFields({ f, setF, rows, idPrefix }: { f: FormState; setF: React.Dispatch<React.SetStateAction<FormState>>; rows: Svc[]; idPrefix: string }) {
  const set = (k: keyof FormState) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <Field label="Category" htmlFor={`${idPrefix}-category`}>
        <ChoiceField id={`${idPrefix}-category`} value={f.category} onChange={set('category')} options={distinct(rows.map((r) => r.category))} />
      </Field>
      <Field label="Procedure / Service" required htmlFor={`${idPrefix}-name`}>
        <Input id={`${idPrefix}-name`} value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Hydrafacial" autoComplete="off" />
      </Field>
      <Field label="Source" htmlFor={`${idPrefix}-source`}>
        <ChoiceField id={`${idPrefix}-source`} value={f.source} onChange={set('source')} options={distinct(rows.map((r) => r.source))} />
      </Field>
      <Field label="Note" htmlFor={`${idPrefix}-note`} className="sm:col-span-2 lg:col-span-1">
        <Textarea id={`${idPrefix}-note`} rows={1} value={f.note} onChange={(e) => set('note')(e.target.value)} />
      </Field>
    </>
  );
}

const bodyOf = (f: FormState) => ({ name: f.name.trim(), category: f.category.trim() || null, source: f.source.trim() || null, note: f.note.trim() || null });

function AddForm({ rows, onClose }: { rows: Svc[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState(EMPTY);
  const exists = rows.some((r) => r.name.toLowerCase() === f.name.trim().toLowerCase());
  const m = useMutation({
    mutationFn: () => post('/reception/services', bodyOf(f)),
    onSuccess: () => {
      toast.success(`${f.name.trim()} list mein add ho gaya`);
      void qc.invalidateQueries({ queryKey: ['reception-services'] });
      setF((x) => ({ ...EMPTY, category: x.category, source: x.source }));
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Procedure / Service add karein</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Band karein
        </Button>
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.name.trim().length >= 2 && !exists) m.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ServiceFields f={f} setF={setF} rows={rows} idPrefix="add" />
        </div>
        {exists && <Notice tone="warning">Yeh naam pehle se list mein hai.</Notice>}
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
        <div className="flex justify-end">
          <Button type="submit" disabled={f.name.trim().length < 2 || exists} loading={m.isPending}>
            <Plus className="size-4" aria-hidden /> Add karein
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditDialog({ row, rows, onClose }: { row: Svc; rows: Svc[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState<FormState>({ category: row.category ?? '', name: row.name, source: row.source ?? '', note: row.note ?? '' });
  const m = useMutation({
    mutationFn: () => patch(`/reception/services/${row.id}`, bodyOf(f)),
    onSuccess: () => {
      toast.success('Update ho gaya');
      void qc.invalidateQueries({ queryKey: ['reception-services'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="Procedure / Service edit karein" description={row.name}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.name.trim().length >= 2) m.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ServiceFields f={f} setF={setF} rows={rows} idPrefix="edit" />
          </div>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={f.name.trim().length < 2} loading={m.isPending}>
              Save karein
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ row, onClose }: { row: Svc; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => patch(`/reception/services/${row.id}`, { active: false }),
    onSuccess: () => {
      toast.success(`${row.name} list se hata diya`);
      void qc.invalidateQueries({ queryKey: ['reception-services'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Delete karein?" description={row.name}>
        <div className="space-y-3">
          <p className="text-dense text-muted">List aur booking mein nazar nahi aaye ga. Purani bookings / plans mein naam rahe ga — &ldquo;Deleted&rdquo; se wapas la sakte hain.</p>
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

const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-r border-line bg-canvas px-3 py-2.5 text-left font-semibold text-ink';
const td = 'border-b border-r border-line px-3 py-2 align-top';
const dash = <span className="text-muted">—</span>;

export default function ReceptionServicesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['reception-services'], queryFn: () => get<{ items: Svc[] }>('/reception/services') });
  const [search, setSearch] = React.useState('');
  const [showRemoved, setShowRemoved] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Svc | null>(null);
  const [removing, setRemoving] = React.useState<Svc | null>(null);
  const restore = useMutation({
    mutationFn: (r: Svc) => patch(`/reception/services/${r.id}`, { active: true }),
    onSuccess: (_d, r) => {
      toast.success(`${r.name} wapas list mein`);
      void qc.invalidateQueries({ queryKey: ['reception-services'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Nahi hua — dobara koshish karein'),
  });
  const items = q.data?.items ?? [];
  const removedCount = items.filter((i) => !i.active).length;
  const needle = search.trim().toLowerCase();
  const match = (i: Svc) => (showRemoved ? !i.active : i.active) && (!needle || [i.name, i.category, i.source, i.note].some((v) => v?.toLowerCase().includes(needle)));

  return (
    <div className="space-y-4">
      <PageHeader label="Reception" title="Procedures & Services" />
      {adding && <AddForm rows={items} onClose={() => setAdding(false)} />}
      <Card className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
          <CardTitle className="mr-auto">
            {showRemoved ? 'Deleted' : 'Procedures & Services'}
            <span className="ml-2 text-dense font-normal text-muted">{items.filter(match).length}</span>
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Naam, category, source…" aria-label="Search" />
          </div>
          {(removedCount > 0 || showRemoved) && (
            <Button variant="ghost" size="sm" onClick={() => setShowRemoved((v) => !v)}>
              {showRemoved ? 'Active list' : `Deleted (${removedCount})`}
            </Button>
          )}
          {!adding && !showRemoved && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> Naya add karein
            </Button>
          )}
        </div>
        <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Abhi list khaali hai" emptyHint="“Naya add karein” se add karein ya Developer CSV upload kare.">
          {(d) => {
            const rows = d.items.filter(match);
            return rows.length ? (
              <div className="max-h-[70vh] overflow-auto border-t border-line">
                <table className="w-full border-separate border-spacing-0 text-dense">
                  <thead>
                    <tr>
                      <th className={th}>Category</th>
                      <th className={th}>Procedure / Service</th>
                      <th className={th}>Source</th>
                      <th className={th}>Note</th>
                      <th className={cn(th, 'right-0 z-20 border-l border-r-0')}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, n) => (
                      <tr key={r.id} className={cn(n % 2 ? 'bg-canvas' : 'bg-surface', 'hover:bg-brand-light', !r.active && 'opacity-60')}>
                        <td className={cn(td, 'min-w-[140px]')}>{r.category ?? dash}</td>
                        <td className={cn(td, 'min-w-[220px] font-semibold text-ink')}>{r.name}</td>
                        <td className={cn(td, 'min-w-[120px]')}>{r.source ?? dash}</td>
                        <td className={cn(td, 'min-w-[260px] text-muted')}>{r.note ?? dash}</td>
                        <td className={cn(td, 'sticky right-0 border-l border-r-0 bg-inherit py-1')}>
                          {r.active ? (
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" aria-label={`${r.name} edit karein`} title="Edit" onClick={() => setEditing(r)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="text-danger hover:bg-danger-bg" aria-label={`${r.name} delete karein`} title="Delete" onClick={() => setRemoving(r)}>
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="secondary" loading={restore.isPending && restore.variables?.id === r.id} onClick={() => restore.mutate(r)}>
                              <RotateCcw className="size-4" aria-hidden /> Wapas layein
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="border-t border-line px-5 py-6 text-dense text-muted">{showRemoved ? 'Kuch deleted nahi.' : 'Is search se kuch nahi mila.'}</p>
            );
          }}
        </QueryState>
      </Card>
      {editing && <EditDialog row={editing} rows={items} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog row={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}
