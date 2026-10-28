'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { AdInbox } from '@/components/leadership/marketing';

function View() {
  const id = useSearchParams().get('id');
  return (
    <div className="space-y-4">
      <PageHeader label="Hamza Zafar" title="Ad / issue requests" />
      <AdInbox initialId={id} />
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
