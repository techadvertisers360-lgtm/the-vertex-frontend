'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/table';
import { ComplaintsInbox, LeaveInbox } from '@/components/manager/inbox';
import { ComplaintsPanel, LeavePanel } from '@/components/requests/panels';

type Tab = 'complaints' | 'leave' | 'mine';

/** Complaints and staff leave requests addressed to the Manager (spec §14, §21). */
function RequestsView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'complaints');
  const id = params.get('id');
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Complaints & leave" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'complaints', label: 'Complaints' },
          { value: 'leave', label: 'Leave requests' },
          { value: 'mine', label: 'My own requests' },
        ]}
      />
      {tab === 'complaints' && <ComplaintsInbox initialId={id} />}
      {tab === 'leave' && <LeaveInbox initialId={id} />}
      {tab === 'mine' && (
        <div className="space-y-6">
          <LeavePanel approverHint="Manager ki leave / early leave MD approve karte hain (apni leave khud approve nahi)." />
          <ComplaintsPanel recipientHint="Manager ki complaint MD aur Hamza Zafar ko jati hai." />
        </div>
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <React.Suspense>
      <RequestsView />
    </React.Suspense>
  );
}
