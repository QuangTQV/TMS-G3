import { api } from '../../lib/api-client';
import type {
  Contract,
  PriceList,
  PriceListLineInput,
  Quote,
  QuoteLineInput,
  SurchargeInput,
} from './types';

export const contractsApi = {
  list: (cursor?: string) =>
    api.getPage<Contract>(`/v1/contracts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  get: (id: string) => api.get<Contract>(`/v1/contracts/${id}`),
  create: (input: { code: string; customerId: string; effectiveFrom: string; effectiveTo?: string }) =>
    api.post<Contract>('/v1/contracts', input),
};

export const priceListsApi = {
  create: (input: {
    contractId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    lines: PriceListLineInput[];
    surcharges: SurchargeInput[];
  }) => api.post<PriceList>('/v1/price-lists', input),
  approve: (id: string) => api.patch<PriceList>(`/v1/price-lists/${id}/approve`),
};

export const quotesApi = {
  list: (cursor?: string) =>
    api.getPage<Quote>(`/v1/quotes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  get: (id: string) => api.get<Quote>(`/v1/quotes/${id}`),
  create: (input: {
    customerId: string;
    contractId?: string;
    estimatedBuyTotal?: number;
    validUntil?: string;
    lines: QuoteLineInput[];
  }) => api.post<Quote>('/v1/quotes', input),
  approveAndSend: (id: string) => api.patch<Quote>(`/v1/quotes/${id}/approve-and-send`),
  accept: (id: string) => api.patch<Quote>(`/v1/quotes/${id}/accept`),
  reject: (id: string, reason: string) => api.patch<Quote>(`/v1/quotes/${id}/reject`, { reason }),
  convertToOrder: (id: string) => api.post<{ id: string }>(`/v1/quotes/${id}/convert-to-order`),
};
