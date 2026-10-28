'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/table';
import { ComplaintsPanel, LeavePanel } from '@/components/requests/panels';

type Tab = 'leave' | 'complaints';

/** Own leave (approved by the MD, D-021) and own complaints (normal recipient picker) for Hamza / Muaz. */
function View({ label, complaintHint }: { label: string; complaintHint: string }) {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'leave');
  return (
    <div className="space-y-4">
      <PageHeader label={label} title="My leave & complaints" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'leave', label: 'Leave / early leave' },
          { value: 'complaints', label: 'Complaints' },
        ]}
      />
      {tab === 'leave' && <LeavePanel initialId={params.get('id')} approverHint="Aap ki leave / early leave MD (Usama Sufain) approve karte hain." />}
      {tab === 'complaints' && <ComplaintsPanel initialId={params.get('id')} recipientHint={complaintHint} />}
    </div>
  );
}

export function MyRequests(props: { label: string; complaintHint: string }) {
  return (
    <React.Suspense>
      <View {...props} />
    </React.Suspense>
  );
}
