'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, put } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Checkbox, Input, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

interface SettingRow {
  key: string;
  value: unknown;
  isPlaceholder: boolean;
  description: string;
  updatedAt: string | null;
}

function Row({ s }: { s: SettingRow }) {
  const qc = useQueryClient();
  const initial = JSON.stringify(s.value, null, typeof s.value === 'object' && s.value !== null ? 2 : 0);
  const [text, setText] = React.useState(initial);
  const [confirm, setConfirm] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: (value: unknown) => put(`/settings/${encodeURIComponent(s.key)}`, { value, confirm }),
    onSuccess: () => {
      toast.success(`${s.key} save`);
      setErr(null);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Save nahi hua'),
  });
  const multi = typeof s.value === 'object' && s.value !== null;
  const dirty = text !== initial || confirm;
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-dense font-semibold text-ink">{s.key}</span>
        <span className="flex gap-1">
          {s.isPlaceholder ? <Chip tone="warning">Placeholder — confirm</Chip> : <Chip tone="success">Confirmed</Chip>}
          {s.updatedAt && <Chip>{formatDateTime(s.updatedAt)}</Chip>}
        </span>
      </div>
      <p className="text-dense text-muted">{s.description}</p>
      <div className="flex flex-wrap items-start gap-2">
        {multi ? (
          <Textarea aria-label={s.key} rows={Math.min(8, text.split('\n').length + 1)} className="font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <Input aria-label={s.key} className="font-mono sm:w-72" value={text} onChange={(e) => setText(e.target.value)} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {s.isPlaceholder && <Checkbox label="Clinic ne confirm kiya" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />}
        <Button
          size="sm"
          disabled={!dirty}
          loading={m.isPending}
          onClick={() => {
            try {
              m.mutate(JSON.parse(text));
            } catch {
              setErr('Value sahi format mein nahi (JSON) — text ko "double quotes" mein likhein.');
            }
          }}
        >
          Save
        </Button>
      </div>
      {err && <Notice>{err}</Notice>}
    </li>
  );
}

/** Clinic settings (spec §26): every placeholder is flagged until the clinic confirms it. Changes are audited. */
export function SettingsEditor({ label }: { label: string }) {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get<{ items: SettingRow[] }>('/settings') });
  const [filter, setFilter] = React.useState('');
  return (
    <div className="space-y-4">
      <PageHeader label={label} title="Clinic settings" />
      <Input aria-label="Filter settings" placeholder="Filter (e.g. stock, officeBoy)" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-80" />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi setting nahi">
        {(d) => (
          <Card>
            <ul className="divide-y divide-line">
              {d.items
                .filter((s) => s.key.toLowerCase().includes(filter.toLowerCase()))
                .map((s) => (
                  <Row key={`${s.key}-${s.updatedAt}`} s={s} />
                ))}
            </ul>
          </Card>
        )}
      </QueryState>
    </div>
  );
}
