'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Phone, Star } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/time';
import type { FollowUpRow } from '@/lib/manager-types';
import { cn, formatPhone, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Checkbox, Field, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';

type Tab = 'pending' | 'done';
type Ratings = { doctorRating?: number; staffRating?: number; clinicRating?: number };

function StarRow({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body text-ink">{label}</span>
      <div className="flex" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n}`} onClick={() => onChange(value === n ? undefined : n)} className="p-1">
            <Star className={cn('size-5', value && n <= value ? 'fill-gold text-gold' : 'text-line')} />
          </button>
        ))}
      </div>
    </div>
  );
}

const stars = (n: number | null | undefined) => (n ? `${n}/5` : '—');

/** One patient call: ratings, issue, suggestion; an issue can be escalated to the MD as a complaint (spec §14). */
function FollowUpCard({ f }: { f: FollowUpRow }) {
  const qc = useQueryClient();
  const [r, setR] = React.useState<Ratings>({});
  const [issue, setIssue] = React.useState('');
  const [suggestion, setSuggestion] = React.useState('');
  const [escalate, setEscalate] = React.useState(false);
  const m = useMutation({
    mutationFn: () => post<{ complaintId: string | null }>(`/manager/followups/${f.id}`, { ...r, issue: issue.trim() || undefined, suggestion: suggestion.trim() || undefined, escalateToMd: escalate }),
    onSuccess: (res) => {
      toast.success(res.complaintId ? 'Follow-up save — complaint MD ko escalate' : 'Follow-up save');
      void qc.invalidateQueries({ queryKey: ['manager'] });
    },
  });
  return (
    <Card accent="ops">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{f.patient?.name}</CardTitle>
          <p className="text-dense text-muted">
            {f.visit && `${titleCase(f.visit.type)} · ${f.visit.doctorName} · ${formatDateTime(f.visit.startAt)}`}
          </p>
        </div>
        {f.patient && (
          <Button asChild size="sm" variant="secondary">
            <a href={`tel:+${f.patient.phone}`}>
              <Phone className="size-4" /> {formatPhone(f.patient.phone)}
            </a>
          </Button>
        )}
      </CardHeader>
      {f.patientFeedback?.submittedAt && (
        <Notice tone="info">
          Patient ka feedback: Doctor {stars(f.patientFeedback.doctorRating)} · Staff {stars(f.patientFeedback.staffRating)} · Clinic {stars(f.patientFeedback.clinicRating)}
          {f.patientFeedback.suggestion ? ` — ${f.patientFeedback.suggestion}` : ''}
        </Notice>
      )}
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!escalate || issue.trim()) m.mutate();
        }}
      >
        <div className="space-y-1 rounded-card border border-line p-3">
          <StarRow label="Doctor" value={r.doctorRating} onChange={(v) => setR((x) => ({ ...x, doctorRating: v }))} />
          <StarRow label="Staff" value={r.staffRating} onChange={(v) => setR((x) => ({ ...x, staffRating: v }))} />
          <StarRow label="Clinic" value={r.clinicRating} onChange={(v) => setR((x) => ({ ...x, clinicRating: v }))} />
        </div>
        <Field label="Issue (agar koi)" htmlFor={`fi-${f.id}`}>
          <Textarea id={`fi-${f.id}`} rows={2} value={issue} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label="Suggestion" htmlFor={`fs-${f.id}`}>
          <Textarea id={`fs-${f.id}`} rows={2} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
        </Field>
        <Checkbox label="Issue ko complaint bana kar MD ko escalate karein" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
        {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua — dobara koshish karein.'}</Notice>}
        <Button type="submit" loading={m.isPending} disabled={escalate && !issue.trim()}>
          Save follow-up
        </Button>
      </form>
    </Card>
  );
}

export default function FollowUpsPage() {
  const [tab, setTab] = React.useState<Tab>('pending');
  const q = useQuery({ queryKey: ['manager', 'followups', tab], queryFn: () => get<{ items: FollowUpRow[] }>('/manager/followups', { scope: tab }) });
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Patient follow-ups" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: 'Pending', count: tab === 'pending' ? q.data?.items.length : undefined },
          { value: 'done', label: 'Done (7 days)' },
        ]}
      />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle={tab === 'pending' ? 'Aaj koi follow-up baqi nahi' : 'Koi completed follow-up nahi'} emptyHint={tab === 'pending' ? 'Invoice close hone ke agle din patient yahan aata hai.' : undefined}>
        {(d) =>
          tab === 'pending' ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {d.items.map((f) => (
                <FollowUpCard key={f.id} f={f} />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {d.items.map((f) => (
                <li key={f.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-body font-semibold text-ink">{f.patient?.name}</span>
                      <span className="flex gap-1">
                        {f.result?.complaintId && <Chip tone="danger">Escalated</Chip>}
                        <Chip tone="success">{f.result ? formatDay(f.result.completedAt) : 'Done'}</Chip>
                      </span>
                    </div>
                    <p className="text-dense text-muted">
                      Doctor {stars(f.result?.doctorRating)} · Staff {stars(f.result?.staffRating)} · Clinic {stars(f.result?.clinicRating)}
                      {f.result?.issue ? ` · Issue: ${f.result.issue}` : ''}
                      {f.result?.suggestion ? ` · ${f.result.suggestion}` : ''}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}
