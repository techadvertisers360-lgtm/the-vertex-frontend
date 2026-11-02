'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { InvoicePrintPage } from '@/components/invoices/invoice-print';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <InvoicePrintPage id={id} />
    </Suspense>
  );
}
