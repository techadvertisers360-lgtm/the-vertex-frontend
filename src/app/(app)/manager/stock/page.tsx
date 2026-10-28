'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/table';
import { DemandsTab } from '@/components/inventory/demands-tab';
import { DamageTab, VendorsTab } from '@/components/inventory/vendors-tab';
import { StockChecksTab } from '@/components/inventory/stock-checks-tab';
import { StockVerifyTab } from '@/components/inventory/stock-verify-tab';

type Tab = 'verify' | 'checks' | 'demands' | 'vendors' | 'damage';

/** Stock & vendors (spec §14, §18). "Stock & batches" moved to Reception (D-048). Demands with the Rs 20,000 / MD gate, purchasing, vendor ledgers, damage. */
function StockView() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>(((t) => (t && t !== 'stock' ? t : 'verify'))(params.get('tab')) as Tab);
  return (
    <div className="space-y-4">
      <PageHeader label="Manager" title="Stock & vendors" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'verify', label: 'Stock verification' },
          { value: 'checks', label: 'Procedure stock checks' },
          { value: 'demands', label: 'Demands & purchases' },
          { value: 'vendors', label: 'Vendors & payments' },
          { value: 'damage', label: 'Damage' },
        ]}
      />
      {tab === 'verify' && <StockVerifyTab />}
      {tab === 'checks' && <StockChecksTab />}
      {tab === 'demands' && <DemandsTab />}
      {tab === 'vendors' && <VendorsTab />}
      {tab === 'damage' && <DamageTab />}
    </div>
  );
}

export default function StockPage() {
  return (
    <React.Suspense>
      <StockView />
    </React.Suspense>
  );
}
