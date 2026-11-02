'use client';
import { useParams } from 'next/navigation';
import { PatientRecordView } from '@/components/patients/patient-records';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PatientRecordView id={id} base="/marketing/hamza/patients" />;
}
