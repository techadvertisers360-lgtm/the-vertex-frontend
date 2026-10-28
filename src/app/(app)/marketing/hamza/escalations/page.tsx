'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { ComplaintsInbox } from '@/components/manager/inbox';

/** Complaints / escalations addressed to Hamza Zafar (spec §16). Own leave & complaints: "My Leave & Complaints". */
function View() {
  const params = useSearchParams();
  return (
    <div className="space-y-4">
      <PageHeader label="Hamza Zafar" title="Complaints & escalations" />
      <ComplaintsInbox initialId={params.get('id')} />
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
