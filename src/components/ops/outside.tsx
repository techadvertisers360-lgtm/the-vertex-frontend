'use client';
import * as React from 'react';
import { PageHeader } from '@/components/ui/card';
import { Notice } from '@/components/ui/form';
import { Segmented } from '@/components/ui/table';
import { ComplaintsPanel, LeavePanel } from '@/components/requests/panels';

/** What staff can do from outside the clinic (client demo, D-092): leave and complaints. Chat has its own screen. */
export function OutsidePage() {
  const [tab, setTab] = React.useState<'leave' | 'complaints'>('leave');
  return (
    <div className="space-y-3">
      <PageHeader label="Clinic se bahar" title="Leave and requests" />
      <Notice tone="info">Aap clinic se bahar hain. Yahan sirf requests aur chat khulte hain.</Notice>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'leave', label: 'Leave' }, { value: 'complaints', label: 'Complaints' }]} />
      {tab === 'leave' ? <LeavePanel approverHint="Manager ya MD faisla karega." /> : <ComplaintsPanel recipientHint="Manager ya MD ko bhejein." />}
    </div>
  );
}
