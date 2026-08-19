export interface PriceListLine {
  id: string;
  originLabel: string;
  destLabel: string;
  vehicleType: string | null;
  unitPrice: string;
  unit: string;
}

export interface Surcharge {
  id: string;
  type: string;
  name: string;
  amount: string;
  isPercent: boolean;
}

export interface PriceList {
  id: string;
  contractId: string;
  version: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUPERSEDED';
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedAt: string | null;
  lines?: PriceListLine[];
  surcharges?: Surcharge[];
}

export interface Contract {
  id: string;
  branchId: string;
  customerId: string;
  code: string;
  status: 'DRAFT' | 'SIGNED' | 'EXPIRED' | 'TERMINATED';
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  priceLists?: PriceList[];
}

export interface QuoteLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Quote {
  id: string;
  branchId: string;
  customerId: string;
  contractId: string | null;
  code: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  sellTotal: string;
  estimatedBuyTotal: string | null;
  validUntil: string | null;
  createdAt: string;
  lines?: QuoteLine[];
}

export interface PriceListLineInput {
  originLabel: string;
  destLabel: string;
  vehicleType?: string;
  unitPrice: number;
  unit: string;
}

export interface SurchargeInput {
  type: string;
  name: string;
  amount: number;
  isPercent?: boolean;
}

export interface QuoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}
