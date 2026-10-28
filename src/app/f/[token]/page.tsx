'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Star } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Notice, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';

interface FeedbackView {
  clinic: string;
  patientFirstName: string;
  visitDate: string;
  doctorName: string | null;
  alreadySubmitted: boolean;
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <p className="mb-1 text-body font-semibold text-ink">{label}</p>
      <div className="flex justify-between" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(n)} className="p-1.5">
            <Star className={cn('size-9', n <= value ? 'fill-gold text-gold' : 'text-line')} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Patient-facing feedback (spec §1, §9): token link only, no internal data, submit once. */
export default function PatientFeedbackPage() {
  const { token } = useParams<{ token: string }>();
  const view = useQuery({ queryKey: ['public-feedback', token], queryFn: () => get<FeedbackView>(`/public/feedback/${token}`), retry: false });
  const [r, setR] = React.useState({ doctorRating: 0, staffRating: 0, clinicRating: 0 });
  const [suggestion, setSuggestion] = React.useState('');
  const submit = useMutation({ mutationFn: () => post<{ message: string }>(`/public/feedback/${token}`, { ...r, suggestion: suggestion || undefined }) });
  const done = submit.isSuccess || view.data?.alreadySubmitted;

  return (
    <main className="min-h-dvh bg-canvas">
      <header className="bg-brand px-4 py-4 text-on-brand">
        <p className="section-label !text-gold">Feedback</p>
        <h1 className="text-title text-on-brand">The Vertex Health</h1>
      </header>
      <div className="mx-auto max-w-md px-4 py-6">
        {view.isPending ? (
          <LoadingRows rows={4} />
        ) : view.isError ? (
          <ErrorState error={view.error instanceof ApiError && view.error.status === 404 ? new ApiError(404, 'NOT_FOUND', 'Yeh feedback link durust nahi ya expire ho gaya.') : view.error} />
        ) : done ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center shadow-card">
            <CheckCircle2 className="size-12 text-success" />
            <p className="text-card-title text-ink">Shukriya, {view.data.patientFirstName}!</p>
            <p className="text-body text-muted">Aap ka feedback humein behtar banane mein madad karta hai.</p>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <p className="text-body text-ink">
              Assalam o Alaikum {view.data.patientFirstName}, {view.data.visitDate} ki visit{view.data.doctorName ? ` (${view.data.doctorName})` : ''} kaisi rahi?
            </p>
            <Stars label="Doctor" value={r.doctorRating} onChange={(v) => setR({ ...r, doctorRating: v })} />
            <Stars label="Staff" value={r.staffRating} onChange={(v) => setR({ ...r, staffRating: v })} />
            <Stars label="Clinic" value={r.clinicRating} onChange={(v) => setR({ ...r, clinicRating: v })} />
            <Textarea rows={3} aria-label="Suggestion" placeholder="Koi suggestion? (optional)" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
            {submit.error && <Notice>{submit.error instanceof ApiError ? submit.error.message : 'Feedback nahi gaya — dobara koshish karein.'}</Notice>}
            <Button type="submit" className="w-full" loading={submit.isPending} disabled={!r.doctorRating || !r.staffRating || !r.clinicRating}>
              Feedback bhejein
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
