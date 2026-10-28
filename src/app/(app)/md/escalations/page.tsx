'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post, get } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/time';
import { titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { QueryState } from '@/components/ui/states';
import { Segmented } from '@/components/ui/table';
import { ComplaintsInbox } from '@/components/manager/inbox';
import { ComplaintsPanel, LeavePanel } from '@/components/requests/panels';
import { ReasonDialog } from '@/components/reception/dialogs';

type Tab = 'complaints' | 'impacts' | 'ops' | 'mine';

interface Impact {
  id: string;
  date: string;
  kind: string;
  reason: string | null;
  doctorName: string | null;
  createdAt: string;
  pending: number;
  patients: { id: string; name: string; startAt: string; source: string }[];
}

/** Doctor leave alerts (spec §15): date, Doctor, affected patients, Manager status; escalate if unresolved. */
function Impacts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['md', 'impacts'], queryFn: () => get<{ items: Impact[] }>('/md/leave-impacts') });
  const [nudge, setNudge] = React.useState<Impact | null>(null);
  return (
    <>
      <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi Doctor leave impact open nahi">
        {(d) => (
          <div className="grid gap-3 xl:grid-cols-2">
            {d.items.map((i) => (
              <Card key={i.id} accent={i.pending ? 'danger' : 'ops'}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      {i.doctorName} — {titleCase(i.kind)} {formatDay(`${i.date}T12:00:00Z`)}
                    </CardTitle>
                    <p className="text-dense text-muted">
                      {i.reason ?? ''} · reported {formatDateTime(i.createdAt)}
                    </p>
                  </div>
                  <Chip tone={i.pending ? 'danger' : 'success'}>{i.pending ? `${i.pending} pending` : 'Manager ne sab handle kiye'}</Chip>
                </CardHeader>
                {i.patients.length > 0 && (
                  <ul className="text-dense">
                    {i.patients.map((p) => (
                      <li key={p.id} className="border-b border-line py-1">
                        {p.name} · {formatDateTime(p.startAt)} {p.source === 'planned_procedure' && <Chip tone="gold">planned procedure</Chip>}
                      </li>
                    ))}
                  </ul>
                )}
                {i.pending > 0 && (
                  <Button size="sm" className="mt-3" variant="secondary" onClick={() => setNudge(i)}>
                    Escalate to Manager
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {nudge && (
        <ReasonDialog
          title="Manager ko yaad dilayein"
          description={`${nudge.doctorName} · ${nudge.pending} patients abhi reschedule / cancel nahi hue.`}
          label="Note"
          submitLabel="Send"
          onSubmit={async ({ reason }) => {
            await post(`/md/leave-impacts/${nudge.id}/escalate`, { note: reason });
            toast.success('Managers ko urgent alert gaya');
            void qc.invalidateQueries({ queryKey: ['md'] });
          }}
          onClose={() => setNudge(null)}
        />
      )}
    </>
  );
}

/** Room / round issues the Manager escalated to the MD, with the decision trail. */
function OpsIssues() {
  const q = useQuery({
    queryKey: ['md', 'ops'],
    queryFn: () => get<{ items: { reportId: string; reportType: string; latest: string; history: { status: string; comment: string | null; by: string | null; at: string }[] }[] }>('/md/escalated-reports'),
  });
  return (
    <QueryState query={q} empty={(d) => d.items.length === 0} emptyTitle="Koi escalated ops issue nahi">
      {(d) => (
        <div className="grid gap-3 xl:grid-cols-2">
          {d.items.map((r) => (
            <Card key={r.reportId} accent={r.latest === 'VERIFIED' ? 'ops' : 'danger'}>
              <CardHeader>
                <CardTitle>{r.reportType === 'RoomChecklistReport' ? 'Room checklist' : 'Office Boy round'}</CardTitle>
                <Chip tone={r.latest === 'VERIFIED' ? 'success' : 'danger'}>{r.latest === 'VERIFIED' ? 'Resolved' : 'Open'}</Chip>
              </CardHeader>
              <ol className="space-y-1 text-dense">
                {r.history.map((h, i) => (
                  <li key={i}>
                    <span className="font-semibold">{titleCase(h.status)}</span> · {h.by} · {formatDateTime(h.at)}
                    {h.comment ? ` — ${h.comment}` : ''}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-dense text-muted">Manager Room Verification se verify kare to yeh band hota hai.</p>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function View() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'complaints');
  return (
    <div className="space-y-4">
      <PageHeader label="MD" title="Complaints & escalations" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'complaints', label: 'Complaints to MD' },
          { value: 'impacts', label: 'Doctor leave alerts' },
          { value: 'ops', label: 'Escalated ops issues' },
          { value: 'mine', label: 'My requests' },
        ]}
      />
      {tab === 'complaints' && <ComplaintsInbox initialId={params.get('id')} />}
      {tab === 'impacts' && <Impacts />}
      {tab === 'ops' && <OpsIssues />}
      {tab === 'mine' && (
        <div className="space-y-6">
          <LeavePanel approverHint="MD ki leave ko approval nahi chahiye — Manager aur Hamza Zafar ko sirf information jati hai." />
          <ComplaintsPanel recipientHint="Recipient chunein." />
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <React.Suspense>
      <View />
    </React.Suspense>
  );
}
