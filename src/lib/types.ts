/** Shapes returned by the backend (subset used by the UI). Money is integer paisa; dates are ISO strings. */
export type Role =
  | 'LEAD_MEMBER'
  | 'RECEPTIONIST'
  | 'DOCTOR'
  | 'ASSISTANT'
  | 'OFFICE_BOY'
  | 'MANAGER'
  | 'MD'
  | 'MARKETING_DIRECTOR'
  | 'MARKETING_LEAD'
  | 'DEVELOPER';

export interface Me {
  user: { id: string; displayName: string; role: Role; title: string | null; email: string | null; phone: string | null; memberCode: string | null; mustChangePassword: boolean; attendanceRequired: boolean };
  /** Set while the hidden developer views the app as this user (read-only, D-043). */
  viewAs: { by: string } | null;
  permissions: string[];
  nav: { key: string; label: string; path: string }[];
  home: string;
}

export interface Notification {
  id: string;
  senderLabel: string;
  type: string;
  subject: string;
  body: string | null;
  recordType: string | null;
  recordId: string | null;
  actionLabel: string | null;
  priority: number;
  readAt: string | null;
  createdAt: string;
  status: 'read' | 'unread';
}

export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
}

export type LeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP_DUE' | 'BOOKED' | 'NOT_INTERESTED' | 'UNREACHABLE';

export interface LeadRow {
  /** Set when another lead already had this phone (spec §8 duplicate flag). */
  duplicateOfId?: string | null;
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  remarks: string | null;
  nextContactAt: string | null;
  lastContactAt: string | null;
  createdAt: string;
  sheet: { id: string; title: string; campaign: string };
}

export interface LeadActivity {
  id: string;
  channel: 'CALL' | 'WHATSAPP' | 'NOTE';
  result: string | null;
  successful: boolean;
  remarks: string | null;
  actorId: string;
  createdAt: string;
}

export interface LeadCallback {
  id: string;
  leadId: string;
  dueAt: string;
  status: 'PENDING' | 'DUE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
  completedAt: string | null;
  remindedAt: string | null;
  overdue?: boolean;
  lead?: { id: string; name: string; phone: string; status: LeadStatus; sheet: { title: string; campaign: string } };
}

export interface LeadDetail extends LeadRow {
  outcome: string | null;
  activities: LeadActivity[];
  callbacks: LeadCallback[];
  appointments: { id: string; startAt: string; type: string; status: string; doctorId: string; rescheduledFromId: string | null; checkedInAt: string | null }[];
}

export interface Sheet {
  id: string;
  externalId: string;
  title: string;
  campaign: string;
  leadCount: number;
  byStatus: Partial<Record<LeadStatus, number>>;
  activePosters: { id: string; title: string; serviceName: string | null; validFrom: string; validTo: string; attachmentId: string | null }[];
}

export interface LeadAppointment {
  id: string;
  startAt: string;
  endAt: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  status: string;
  reason: string | null;
  leadId: string | null;
  rescheduledFromId: string | null;
  cancelReason: string | null;
  checkedInAt: string | null;
  patient: { id: string; name: string; phone: string };
  doctorId: string;
  doctorName: string | null;
  roomCode: string | null;
}

export interface BucketCounts {
  today: number;
  after2: number;
  after7: number;
  total: number;
  leads: number;
}

export interface Doctor {
  id: string;
  displayName: string;
  doctorProfile: { specialty: string | null } | null;
}
export interface Service {
  id: string;
  name: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  durationMin: number | null;
}

export interface SuggestionReason {
  code: 'AFTER_CONSULTATION' | 'AFTER_PROCEDURE' | 'NEXT_FREE_ROOM' | 'NEXT_AVAILABLE_DATE' | 'NEXT_WORKING_HOURS' | 'LATER_SLOT';
  refEnd?: string;
  bufferMin?: number;
  source?: 'appointment' | 'planned_procedure';
  date?: string;
}
export interface Suggestion {
  start: string;
  end: string;
  roomId: string;
  roomCode: string | null;
  reason: SuggestionReason;
}
export interface DaySlots {
  date: string;
  durationMin: number;
  onLeave: { start: string; end: string }[];
  pendingAlternate: { start: string; end: string; label: string }[];
  slots: { start: string; end: string; roomId: string; roomCode: string | null }[];
  nextAvailable: Suggestion[];
}

export interface ThreadMessage {
  id: string;
  body: string;
  statusChange: string | null;
  createdAt: string;
  authorId: string;
  author: { id: string; displayName: string; role: Role } | null;
  attachmentIds?: unknown;
}

export interface AdRequest {
  id: string;
  kind: 'RADIUS_CHANGE' | 'EDIT_AD' | 'NEW_AD' | 'ISSUE';
  campaign: string | null;
  sheetId: string | null;
  detail: string;
  reason: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  thread?: ThreadMessage[];
}

export interface LeaveRequest {
  id: string;
  kind: 'LEAVE' | 'EARLY_LEAVE';
  startAt: string;
  endAt: string;
  reason: string;
  coveragePlan: string | null;
  approverRole: Role;
  status: string;
  decisionReason: string | null;
  createdAt: string;
  requester?: { id: string; displayName: string; role: Role } | null;
  thread?: ThreadMessage[];
}

export interface PatientCard {
  id: string;
  name: string;
  phone: string;
  ageYears: number | null;
  gender: string | null;
  contactConsent: boolean;
  whatsappConsent: boolean;
  createdAt: string;
}

export interface SearchPatient extends PatientCard {
  upcoming: { id: string; startAt: string; status: string; type: string }[];
  previousVisits: number;
  lastVisitAt: string | null;
}

export interface InvoiceSummary {
  id: string;
  status: 'OPEN' | 'CLOSED' | 'VOID';
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
}

export interface ReceptionAppt {
  id: string;
  startAt: string;
  endAt: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  status: string;
  reason: string | null;
  source: string;
  doctorId: string;
  checkedInAt: string | null;
  acceptedAt: string | null;
  sentToReceptionAt: string | null;
  doneAt: string | null;
  patient: PatientCard;
  doctorName: string | null;
  leadMemberName: string | null;
  roomCode: string | null;
  serviceName: string | null;
  invoice: InvoiceSummary | null;
  vitalsRecorded: boolean;
  vitalsStatus: 'recorded' | 'skipped' | null;
  stage: { label: string; owner: string };
  lastUpdateAt: string;
}

export interface InstallmentView {
  id: string;
  seq: number;
  dueDate: string;
  amountPaisa: number;
  paidPaisa: number;
  outstandingPaisa: number;
  state: 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE' | 'UPCOMING';
}

export interface PatientBalance {
  id: string;
  number: string;
  status: 'OPEN' | 'CLOSED' | 'VOID';
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  createdAt: string;
  installments: InstallmentView[];
}

export interface InvoiceDetail extends InvoiceSummary {
  number: string;
  subtotalPaisa: number;
  discountPaisa: number;
  closedAt: string | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPricePaisa: number;
    discountPaisa: number;
    lineTotalPaisa: number;
    /** Pharmacy line (D-048) */
    stockItemId: string | null;
    discountPercentBp: number | null;
    reversesLineId: string | null;
    reversed: boolean;
    reason: string | null;
  }[];
  payments: { id: string; receiptNo: string; amountPaisa: number; method: string; reference: string | null; receivedAt: string }[];
  appointment: ReceptionAppt;
  prescription: { id: string; fileName: string; createdAt: string } | null;
  feedback: { skipped: boolean; submittedAt: string | null; doctorRating: number | null; staffRating: number | null; clinicRating: number | null } | null;
  installments: InstallmentView[];
  bankAccounts: { id: string; name: string; bankName: string }[];
  canClose: boolean;
  closeBlockers: string[];
}

export interface DoctorToday {
  id: string;
  displayName: string;
  doctorProfile: { specialty: string | null } | null;
  windows: { start: string; end: string }[];
  onLeave: boolean;
  waiting: number;
  withDoctor: number;
  booked: number;
}

export interface Complaint {
  id: string;
  subject: string;
  detail: string;
  status: string;
  source: string;
  createdAt: string;
  escalatedToMdAt: string | null;
  raisedBy?: { id: string; displayName: string; role: Role } | null;
  patientName?: string | null;
  patient?: { name: string; phone: string } | null;
  canAct?: boolean;
  thread?: ThreadMessage[];
}
