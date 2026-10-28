/** Doctor-area API shapes. No product-cost fields exist in any of these (spec §4). */
export interface VitalsRow {
  bpSystolic: number | null;
  bpDiastolic: number | null;
  glucoseMgDl: number | null;
  weightGrams: number | null;
  heightMm: number | null;
  skipped: boolean;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  startAt: string;
  endAt: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  status: string;
  reason: string | null;
  checkedInAt: string | null;
  acceptedAt: string | null;
  sentToReceptionAt: string | null;
  doneAt: string | null;
  roomCode: string | null;
  patient: { id: string; name: string; ageYears: number | null; gender: string | null };
  vitals: VitalsRow | null;
}

export interface PlanItem {
  id: string;
  sessionNumber: number;
  serviceId: string | null;
  procedureName: string;
  sameDay: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  roomId: string | null;
  roomCode: string | null;
  pricePaisa: number;
  discountPaisa: number;
  status: string;
}

export interface PlanVersion {
  id: string;
  planId: string;
  versionNo: number;
  consultationReason: string;
  consultationFeePaisa: number;
  consultationFeeWaived: boolean;
  consultationDiscountPaisa: number;
  itemsSubtotalPaisa: number;
  itemsDiscountPaisa: number;
  totalDiscountPaisa: number;
  grandTotalPaisa: number;
  advanceRequestedPaisa: number;
  balancePaisa: number;
  installmentCount: number;
  createdAt: string;
  items: PlanItem[];
  installments: { id: string; seq: number; dueDate: string; amountPaisa: number }[];
}

export interface Consultation {
  appointment: QueueItem & { patientId: string; doctorId: string; roomCode: string | null };
  patient: { id: string; name: string; ageYears: number | null; gender: string | null; phone: string };
  vitals: VitalsRow[];
  plan: { planId: string; version: PlanVersion | null } | null;
  invoiceExists: boolean;
}

export interface HistoryVisit {
  id: string;
  startAt: string;
  type: string;
  status: string;
  reason: string | null;
  doctorId: string;
  doctorName: string | null;
  vitals: VitalsRow[];
  plan: { versionNo: number; consultationReason: string; grandTotalPaisa: number; items: { sessionNumber: number; procedureName: string; sameDay: boolean; scheduledStart: string; status: string }[] } | null;
  documents: { id: string; route: string; fileName: string; createdAt: string }[];
}

export interface PatientHistory {
  patient: { id: string; name: string; ageYears: number | null; gender: string | null; phone: string };
  access: 'own' | 'approved';
  visits: HistoryVisit[];
}

export function vitalsSummary(v: VitalsRow | null): string {
  if (!v) return 'Vitals —';
  if (v.skipped) return 'Vitals skipped';
  const parts = [
    v.bpSystolic && v.bpDiastolic ? `BP ${v.bpSystolic}/${v.bpDiastolic}` : null,
    v.glucoseMgDl ? `Glucose ${v.glucoseMgDl}` : null,
    v.weightGrams ? `${(v.weightGrams / 1000).toFixed(1)} kg` : null,
    v.heightMm ? `${(v.heightMm / 10).toFixed(0)} cm` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Vitals —';
}
