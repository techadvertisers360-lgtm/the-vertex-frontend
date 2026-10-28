'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/table';
import { AdRequestsPanel, ComplaintsPanel, LeavePanel } from '@/components/requests/panels';

type Tab = 'ad' | 'leave' | 'complaints';

function RequestsView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'ad');
  const id = params.get('id');
  return (
    <div>
      <PageHeader label="Lead Team" title="Requests" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ad', label: 'Ad / Issue' },
          { value: 'leave', label: 'Leave' },
          { value: 'complaints', label: 'Complaints' },
        ]}
      />
      {tab === 'ad' && <AdRequestsPanel initialId={id} />}
      {tab === 'leave' && <LeavePanel initialId={id} approverHint="Manager approve karte hain; Hamza Zafar aur Muaz Tahir ko bhi notice jata hai." />}
      {tab === 'complaints' && <ComplaintsPanel initialId={id} recipientHint="Aap recipient chunein; Hamza Zafar aur Muaz Tahir ko hamesha copy jati hai." />}
    </div>
  );
}

export default function LeadRequestsPage() {
  return (
    <React.Suspense>
      <RequestsView />
    </React.Suspense>
  );
}
