import { api } from '../../lib/api-client';
import type {
  Customer,
  CreateCustomerInput,
  SetCustomerStatusInput,
  UpdateCreditTermsInput,
} from './types';

export const customersApi = {
  list: (cursor?: string) =>
    api.getPage<Customer>(
      `/v1/customers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  get: (id: string) => api.get<Customer>(`/v1/customers/${id}`),
  create: (input: CreateCustomerInput) =>
    api.post<Customer>('/v1/customers', input),
  updateCreditTerms: (id: string, input: UpdateCreditTermsInput) =>
    api.patch<Customer>(`/v1/customers/${id}/credit-terms`, input),
  setStatus: (id: string, input: SetCustomerStatusInput) =>
    api.patch<Customer>(`/v1/customers/${id}/status`, input),
};
