'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { ComplaintsInbox } from '@/components/manager/inbox';

/** Complaints addressed to Muaz Tahir — e.g. Lead member complaints, which always copy Hamza and Muaz (D-019). */
function View() {
  const id = useSearchParams().get('id');
  return (
    <div className="space-y-4">
      <PageHeader label="Muaz Tahir" title="Complaints" />
      <ComplaintsInbox initialId={id} />
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
