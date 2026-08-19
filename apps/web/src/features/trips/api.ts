import { api } from "../../lib/api-client";
import type { Trip } from "./types";
import type { Carrier, Driver, Vehicle } from "../resources/types";

export interface VehicleSuggestion {
  vehicle: Vehicle;
  fitsCapacity: boolean | null;
  excessCapacityKg: number | null;
  busy: boolean;
  warnings: string[];
}

export interface DriverSuggestion {
  driver: Driver;
  busy: boolean;
}

export interface CarrierSuggestion {
  carrier: Carrier;
  busy: boolean;
}

export interface ResourceSuggestions {
  requiredWeightKg: number | null;
  vehicles: VehicleSuggestion[];
  drivers: DriverSuggestion[];
  carriers: CarrierSuggestion[];
}

export interface TripFinancialSummary {
  tripId: string;
  plans: Array<{
    id: string;
    category: string;
    description: string;
    amount: string;
  }>;
  actuals: Array<{
    id: string;
    category: string;
    description: string;
    amount: string;
    status: string;
  }>;
  advances: Array<{
    id: string;
    recipientName: string;
    amount: string;
    purpose: string;
    status: string;
  }>;
  totals: { planned: number; actualApproved: number; advancePaid: number };
}

export const tripsApi = {
  list: (cursor?: string) =>
    api.getPage<Trip>(
      `/v1/trips${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  get: (id: string) => api.get<Trip>(`/v1/trips/${id}`),
  suggestResources: (id: string) =>
    api.get<ResourceSuggestions>(`/v1/trips/${id}/resource-suggestions`),
  create: (input: { isOutsourced?: boolean }) =>
    api.post<Trip>("/v1/trips", input),
  linkOrder: (
    id: string,
    input: { shipmentOrderId: string; splitReason?: string },
  ) => api.post<Trip>(`/v1/trips/${id}/orders`, input),
  assignResource: (
    id: string,
    input: { vehicleId?: string; driverId?: string; carrierId?: string },
  ) => api.patch<Trip>(`/v1/trips/${id}/resource`, input),
  dispatch: (id: string) => api.patch<Trip>(`/v1/trips/${id}/dispatch`),
  start: (id: string) => api.patch<Trip>(`/v1/trips/${id}/start`),
  complete: (id: string) => api.patch<Trip>(`/v1/trips/${id}/complete`),
  pause: (id: string, reason: string) =>
    api.patch<Trip>(`/v1/trips/${id}/pause`, { reason }),
  resume: (id: string) => api.patch<Trip>(`/v1/trips/${id}/resume`),
  cancel: (id: string, reason: string) =>
    api.patch<Trip>(`/v1/trips/${id}/cancel`, { reason }),
};

export const tripFinancialsApi = {
  get: (tripId: string) =>
    api.get<TripFinancialSummary>(`/v1/trips/${tripId}/financials`),
  createPlan: (
    tripId: string,
    input: { category: string; description: string; amount: number },
  ) => api.post(`/v1/trips/${tripId}/financials/plans`, input),
  createActual: (
    tripId: string,
    input: {
      category: string;
      description: string;
      amount: number;
      incurredAt: string;
    },
  ) => api.post(`/v1/trips/${tripId}/financials/actuals`, input),
  createAdvance: (
    tripId: string,
    input: { recipientName: string; amount: number; purpose: string },
  ) => api.post(`/v1/trips/${tripId}/financials/advances`, input),
  submitActual: (id: string) => api.post(`/v1/financials/actuals/${id}/submit`),
  approveActual: (id: string) =>
    api.post(`/v1/financials/actuals/${id}/approve`),
  approveAdvance: (id: string) =>
    api.post(`/v1/financials/advances/${id}/approve`),
  payAdvance: (id: string) => api.post(`/v1/financials/advances/${id}/pay`),
  settleAdvance: (id: string) =>
    api.post(`/v1/financials/advances/${id}/settle`),
};
