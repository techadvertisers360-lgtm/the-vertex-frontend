'use client';
import { useParams } from 'next/navigation';
import { PatientRecordView } from '@/components/patients/patient-records';

/** One patient's full history A to Z (D-078). */
export default function PatientRecordPage() {
  const { id } = useParams<{ id: string }>();
  return <PatientRecordView id={id} base="/md/patients" />;
}
