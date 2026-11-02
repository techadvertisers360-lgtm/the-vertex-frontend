'use client';
import { useParams } from 'next/navigation';
import { InvoiceDetailPage } from '@/components/invoices/invoice-detail';

export default function Page() {
  return <InvoiceDetailPage id={useParams<{ id: string }>().id} />;
}
