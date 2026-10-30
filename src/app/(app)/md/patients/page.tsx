'use client';
import { PatientRecordsList } from '@/components/patients/patient-records';

/** Patient Records (D-078): every patient, searchable. */
export default function PatientRecordsPage() {
  return <PatientRecordsList base="/md/patients" />;
}
