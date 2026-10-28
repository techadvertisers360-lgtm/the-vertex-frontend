'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/table';
import { MembersAdmin, SheetsAdmin } from '@/components/leadership/lead-admin';

type Tab = 'members' | 'sheets';

/** Lead Team admin for Usama Sufain (spec §2: Hamza or Usama only). */
function View() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>(params.get('tab') === 'sheets' ? 'sheets' : 'members');
  return (
    <div className="space-y-4">
      <PageHeader label="MD" title="Lead Team admin" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'members', label: 'Members' },
          { value: 'sheets', label: 'Meta sheets' },
        ]}
      />
      {tab === 'members' ? <MembersAdmin /> : <SheetsAdmin />}
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
