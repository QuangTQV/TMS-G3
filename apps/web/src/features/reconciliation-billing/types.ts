export type ReconciliationType = 'CUSTOMER' | 'CARRIER';
export type ReconciliationStatus = 'DRAFT' | 'CONFIRMED' | 'LOCKED' | 'REOPENED';
export type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'DISPUTED'
  | 'ADJUSTED'
  | 'REPLACED'
  | 'VOIDED';
export type ReceivableStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
export type PayableStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID';

export interface ReconciliationLine {
  id: string;
  statementId: string;
  shipmentOrderId: string | null;
  tripId: string | null;
  description: string;
  amount: string;
  createdAt: string;
  shipmentOrder?: { id: string; code: string } | null;
  trip?: { id: string; code: string } | null;
}

export interface ReconciliationStatement {
  id: string;
  branchId: string;
  type: ReconciliationType;
  customerId: string | null;
  carrierId: string | null;
  code: string;
  periodFrom: string;
  periodTo: string;
  status: ReconciliationStatus;
  totalAmount: string;
  reopenReason: string | null;
  createdAt: string;
  lines?: ReconciliationLine[];
  invoice?: Invoice | null;
  accountsPayable?: AccountsPayable | null;
  customer?: { id: string; legalName: string; code: string } | null;
  carrier?: { id: string; legalName: string; code: string } | null;
}

export interface ReceivablePayment {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  recordedAt: string;
}

export interface AccountsReceivable {
  id: string;
  invoiceId: string;
  amount: string;
  paidAmount: string;
  dueDate: string | null;
  status: ReceivableStatus;
  payments?: ReceivablePayment[];
}

export interface Invoice {
  id: string;
  branchId: string;
  customerId: string;
  reconciliationStatementId: string;
  code: string;
  status: InvoiceStatus;
  subtotal: string;
  vatAmount: string;
  total: string;
  dueDate: string | null;
  issuedAt: string | null;
  voidReason: string | null;
  disputeReason: string | null;
  eInvoiceStatus: string | null;
  createdAt: string;
  accountsReceivable?: AccountsReceivable | null;
  customer?: { id: string; legalName: string; code: string };
  reconciliationStatement?: ReconciliationStatement;
}

export interface PayablePayment {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  recordedAt: string;
}

export interface AccountsPayable {
  id: string;
  carrierId: string;
  reconciliationStatementId: string;
  amount: string;
  paidAmount: string;
  dueDate: string | null;
  status: PayableStatus;
  payments?: PayablePayment[];
  carrier?: { id: string; legalName: string; code: string };
}
