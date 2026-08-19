export interface Customer {
  id: string;
  branchId: string;
  code: string;
  legalName: string;
  taxCode: string;
  status: 'ACTIVE' | 'LOCKED';
  paymentTermDays: number;
  creditLimit: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  code: string;
  legalName: string;
  taxCode: string;
  paymentTermDays?: number;
  creditLimit?: number;
}

export interface UpdateCreditTermsInput {
  paymentTermDays?: number;
  creditLimit?: number;
  reason: string;
}

export interface SetCustomerStatusInput {
  status: 'ACTIVE' | 'LOCKED';
  reason: string;
}
