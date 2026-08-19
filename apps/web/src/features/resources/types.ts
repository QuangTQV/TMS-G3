export interface Vehicle {
  id: string;
  branchId: string;
  plateNumber: string;
  vehicleType: string;
  loadCapacityKg: string | null;
  isMaintenance: boolean;
  maintenanceUntil: string | null;
  createdAt: string;
}

export interface Driver {
  id: string;
  branchId: string;
  carrierId: string | null;
  fullName: string;
  phone: string;
  licenseNumber: string;
  isActive: boolean;
  createdAt: string;
}

export interface Carrier {
  id: string;
  branchId: string;
  code: string;
  legalName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}
