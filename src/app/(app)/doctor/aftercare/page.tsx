'use client';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, get, post } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { formatDateTime } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Notice, Textarea } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';

interface AftercareTask {
  id: string;
  appointmentId: string;
  createdAt: string;
  patient: { id: string; name: string; whatsappConsent: boolean } | null;
}

function AftercareDialog({ task, onClose }: { task: AftercareTask; onClose: () => void }) {
  const qc = useQueryClient();
  const [content, setContent] = React.useState('');
  const m = useMutation({
    mutationFn: (skip: boolean) => post<{ delivered: boolean; noConsent: boolean }>(`/doctor/appointments/${task.appointmentId}/aftercare`, skip ? { skip: true } : { content }),
    onSuccess: (r, skip) => {
      toast.success(skip ? 'Aftercare skip' : r.noConsent ? 'Save — patient ki WhatsApp consent nahi, message nahi gaya' : 'Aftercare patient ko bhej diya');
      void qc.invalidateQueries({ queryKey: ['queue'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Aftercare / medication guidance" description={task.patient?.name}>
        <div className="space-y-3">
          {task.patient && !task.patient.whatsappConsent && <Notice tone="warning">Patient ki WhatsApp consent nahi — guidance record hogi magar message nahi jayega.</Notice>}
          <Field label="Guidance" htmlFor="ac-c">
            <Textarea id="ac-c" rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="e.g. Sunscreen SPF 50, 48 ghante dhoop se bachein…" />
          </Field>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => m.mutate(true)} disabled={m.isPending}>
              Skip
            </Button>
            <Button onClick={() => m.mutate(false)} loading={m.isPending} disabled={content.trim().length < 3}>
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Patient-done → aftercare / medication guidance or Skip (spec §10). */
export default function AftercarePage() {
  const { pollInterval } = useRealtime();
  const [open, setOpen] = React.useState<AftercareTask | null>(null);
  const q = useQuery({ queryKey: ['queue', 'aftercare'], queryFn: () => get<{ items: AftercareTask[] }>('/doctor/aftercare'), refetchInterval: pollInterval });
  return (
    <div>
      <PageHeader label="Doctor" title="Aftercare" />
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Aaj koi task nahi" emptyHint="Reception jab patient Done karti hai to aftercare yahan aata hai.">
        {(d) => (
          <div className="space-y-2">
            {d.items.map((t) => (
              <Card key={t.id} accent="ops" className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-card-title text-ink">{t.patient?.name ?? 'Patient'}</p>
                  <p className="text-dense text-muted">Done {formatDateTime(t.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.patient && !t.patient.whatsappConsent && <Chip tone="warning">No WhatsApp consent</Chip>}
                  <Button onClick={() => setOpen(t)}>Aftercare</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {open && <AftercareDialog task={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
