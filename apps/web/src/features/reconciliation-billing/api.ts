import { api } from '../../lib/api-client';
import type {
  AccountsPayable,
  Invoice,
  ReconciliationLine,
  ReconciliationStatement,
  ReconciliationType,
} from './types';

export const reconciliationApi = {
  list: (cursor?: string, type?: ReconciliationType) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (type) params.set('type', type);
    const qs = params.toString();
    return api.getPage<ReconciliationStatement>(
      `/v1/reconciliation-statements${qs ? `?${qs}` : ''}`,
    );
  },
  get: (id: string) => api.get<ReconciliationStatement>(`/v1/reconciliation-statements/${id}`),
  create: (input: {
    type: ReconciliationType;
    customerId?: string;
    carrierId?: string;
    periodFrom: string;
    periodTo: string;
  }) => api.post<ReconciliationStatement>('/v1/reconciliation-statements', input),
  addLine: (
    id: string,
    input: { shipmentOrderId?: string; tripId?: string; description: string; amount: number },
  ) => api.post<ReconciliationLine>(`/v1/reconciliation-statements/${id}/lines`, input),
  confirm: (id: string) =>
    api.patch<ReconciliationStatement>(`/v1/reconciliation-statements/${id}/confirm`),
  lock: (id: string) =>
    api.patch<ReconciliationStatement>(`/v1/reconciliation-statements/${id}/lock`),
  reopen: (id: string, reason: string) =>
    api.patch<ReconciliationStatement>(`/v1/reconciliation-statements/${id}/reopen`, { reason }),
  createInvoice: (id: string, input: { vatAmount: number; dueDate?: string }) =>
    api.post<Invoice>(`/v1/reconciliation-statements/${id}/invoice`, input),
  createAccountsPayable: (id: string, input: { dueDate?: string }) =>
    api.post<AccountsPayable>(`/v1/reconciliation-statements/${id}/accounts-payable`, input),
};

export const invoicesApi = {
  list: (cursor?: string) =>
    api.getPage<Invoice>(`/v1/invoices${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  get: (id: string) => api.get<Invoice>(`/v1/invoices/${id}`),
  submit: (id: string) => api.patch<Invoice>(`/v1/invoices/${id}/submit`),
  issue: (id: string) => api.patch<Invoice>(`/v1/invoices/${id}/issue`),
  void: (id: string, reason: string) => api.patch<Invoice>(`/v1/invoices/${id}/void`, { reason }),
  markDisputed: (id: string, reason: string) =>
    api.patch<Invoice>(`/v1/invoices/${id}/mark-disputed`, { reason }),
  recordPayment: (id: string, input: { amount: number; method: string; reference?: string }) =>
    api.post<Invoice>(`/v1/invoices/${id}/payments`, input),
};

export const accountsPayableApi = {
  list: (cursor?: string) =>
    api.getPage<AccountsPayable>(
      `/v1/accounts-payable${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  get: (id: string) => api.get<AccountsPayable>(`/v1/accounts-payable/${id}`),
  recordPayment: (id: string, input: { amount: number; method: string; reference?: string }) =>
    api.post<AccountsPayable>(`/v1/accounts-payable/${id}/payments`, input),
};
