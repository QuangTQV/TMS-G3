export type ShipmentOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PLANNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'HELD';

export interface PickupDeliveryPoint {
  id: string;
  type: 'PICKUP' | 'DELIVERY';
  sequence: number;
  freeAddress: string | null;
  containerNumber: string | null;
  sealNumber: string | null;
}

export interface Cargo {
  id: string;
  description: string;
  packageCount: number | null;
  weightKg: string | null;
  volumeCbm: string | null;
}

export interface ShipmentOrder {
  id: string;
  branchId: string;
  code: string;
  customerId: string;
  quoteId: string | null;
  customerRef: string | null;
  sourceChannel: string;
  status: ShipmentOrderStatus;
  sellTotal: string;
  estimatedBuyTotal: string | null;
  cancelReason: string | null;
  createdAt: string;
  points?: PickupDeliveryPoint[];
  cargos?: Cargo[];
}

export interface CreatePointInput {
  type: 'PICKUP' | 'DELIVERY';
  sequence: number;
  freeAddress: string;
  containerNumber?: string;
  sealNumber?: string;
}

export interface CreateCargoInput {
  description: string;
  packageCount?: number;
  weightKg?: number;
}

export interface CreateShipmentOrderInput {
  customerId: string;
  customerRef?: string;
  sourceChannel: string;
  sellTotal: number;
  estimatedBuyTotal?: number;
  points: CreatePointInput[];
  cargos: CreateCargoInput[];
}
