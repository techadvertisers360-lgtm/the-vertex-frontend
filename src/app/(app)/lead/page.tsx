'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BellRing, ChevronRight, Megaphone } from 'lucide-react';
import { get } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/time';
import type { BucketCounts, LeadCallback, LeadStatus, Sheet } from '@/lib/types';
import { Card, CardHeader, CardTitle, HeroBanner, SectionLabel, StatTile } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { ActiveOffers } from '@/components/leadership/marketing';

const ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_DUE', 'BOOKED', 'UNREACHABLE', 'NOT_INTERESTED'];

export default function MySheetsPage() {
  const { me } = useSession();
  const { pollInterval } = useRealtime();
  const sheets = useQuery({ queryKey: ['lead', 'sheets'], queryFn: () => get<{ items: Sheet[] }>('/lead/sheets') });
  const counts = useQuery({ queryKey: ['lead', 'appointments', 'today'], queryFn: () => get<{ counts: BucketCounts }>('/lead/appointments', { bucket: 'today' }) });
  const due = useQuery({ queryKey: ['lead', 'callbacks', 'due'], queryFn: () => get<{ items: LeadCallback[] }>('/lead/callbacks', { state: 'due' }), refetchInterval: pollInterval || 60_000 });

  return (
    <div className="space-y-5">
      <HeroBanner label="Lead Team" title="My Sheets" subtitle={`${me.user.displayName}${me.user.memberCode ? ` · ${me.user.memberCode}` : ''}`} />
      <ActiveOffers compact />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/lead/appointments?bucket=today">
          <StatTile label="Today" value={counts.data?.counts.today ?? '—'} hint="appointments" />
        </Link>
        <Link href="/lead/appointments?bucket=after2">
          <StatTile label="After 2 days" value={counts.data?.counts.after2 ?? '—'} hint="appointments" />
        </Link>
        <Link href="/lead/callbacks">
          <StatTile label="Follow-ups due" value={due.data?.items.length ?? '—'} hint="Reminder Queue" accent={due.data?.items.length ? 'danger' : 'ops'} />
        </Link>
        <Link href="/lead/leads">
          <StatTile label="My leads" value={counts.data?.counts.leads ?? '—'} hint="assigned sheets" />
        </Link>
      </div>

      {!!due.data?.items.length && (
        <Card accent="danger">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-danger" aria-hidden /> Follow-up due
            </CardTitle>
            <Link href="/lead/callbacks" className="text-dense font-semibold text-brand-medium hover:underline">
              Reminder Queue →
            </Link>
          </CardHeader>
          <ul className="divide-y divide-line">
            {due.data.items.slice(0, 4).map((c) => (
              <li key={c.id}>
                <Link href={`/lead/leads/${c.leadId}`} className="flex items-center justify-between py-2 text-dense hover:text-brand">
                  <span className="font-semibold">{c.lead?.name}</span>
                  <span className="text-muted">{c.lead?.sheet.campaign}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <SectionLabel className="mb-2">Assigned campaigns</SectionLabel>
        <QueryState
          query={sheets}
          empty={(d) => d.items.length === 0}
          emptyTitle="Aap ko abhi koi sheet assign nahi hui"
          emptyHint="Hamza Zafar ya Usama Sufain sheets assign karte hain. Unse rabta karein."
        >
          {(d) => (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {d.items.map((s) => (
                <Link key={s.id} href={`/lead/leads?sheetId=${s.id}`} className="group">
                  <Card accent="ops" className="h-full transition-colors group-hover:bg-brand-light/50">
                    <CardHeader>
                      <div>
                        <SectionLabel>{s.campaign}</SectionLabel>
                        <CardTitle>{s.title}</CardTitle>
                        <p className="text-[12px] text-muted">Sheet ID {s.externalId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[26px] font-bold leading-8 text-ink">{s.leadCount}</p>
                        <p className="text-[12px] text-muted">leads</p>
                      </div>
                    </CardHeader>
                    <div className="flex flex-wrap gap-1.5">
                      {ORDER.filter((k) => s.byStatus[k]).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1">
                          <StatusChip status={k} />
                          <span className="text-dense font-semibold text-ink">{s.byStatus[k]}</span>
                        </span>
                      ))}
                    </div>
                    {s.activePosters.length > 0 && (
                      <div className="mt-3 space-y-1 border-t border-line pt-3">
                        {s.activePosters.map((p) => (
                          <p key={p.id} className="flex items-center gap-1.5 text-dense text-ink">
                            <Megaphone className="size-4 text-gold" aria-hidden />
                            {p.title}
                            <span className="text-muted">· till {formatDate(p.validTo)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 flex items-center text-dense font-semibold text-brand-medium">
                      Leads kholen <ChevronRight className="size-4" />
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}
