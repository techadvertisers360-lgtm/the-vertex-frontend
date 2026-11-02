/** Invoice module API shapes (D-084, D-085). Amounts are integer paisa. */

export interface InvoiceRow {
  id: string;
  number: string;
  kind: 'VISIT' | 'COUNTER' | 'DIRECT';
  status: 'OPEN' | 'CLOSED' | 'VOID';
  cancelled: boolean;
  cancelReason: string | null;
  cancelledAt: string | null;
  date: string;
  patient: { id: string; name: string; phone: string } | null;
  buyerName: string | null;
  buyerPhone: string | null;
  doctor: { id: string; name: string } | null;
  services: string[];
  subtotalPaisa: number;
  /** Left out when the role may not see discounts. */
  discountPaisa?: number;
  /** null means no tax: shown as "N/A". */
  taxPaisa: number | null;
  taxRateBp: number | null;
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
}

export interface InvoiceList {
  items: InvoiceRow[];
  page: number;
  pageSize: number;
  total: number;
  from: string | null;
  to: string | null;
  cards: { totalInvoices: number; todayInvoices: number; weekInvoices: number };
  /** Manager / MD only. */
  totals?: { subtotalPaisa: number; discountPaisa?: number; taxPaisa: number; totalPaisa: number; paidPaisa: number; balancePaisa: number };
}

export interface InvoiceOptions {
  doctors: { id: string; name: string }[];
  paymentModes: { id: string; name: string; method: MoneyMethod }[];
  categories: { id: string; name: string }[];
  services: { id: string; name: string; invoiceCategoryId: string | null; defaultPricePaisa: number | null }[];
  bankAccounts: { id: string; name: string; bankName: string }[];
  tax: { enabled: boolean; rateBp: number };
}

export type MoneyMethod = 'CASH' | 'CARD' | 'BANK_ONLINE' | 'CHEQUE';

export interface InvoicePayment {
  id: string;
  receiptNo: string;
  amountPaisa: number;
  method: MoneyMethod | 'ADVANCE';
  modeName: string | null;
  reference: string | null;
  note: string | null;
  reversesPaymentId: string | null;
  cashierName: string | null;
  receivedAt: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPricePaisa: number;
  discountPaisa?: number;
  lineTotalPaisa: number;
  reversesLineId: string | null;
  reversed: boolean;
}

export interface InvoiceDetail {
  id: string;
  number: string;
  kind: InvoiceRow['kind'];
  status: InvoiceRow['status'];
  cancelled: boolean;
  date: string;
  patient: { id: string; name: string; phone: string } | null;
  buyerName: string | null;
  buyerPhone: string | null;
  doctor: { id: string; name: string } | null;
  appointmentId: string | null;
  subtotalPaisa: number;
  discountPaisa?: number;
  taxPaisa: number;
  taxRateBp: number | null;
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  advanceBalancePaisa: number | null;
  cancelBlock: 'ALREADY_CANCELLED' | 'VISIT_ACTIVE' | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelMoney: 'NONE' | 'MOVED_TO_ADVANCE' | 'REFUNDED' | null;
  createdByName: string | null;
  createdAt: string;
}

export interface InvoicePrintData {
  invoice: InvoiceDetail;
  clinic: { name: string; logoDataUrl: string | null };
}

export interface PatientHit {
  id: string;
  name: string;
  phone: string;
}

export interface PatientContext {
  patient: PatientHit;
  advanceBalancePaisa: number;
  openVisitsToday: { id: string; startAt: string; status: string; type: string }[];
  unpaidInvoices: { id: string; number: string; balancePaisa: number; invoiceDate: string }[];
}

export interface AdvanceEntry {
  id: string;
  type: 'RECEIPT' | 'APPLIED' | 'CANCEL_CREDIT' | 'REFUND';
  amountPaisa: number;
  receiptNo: string | null;
  method: string | null;
  reference: string | null;
  invoiceId: string | null;
  note: string | null;
  actorName: string | null;
  createdAt: string;
  patient: PatientHit;
}

export interface AuditItem {
  id: string;
  action: string;
  recordType: string;
  recordId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  at: string;
  actorName: string | null;
}

/** Permissions the server gave this role (auth/permissions.ts). They only decide what to show; the API enforces them. */
export const INVOICE_PERMS = {
  create: 'invoice:create',
  pay: 'invoice:pay',
  advance: 'invoice:advance',
  print: 'invoice:print',
  totals: 'invoice:totals',
  export: 'invoice:export',
  cancel: 'invoice:cancel',
  exportAll: 'invoice:export_all',
  settings: 'invoice:settings',
  audit: 'invoice:audit',
} as const;
