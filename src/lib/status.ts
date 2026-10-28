/** Map every backend status value to a chip tone (colors live in tokens.css). */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand' | 'gold';

const TONES: Record<string, Tone> = {
  // Lead
  NEW: 'info',
  CONTACTED: 'brand',
  FOLLOW_UP_DUE: 'warning',
  BOOKED: 'success',
  NOT_INTERESTED: 'neutral',
  UNREACHABLE: 'danger',
  // Appointment
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  CHECKED_IN: 'brand',
  WAITING: 'warning',
  WITH_DOCTOR: 'brand',
  RECEPTION: 'info',
  PROCEDURE: 'gold',
  DONE: 'success',
  CANCELLED: 'neutral',
  RESCHEDULED: 'neutral',
  // Task
  PENDING: 'neutral',
  IN_PROGRESS: 'info',
  BLOCKED: 'danger',
  COMPLETED: 'success',
  // Requests
  IN_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  RETURNED_FOR_CORRECTION: 'warning',
  RESOLVED: 'success',
  NEED_DETAILS: 'warning',
  // Installments
  PAID: 'success',
  PARTIAL: 'info',
  OVERDUE: 'danger',
  UPCOMING: 'neutral',
  // Stock demands
  PENDING_MANAGER: 'warning',
  PENDING_MD: 'warning',
  PARTIALLY_RECEIVED: 'info',
  RECEIVED: 'success',
  CLOSED: 'neutral',
  // Callbacks / messages
  DUE: 'warning',
  SUPERSEDED: 'neutral',
  QUEUED: 'neutral',
  SENT: 'info',
  DELIVERED: 'success',
  FAILED: 'danger',
};

const LABELS: Record<string, string> = {
  FOLLOW_UP_DUE: 'Follow-up Due',
  CHECKED_IN: 'Checked-in',
  WITH_DOCTOR: 'With Doctor',
  RETURNED_FOR_CORRECTION: 'Return for Correction',
  NOT_INTERESTED: 'Not Interested',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  NEED_DETAILS: 'Need Details',
  PENDING_MANAGER: 'Pending Manager',
  PENDING_MD: 'Pending MD',
  PARTIALLY_RECEIVED: 'Partially Received',
};

export function toneFor(status: string): Tone {
  return TONES[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}
