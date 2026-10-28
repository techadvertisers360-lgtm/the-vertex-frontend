/** Procedure / Assistant payloads (backend modules/procedures + modules/assistant). */

export type ProcedureStep = 'ACCEPT' | 'CONSENT' | 'BEFORE_PHOTO' | 'START' | 'FINISH' | 'AFTER_PHOTO' | 'ITEMS_USED' | 'SEND_TO_RECEPTION' | 'ROOM_CLEAN' | 'DONE';

export const STEPS: { step: ProcedureStep; label: string }[] = [
  { step: 'ACCEPT', label: 'Accept' },
  { step: 'CONSENT', label: 'Consent' },
  { step: 'BEFORE_PHOTO', label: 'Before photo' },
  { step: 'START', label: 'Start' },
  { step: 'FINISH', label: 'Finish' },
  { step: 'AFTER_PHOTO', label: 'After photo' },
  { step: 'ITEMS_USED', label: 'Items used' },
  { step: 'SEND_TO_RECEPTION', label: 'Send to Reception' },
  { step: 'ROOM_CLEAN', label: 'Room clean' },
];

export const stepLabel = (s: ProcedureStep) => (s === 'DONE' ? 'Done' : (STEPS.find((x) => x.step === s)?.label ?? s));

export interface ProcedureTaskView {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
  currentStep: ProcedureStep;
  assignedAt: string | null;
  acceptedAt: string | null;
  consentAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  itemsUsedAt: string | null;
  sentToReceptionAt: string | null;
  sentToReceptionAuto: boolean;
  cleanedAt: string | null;
  appointmentId: string | null;
  patient: { id: string; name: string } | null;
  procedure: { id: string; procedureName: string; sessionNumber: number } | null;
  assistantId: string | null;
  assistantName: string | null;
  doctorName: string | null;
  roomCode: string | null;
  beforePhotoSkipped: boolean;
  afterPhotoSkipped: boolean;
}

export interface ProcedureDetail extends ProcedureTaskView {
  /** When the safety net will send the patient to Reception if the button is not pressed (D-034). */
  autoSendAt: string | null;
  uploads: { id: string; route: string; fileName: string; createdAt: string }[];
  itemsUsed: { itemId: string; name: string; unit: string; quantity: number }[];
  beforePhotoSkipReason: string | null;
  afterPhotoSkipReason: string | null;
}

export interface PendingProcedure {
  kind: 'same_day' | 'session';
  planItemId: string;
  appointmentId: string;
  patient: { id: string; name: string };
  doctorId: string;
  doctorName: string | null;
  procedureName: string;
  sessionNumber: number;
  bookedRoomId: string | null;
  advanceRequiredPaisa: number;
  paidPaisa: number;
  paymentOk: boolean;
}

export interface AssignOptions {
  durationMin: number;
  assistants: { id: string; displayName: string; onDuty: boolean; busy: boolean; available: boolean }[];
  rooms: { id: string; code: string; name: string; free: boolean; preferred: boolean }[];
}

export interface UpcomingProcedure {
  id: string;
  startAt: string;
  endAt: string;
  patient: { id: string; name: string; phone: string };
  procedure: { procedureName: string; sessionNumber: number } | null;
  doctorName: string | null;
  roomCode: string | null;
  /** Patient WhatsApp reminder (2 days before) — outbox status. */
  reminderStatus: string | null;
  doctorReminderStatus: string | null;
  /** Manager stock-check task created with the reminder. */
  stockCheck: string | null;
}

/** A planned session released on its procedure day (spec §19), waiting for the patient + Reception's assignment. */
export interface PlannedToday {
  id: string;
  planItemId: string;
  appointmentId: string | null;
  startAt: string | null;
  appointmentStatus: string | null;
  patient: { id: string; name: string } | null;
  procedure: { procedureName: string; sessionNumber: number } | null;
  doctorName: string | null;
  roomCode: string | null;
  dutyAssistantId: string | null;
  dutyAssistantName: string | null;
  assignmentMissing: boolean;
  releasedAt: string;
}

export interface MyRoom {
  id: string;
  room: { id: string; code: string; name: string; kind: string };
  acceptedAt: string | null;
  openingAt: string | null;
  closingAt: string | null;
}

export interface StockForUsage {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  usableQty: number;
}
