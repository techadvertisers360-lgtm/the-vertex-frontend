'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { formatPhone } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { QueryState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/table';

interface MyPatient {
  id: string;
  name: string;
  phone: string;
  ageYears: number | null;
}

/** Own patients only (spec §10, §22). */
export default function MyPatientsPage() {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const list = useQuery({ queryKey: ['doctor', 'patients', q], queryFn: () => get<{ items: MyPatient[] }>('/doctor/patients', { q }) });
  return (
    <div>
      <PageHeader label="Doctor" title="My Patients" />
      <div className="mb-3 max-w-md">
        <Input aria-label="Search my patients" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam ya phone" />
      </div>
      <QueryState query={list} empty={(d) => d.items.length === 0} emptyTitle="Koi patient nahi mila" emptyHint="Sirf aap ke apne patients yahan dikhte hain. Doosre Doctor ke patient ke liye History Request bhejein.">
        {(d) => (
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/doctor/patients/${r.id}`)}
            columns={[
              { key: 'name', header: 'Patient', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'age', header: 'Age', cell: (r) => r.ageYears ?? '—' },
              { key: 'phone', header: 'Phone', cell: (r) => formatPhone(r.phone) },
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
