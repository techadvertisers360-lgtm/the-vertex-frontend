/** Manager payloads (backend modules/manager). */

export type Severity = 'danger' | 'warning' | 'info';

export interface Highlight {
  key: string;
  kind: 'leave_impact' | 'room_issue' | 'round_issue' | 'complaint' | 'overdue' | 'approval' | 'emergency' | 'stock_check' | 'assignment_missing' | 'message_failure';
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  at: string;
}

export interface Dashboard {
  date: string;
  cards: {
    patients: { total: number; byStatus: Record<string, number> };
    doctors: { working: number; onLeave: number; waiting: number };
    rooms: { assigned: number; procedureLive: number };
    staff: { present: number; leadPresent: number; reviewed: number; checkedIn: number };
    verification: { pending: number; withIssue: number };
    requests: { complaints: number; leave: number };
    stock: { low: number; demandsPending: number; lowItems: string[] };
    cash: { totalPaisa: number; byMethod: Record<string, number> };
    followups: { due: number; tomorrow: number };
    approvals: { total: number };
  };
  highlights: Highlight[];
}

export interface StaffRow {
  id: string;
  displayName: string;
  role: string;
  memberCode: string | null;
  /** false = check-in / check-out switched off by the developer (D-049) */
  attendanceRequired: boolean;
  attendance: { id: string; checkInAt: string; checkOutAt: string | null } | null;
  review: { id: string; uniformOk: boolean; hairOk: boolean; nailsOk: boolean; rating: number; comment: string | null; improvementNote: string | null; createdAt: string } | null;
  rooms: { assignmentId: string; code: string; acceptedAt: string | null }[];
  busy: boolean;
}

export interface ReportCheck {
  label: string;
  ok: boolean;
  note: string | null;
}

export interface ReportRow {
  id: string;
  type: 'RoomChecklistReport' | 'OfficeRound';
  kind: string;
  seq?: number;
  roomCode: string | null;
  staffName: string | null;
  submittedAt: string;
  checks: ReportCheck[];
  issues?: string | null;
  demandSkipped?: boolean;
  attachmentIds: string[];
  issue: boolean;
  latestStatus: 'VERIFIED' | 'RETURNED' | 'ESCALATED' | null;
  history: { status: string; comment: string | null; at: string; by: string | null }[];
}

export interface ApptCard {
  id: string;
  startAt: string;
  endAt: string;
  type: 'CONSULTATION' | 'PROCEDURE';
  status: string;
  roomId: string | null;
  doctorId: string;
  source: string;
  patient: { id: string; name: string; phone: string };
  doctorName: string | null;
  leadMemberName: string | null;
  roomCode: string | null;
  plannedProcedure: { id: string; procedureName: string; sessionNumber: number } | null;
}

export interface LeaveImpact {
  id: string;
  kind: 'LEAVE' | 'ABSENT';
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  doctorId: string;
  doctorName: string | null;
  createdAt: string;
  affected: ApptCard[];
}

export interface RescheduleReq {
  id: string;
  reason: string;
  requestedStartAt: string | null;
  status: string;
  createdAt: string;
  requestedBy: { id: string; displayName: string; role: string } | null;
  appointment: ApptCard | null;
}

export interface FollowUpRow {
  id: string;
  dueDate: string;
  status: string;
  patient: { id: string; name: string; phone: string } | null;
  visit: { id: string; startAt: string; type: string; doctorName: string | null } | null;
  patientFeedback: { doctorRating: number | null; staffRating: number | null; clinicRating: number | null; suggestion: string | null; submittedAt: string | null; skipped: boolean } | null;
  result: { doctorRating: number | null; staffRating: number | null; clinicRating: number | null; issue: string | null; suggestion: string | null; complaintId: string | null; completedAt: string } | null;
}

export interface AuditRow {
  id: string;
  at: string;
  action: string;
  recordType: string;
  recordId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  restricted: boolean;
}

export interface AssistantRow {
  id: string;
  displayName: string;
  onDuty: boolean;
  busy: boolean;
  available: boolean;
}
