import { api } from '../../lib/api-client';
import type { CreateShipmentOrderInput, ShipmentOrder } from './types';

export const shipmentOrdersApi = {
  list: (cursor?: string) =>
    api.getPage<ShipmentOrder>(
      `/v1/shipment-orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  get: (id: string) => api.get<ShipmentOrder>(`/v1/shipment-orders/${id}`),
  create: (input: CreateShipmentOrderInput) =>
    api.post<ShipmentOrder>('/v1/shipment-orders', input),
  confirm: (id: string) => api.patch<ShipmentOrder>(`/v1/shipment-orders/${id}/confirm`),
  hold: (id: string, reason: string) =>
    api.patch<ShipmentOrder>(`/v1/shipment-orders/${id}/hold`, { reason }),
  cancel: (id: string, reason: string) =>
    api.patch<ShipmentOrder>(`/v1/shipment-orders/${id}/cancel`, { reason }),
};
