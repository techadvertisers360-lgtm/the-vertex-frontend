'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarPlus, MessageCircle, Phone } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { addDays, clinicDate, clinicToIso, formatDateTime, relativeFromNow } from '@/lib/time';
import type { LeadDetail } from '@/lib/types';
import { formatPhone, telHref, titleCase, whatsappHref } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, SectionLabel } from '@/components/ui/card';
import { Chip, StatusChip } from '@/components/ui/chip';
import { Field, Input, Notice, Select, Textarea } from '@/components/ui/form';
import { ErrorState, LoadingRows } from '@/components/ui/states';
import { BookingDialog } from '@/components/lead/booking-dialog';

const RESULTS: Record<'CALL' | 'WHATSAPP', string[]> = {
  CALL: ['CONNECTED', 'INTERESTED', 'CALL_BACK_LATER', 'NOT_INTERESTED', 'NO_ANSWER', 'BUSY', 'SWITCHED_OFF', 'WRONG_NUMBER'],
  WHATSAPP: ['MESSAGE_SENT', 'REPLIED', 'INTERESTED', 'CALL_BACK_LATER', 'NOT_INTERESTED'],
};

function ActivityForm({ lead }: { lead: LeadDetail }) {
  const qc = useQueryClient();
  const [channel, setChannel] = React.useState<'CALL' | 'WHATSAPP' | 'NOTE'>('CALL');
  const [result, setResult] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => post(`/lead/leads/${lead.id}/activities`, { channel, result: channel === 'NOTE' ? undefined : result, remarks: remarks || undefined, status: status || undefined }),
    onSuccess: () => {
      toast.success('Activity save ho gayi');
      setResult('');
      setRemarks('');
      setStatus('');
      setErr(null);
      void qc.invalidateQueries({ queryKey: ['lead'] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Save nahi hua'),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (channel !== 'NOTE' && !result) return setErr('Result chunein');
    if (channel === 'NOTE' && !remarks.trim()) return setErr('Note likhein');
    m.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Channel" htmlFor="a-ch">
          <Select id="a-ch" value={channel} onChange={(e) => { setChannel(e.target.value as typeof channel); setResult(''); }}>
            <option value="CALL">Call</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="NOTE">Note</option>
          </Select>
        </Field>
        {channel !== 'NOTE' && (
          <Field label="Result" required htmlFor="a-res">
            <Select id="a-res" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">Result chunein…</option>
              {RESULTS[channel].map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Status (optional)" htmlFor="a-st" hint="Khud se outcome set karein">
          <Select id="a-st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Auto</option>
            <option value="CONTACTED">Contacted</option>
            <option value="UNREACHABLE">Unreachable</option>
            <option value="NOT_INTERESTED">Not Interested</option>
          </Select>
        </Field>
      </div>
      <Field label="Remarks" htmlFor="a-rem">
        <Textarea id="a-rem" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Patient ne kya kaha…" />
      </Field>
      {err && <Notice>{err}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" loading={m.isPending}>
          Save result
        </Button>
      </div>
    </form>
  );
}

function FollowUpCard({ lead }: { lead: LeadDetail }) {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(addDays(clinicDate(), 1));
  const [time, setTime] = React.useState('16:00');
  const m = useMutation({
    mutationFn: (body: { preset: '2h' | '2d' | 'custom'; at?: string }) => post<{ callback: { dueAt: string } }>(`/lead/leads/${lead.id}/follow-up`, body),
    onSuccess: (r) => {
      toast.success(`Follow-up set — ${formatDateTime(r.callback.dueAt)}`);
      void qc.invalidateQueries({ queryKey: ['lead'] });
    },
  });
  const closed = lead.status === 'NOT_INTERESTED';
  return (
    <Card accent="ops">
      <CardHeader>
        <CardTitle>Follow-up</CardTitle>
        {lead.nextContactAt && <Chip tone={new Date(lead.nextContactAt) < new Date() ? 'danger' : 'warning'}>Due {relativeFromNow(lead.nextContactAt)}</Chip>}
      </CardHeader>
      {closed ? (
        <p className="text-dense text-muted">Not Interested lead par follow-up set nahi ho sakta. Pehle status badlein.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => m.mutate({ preset: '2h' })} disabled={m.isPending}>
              2 ghante baad
            </Button>
            <Button variant="secondary" size="sm" onClick={() => m.mutate({ preset: '2d' })} disabled={m.isPending}>
              2 din baad
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Custom date" htmlFor="fu-d">
              <Input id="fu-d" type="date" min={clinicDate()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time" htmlFor="fu-t">
              <Input id="fu-t" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Button size="sm" onClick={() => m.mutate({ preset: 'custom', at: clinicToIso(date, time) })} loading={m.isPending}>
              Set
            </Button>
          </div>
          {m.error && <Notice>{m.error instanceof ApiError ? m.error.message : 'Save nahi hua'}</Notice>}
        </div>
      )}
    </Card>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = React.useState(false);
  const q = useQuery({ queryKey: ['lead', 'detail', id], queryFn: () => get<LeadDetail>(`/lead/leads/${id}`) });

  if (q.isPending) return <LoadingRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const lead = q.data;

  return (
    <div className="space-y-4">
      <Link href="/lead/leads" className="inline-flex items-center gap-1 text-dense font-semibold text-brand-medium hover:underline">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <Card accent="ops">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>{lead.sheet.campaign}</SectionLabel>
            <h1 className="text-title text-ink">{lead.name}</h1>
            <p className="text-body text-muted">
              {formatPhone(lead.phone)} · {lead.sheet.title} · created {formatDateTime(lead.createdAt)}
            </p>
            <div className="mt-2">
              <StatusChip status={lead.status} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <a href={telHref(lead.phone)}>
                <Phone className="size-4" /> Call
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={whatsappHref(lead.phone)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
            <Button onClick={() => setBooking(true)}>
              <CalendarPlus className="size-4" /> Book appointment
            </Button>
          </div>
        </div>
        {lead.remarks && <p className="mt-3 rounded-control bg-canvas px-3 py-2 text-dense text-ink">{lead.remarks}</p>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Call / WhatsApp result</CardTitle>
            </CardHeader>
            <ActivityForm lead={lead} />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity history</CardTitle>
            </CardHeader>
            {lead.activities.length === 0 ? (
              <p className="text-dense text-muted">Abhi koi activity nahi.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-line pl-4">
                {lead.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ${a.successful ? 'bg-success' : 'bg-line'}`} aria-hidden />
                    <p className="text-dense font-semibold text-ink">
                      {titleCase(a.channel)}
                      {a.result ? ` · ${titleCase(a.result)}` : ''}
                    </p>
                    {a.remarks && <p className="text-dense text-ink">{a.remarks}</p>}
                    <p className="text-[12px] text-muted">{formatDateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <FollowUpCard lead={lead} />
          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            {lead.appointments.length === 0 ? (
              <p className="text-dense text-muted">Is lead ki abhi koi booking nahi.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lead.appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-dense">
                    <span>
                      {formatDateTime(a.startAt)} · {titleCase(a.type)}
                    </span>
                    <StatusChip status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Callback history</CardTitle>
            </CardHeader>
            {lead.callbacks.length === 0 ? (
              <p className="text-dense text-muted">Koi follow-up set nahi hua.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lead.callbacks.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-dense">
                    <span>{formatDateTime(c.dueAt)}</span>
                    <StatusChip status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {booking && <BookingDialog lead={lead} open={booking} onOpenChange={setBooking} />}
    </div>
  );
}
