import { api } from '../../lib/api-client';
import type { Carrier, Driver, Vehicle } from './types';

export const vehiclesApi = {
  list: (cursor?: string) =>
    api.getPage<Vehicle>(`/v1/vehicles${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  create: (input: { plateNumber: string; vehicleType: string; loadCapacityKg?: number }) =>
    api.post<Vehicle>('/v1/vehicles', input),
  setMaintenance: (id: string, input: { isMaintenance: boolean; maintenanceUntil?: string }) =>
    api.patch<Vehicle>(`/v1/vehicles/${id}/maintenance`, input),
};

export const driversApi = {
  list: (cursor?: string) =>
    api.getPage<Driver>(`/v1/drivers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  create: (input: { fullName: string; phone: string; licenseNumber: string; carrierId?: string }) =>
    api.post<Driver>('/v1/drivers', input),
};

export const carriersApi = {
  list: (cursor?: string) =>
    api.getPage<Carrier>(`/v1/carriers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  create: (input: { code: string; legalName: string }) => api.post<Carrier>('/v1/carriers', input),
};
