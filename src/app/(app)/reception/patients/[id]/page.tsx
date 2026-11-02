'use client';
import { useParams } from 'next/navigation';
import { PatientRecordView } from '@/components/patients/patient-records';

/** One patient's full history for Reception, view only (D-087). */
export default function ReceptionPatientHistoryPage() {
  const { id } = useParams<{ id: string }>();
  return <PatientRecordView id={id} base="/reception/patients" backLabel="Patients" canEdit={false} canUploadLab />;
}
