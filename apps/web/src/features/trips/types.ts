export type TripStatus =
  | 'PLANNED'
  | 'DISPATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED_PENDING_DOCS'
  | 'COMPLETED_VERIFIED'
  | 'CLOSED'
  | 'PAUSED'
  | 'CANCELLED'
  | 'EXCEPTION';

export interface TripOrderLink {
  id: string;
  tripId: string;
  shipmentOrderId: string;
  splitReason: string | null;
  shipmentOrder?: { id: string; code: string; status: string };
}

export interface Trip {
  id: string;
  branchId: string;
  code: string;
  status: TripStatus;
  vehicleId: string | null;
  driverId: string | null;
  carrierId: string | null;
  isOutsourced: boolean;
  pauseReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  orderLinks?: TripOrderLink[];
  vehicle?: { id: string; plateNumber: string } | null;
  driver?: { id: string; fullName: string } | null;
  carrier?: { id: string; legalName: string } | null;
}
