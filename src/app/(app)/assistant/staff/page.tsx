'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/table';
import { AttendanceCard } from '@/components/requests/attendance-card';
import { ComplaintsPanel, LeavePanel } from '@/components/requests/panels';

type Tab = 'leave' | 'complaints';

function StaffView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>((params.get('tab') as Tab) || 'leave');
  return (
    <div className="space-y-4">
      <PageHeader label="Assistant" title="Staff actions" />
      <AttendanceCard />
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'leave', label: 'Leave / early leave' }, { value: 'complaints', label: 'Complaints' }]} />
      {tab === 'leave' && <LeavePanel initialId={params.get('id')} approverHint="Leave / early leave Manager approve karte hain." />}
      {tab === 'complaints' && <ComplaintsPanel initialId={params.get('id')} recipientHint="Recipient chunein: Manager, MD ya Hamza Zafar." />}
    </div>
  );
}

export default function StaffPage() {
  return (
    <React.Suspense>
      <StaffView />
    </React.Suspense>
  );
}
