import type { Role } from './types';

/**
 * Where a notification's source record opens, per role (spec §3: "Click par source record khule").
 * Extended as each role's screens are added.
 */
export function recordHref(role: Role, recordType: string | null, recordId: string | null): string | null {
  // The developer's notifications are problems staff ran into (D-045) — they open the Problems list.
  if (role === 'DEVELOPER') return '/developer/issues';
  if (!recordType || !recordId) return null;
  if (role === 'LEAD_MEMBER') {
    switch (recordType) {
      case 'Lead':
        return `/lead/leads/${recordId}`;
      case 'Appointment':
        return `/lead/appointments?focus=${recordId}&bucket=total`;
      case 'AdRequest':
        return `/lead/requests?tab=ad&id=${recordId}`;
      case 'LeaveRequest':
        return `/lead/requests?tab=leave&id=${recordId}`;
      case 'Complaint':
        return `/lead/requests?tab=complaints&id=${recordId}`;
      case 'MetaSheet':
        return `/lead/leads?sheetId=${recordId}`;
    }
  }
  if (role === 'DOCTOR') {
    switch (recordType) {
      case 'Appointment':
        return `/doctor/consult/${recordId}`;
      case 'HistoryAccessRequest':
        return '/doctor/history-requests';
      case 'DoctorAvailabilityException':
        return '/doctor/availability';
      case 'UpcomingProcedure':
        return '/doctor';
    }
  }
  if (role === 'RECEPTIONIST') {
    switch (recordType) {
      case 'Appointment':
        return `/reception/tracker?focus=${recordId}`;
      case 'ProcedureTask':
      case 'PlannedProcedure':
        return '/reception/procedures';
      case 'LeaveRequest':
        return `/reception/staff?tab=leave&id=${recordId}`;
      case 'Complaint':
        return `/reception/staff?tab=complaints&id=${recordId}`;
    }
  }
  if (role === 'ASSISTANT') {
    switch (recordType) {
      case 'ProcedureTask':
        return `/assistant/procedures/${recordId}`;
      case 'PlannedProcedure':
        return '/assistant';
      case 'RoomAssignment':
        return '/assistant/rooms';
      case 'StockDemand':
      case 'DamageReport':
        return '/assistant/demands';
      case 'LeaveRequest':
        return `/assistant/staff?tab=leave&id=${recordId}`;
      case 'Complaint':
        return `/assistant/staff?tab=complaints&id=${recordId}`;
    }
  }
  if (role === 'OFFICE_BOY') {
    switch (recordType) {
      case 'OfficeRound':
        return '/office';
      case 'StockDemand':
      case 'DamageReport':
        return '/office/demands';
      case 'LeaveRequest':
        return `/office/staff?tab=leave&id=${recordId}`;
      case 'Complaint':
        return `/office/staff?tab=complaints&id=${recordId}`;
    }
  }
  if (role === 'MANAGER') {
    switch (recordType) {
      case 'Appointment':
        return '/manager/tracker';
      case 'Attendance':
      case 'StaffReview':
        return '/manager/staff';
      case 'RoomChecklistReport':
      case 'RoomAssignment':
        return '/manager/rooms';
      case 'OfficeRound':
        return '/manager/rooms?tab=rounds';
      case 'ProcedureTask':
        return '/manager/rooms?tab=procedures';
      case 'DoctorAvailabilityException':
        return '/manager/schedule';
      case 'RescheduleRequest':
        return '/manager/schedule?tab=requests';
      case 'HistoryAccessRequest':
        return '/manager/approvals';
      case 'LeaveRequest':
        return `/manager/requests?tab=leave&id=${recordId}`;
      case 'Complaint':
        return `/manager/requests?tab=complaints&id=${recordId}`;
      case 'FollowUp':
        return '/manager/followups';
      case 'StockDemand':
        return '/manager/stock?tab=demands';
      case 'StockItem':
        return '/manager/stock';
      case 'DamageReport':
        return '/manager/stock?tab=damage';
      case 'GoodsReceipt':
      case 'SupplierPayment':
        return '/manager/stock?tab=vendors';
      case 'WorkflowTask':
        return '/manager/stock?tab=checks';
      case 'MessageOutbox':
        return `/manager/messages?id=${recordId}`;
    }
  }
  if (role === 'MD') {
    switch (recordType) {
      case 'StockDemand':
      case 'DamageReport':
        return '/md/approvals';
      case 'LeaveRequest':
        return `/md/approvals?tab=leave&id=${recordId}`;
      case 'Complaint':
        return `/md/escalations?id=${recordId}`;
      case 'RoomChecklistReport':
      case 'OfficeRound':
        return '/md/escalations?tab=ops';
      case 'DoctorAvailabilityException':
        return '/md/escalations?tab=impacts';
      case 'MetaSheet':
        return `/md/lead-admin?tab=sheets&id=${recordId}`;
    }
  }
  if (role === 'MARKETING_DIRECTOR' || role === 'MARKETING_LEAD') {
    const base = role === 'MARKETING_DIRECTOR' ? '/marketing/hamza' : '/marketing/muaz';
    switch (recordType) {
      case 'AdRequest':
        return `${base}/requests?id=${recordId}`;
      case 'Complaint':
        return role === 'MARKETING_DIRECTOR' ? `/marketing/hamza/escalations?id=${recordId}` : `/marketing/muaz/complaints?id=${recordId}`;
      case 'PerformanceNote':
        return `${base}/performance`;
      case 'Offer':
        return role === 'MARKETING_LEAD' ? '/marketing/muaz/offers' : '/marketing/hamza';
      case 'LeaveRequest':
        return `${base}/my-requests?tab=leave&id=${recordId}`;
      case 'MetaSheet':
        return role === 'MARKETING_DIRECTOR' ? `/marketing/hamza/sheets?id=${recordId}` : '/marketing/muaz';
    }
  }
  if (role === 'RECEPTIONIST' && (recordType === 'StockItem' || recordType === 'StockIntake')) return '/reception/stock';
  if (role === 'MANAGER' && recordType === 'StockIntake') return '/manager/stock?tab=verify';
  if (role === 'RECEPTIONIST' || role === 'DOCTOR' || role === 'ASSISTANT' || role === 'OFFICE_BOY' || role === 'LEAD_MEMBER') {
    if (recordType === 'StaffReview') return role === 'LEAD_MEMBER' ? '/lead/requests' : role === 'DOCTOR' ? '/doctor' : `/${role === 'RECEPTIONIST' ? 'reception' : role === 'ASSISTANT' ? 'assistant' : 'office'}/staff`;
  }
  return null;
}

export const LEADERSHIP_ROLES: Role[] = ['MANAGER', 'MD', 'MARKETING_DIRECTOR', 'MARKETING_LEAD'];

export const ROLE_LABEL: Record<Role, string> = {
  LEAD_MEMBER: 'Lead Team',
  RECEPTIONIST: 'Reception',
  DOCTOR: 'Doctor',
  ASSISTANT: 'Assistant',
  OFFICE_BOY: 'Office Boy',
  MANAGER: 'Manager',
  MD: 'MD',
  MARKETING_DIRECTOR: 'Marketing & Development Director',
  MARKETING_LEAD: 'Marketing & Lead Performance',
  DEVELOPER: 'Developer',
};
