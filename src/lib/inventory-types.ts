/** Inventory + cash payloads (backend modules/inventory, modules/cash). Money is paisa (number). */

export interface StockRow {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  packUnit: string | null;
  packSize: number | null;
  minQty: number;
  active: boolean;
  preferredVendor: string | null;
  onHand: number;
  usable: number;
  low: boolean;
  expired: number;
  quarantined: number;
  nearExpiry: number;
}

export interface BatchRow {
  id: string;
  lotNo: string;
  expiryDate: string | null;
  status: 'AVAILABLE' | 'QUARANTINED' | 'EXPIRED' | 'DEPLETED';
  statusReason: string | null;
  balance: number;
  unitCostPaisa: number | null;
  vendorId: string | null;
  vendorName: string | null;
  expired: boolean;
  nearExpiry: boolean;
}

export interface ItemDetail {
  item: StockRow & { onHand: number };
  batches: BatchRow[];
  transactions: { id: string; at: string; type: string; quantity: number; batchId: string | null; reason: string | null; actor: string | null }[];
}

export interface DemandLine {
  id: string;
  itemId: string | null;
  /** Office Boy's written item (D-066): not a stock item — priced and approved, never received into stock. */
  freeText: boolean;
  name: string;
  unit: string;
  quantity: number;
  receivedQty: number;
  remainingQty: number;
  estUnitCostPaisa: number;
  lineTotalPaisa: number;
  onHand: number | null;
  minQty: number;
}

export interface Demand {
  id: string;
  demandNumber: string | null;
  status: string;
  reason: string;
  requesterRole: string;
  requestedBy: string | null;
  requestedById: string;
  createdAt: string;
  estimatedTotalPaisa: number;
  approvedBy: string | null;
  approverRole: string | null;
  approvedAt: string | null;
  forwardedToMdAt: string | null;
  decisionReason: string | null;
  closedAt: string | null;
  lines: DemandLine[];
  receipts: { id: string; vendorId: string; vendorName: string | null; totalPaisa: number; receivedAt: string; vendorInvoiceNo: string | null }[];
  receivedTotalPaisa: number;
}

export interface Vendor {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  products: string | null;
  active: boolean;
  balancePaisa: number;
  /** Total paid ever and the last payment (D-050) */
  paidPaisa: number;
  lastPaidAt: string | null;
}

export interface VendorLedger {
  vendor: Vendor;
  balancePaisa: number;
  entries: {
    id: string;
    at: string;
    kind: 'GoodsReceipt' | 'SupplierReturn' | 'SupplierPayment';
    refId: string;
    amountPaisa: number;
    balancePaisa: number;
    memo: string | null;
    receipt: { id: string; vendorInvoiceNo: string | null; attachmentId: string | null; demandId: string | null } | null;
    payment: { id: string; method: string; reference: string | null; note: string | null } | null;
    return: { id: string; quantity: number; reason: string; itemId: string } | null;
  }[];
}

export interface DamageRow {
  id: string;
  itemId: string | null;
  /** Office Boy's written report (D-068): no stock item, approving only acknowledges it. */
  written: boolean;
  itemName: string;
  unit: string;
  batchId: string | null;
  lotNo: string | null;
  quantity: number;
  reason: string;
  attachmentId: string | null;
  status: string;
  approverRole: string;
  reportedBy: string | null;
  reviewedBy: string | null;
  decisionReason: string | null;
  createdAt: string;
}

export interface CashDay {
  date: string;
  collections: { count: number; totalPaisa: number; cashPaisa: number; cardPaisa: number; bankPaisa: number; chequePaisa: number };
  discountsPaisa: number;
  /** Walk-in pharmacy sales (D-061), already included in collections. */
  counterSales: { count: number; totalPaisa: number; cashPaisa: number; bankPaisa: number };
  cash: { inPaisa: number; outPaisa: number; expectedPaisa: number };
  supplierPayments: { id: string; vendorName: string | null; amountPaisa: number; method: string; reference: string | null; paidAt: string }[];
  perCashier: { cashierId: string; name: string | null; count: number; totalPaisa: number; cashPaisa: number }[];
  payments: { id: string; receiptNo: string; amountPaisa: number; method: string; reference: string | null; cashierName: string | null; receivedAt: string; invoiceNumber: string | null; counterSale: boolean }[];
  closing: {
    id: string;
    date: string;
    expectedCashPaisa: number;
    countedCashPaisa: number;
    variancePaisa: number;
    notes: string | null;
    managerName: string | null;
    cashierName: string | null;
    signedOffAt: string;
  } | null;
}

export interface OutstandingRow {
  invoiceId: string;
  number: string;
  appointmentId: string;
  status: string;
  createdAt: string;
  patient: { id: string; name: string; phone: string } | null;
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  overduePaisa: number;
  overdueCount: number;
  nextDue: { dueDate: string; outstandingPaisa: number } | null;
  installments: { id: string; seq: number; dueDate: string; amountPaisa: number; paidPaisa: number; outstandingPaisa: number; state: string }[];
  unscheduledPaisa: number;
}

export interface CashReport {
  from: string;
  to: string;
  days: { date: string; collections: CashDay['collections']; discountsPaisa: number; supplierPaidPaisa: number; cashExpectedPaisa: number; closing: { countedCashPaisa: number; variancePaisa: number; managerName: string | null; signedOffAt: string } | null }[];
  totals: { collectedPaisa: number; cashPaisa: number; cardPaisa: number; bankPaisa: number; chequePaisa: number; discountsPaisa: number; supplierPaidPaisa: number; variancePaisa: number; unclosedDays: number };
  outstanding: { items: OutstandingRow[]; totals: { balancePaisa: number; overduePaisa: number; dueNext30Paisa: number } };
}
