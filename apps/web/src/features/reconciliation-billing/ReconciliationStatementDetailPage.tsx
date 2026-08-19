import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { shipmentOrdersApi } from '../shipment-orders/api';
import { tripsApi } from '../trips/api';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { reconciliationApi } from './api';
import type { ReconciliationLine } from './types';

export function ReconciliationStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);

  const query = useQuery({
    queryKey: ['reconciliation-statements', id],
    queryFn: () => reconciliationApi.get(id!),
    enabled: Boolean(id),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['reconciliation-statements', id] });

  const ordersQuery = useQuery({
    queryKey: ['shipment-orders', 'select-options'],
    queryFn: () => shipmentOrdersApi.list(),
    enabled: query.data?.type === 'CUSTOMER',
  });
  const tripsQuery = useQuery({
    queryKey: ['trips', 'select-options'],
    queryFn: () => tripsApi.list(),
    enabled: query.data?.type === 'CARRIER',
  });

  const addLineMutation = useMutation({
    mutationFn: (input: { shipmentOrderId?: string; tripId?: string; description: string; amount: number }) =>
      reconciliationApi.addLine(id!, input),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể thêm dòng'),
  });
  const confirmMutation = useMutation({ mutationFn: reconciliationApi.confirm, onSuccess: invalidate });
  const lockMutation = useMutation({ mutationFn: reconciliationApi.lock, onSuccess: invalidate });
  const reopenMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt('Lý do mở lại bảng đối soát?');
      if (!reason) throw new Error('cancelled');
      return reconciliationApi.reopen(id!, reason);
    },
    onSuccess: invalidate,
  });
  const createInvoiceMutation = useMutation({
    mutationFn: (input: { vatAmount: number; dueDate?: string }) =>
      reconciliationApi.createInvoice(id!, input),
    onSuccess: (invoice) => navigate(`/invoices/${invoice.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo hóa đơn'),
  });
  const createApMutation = useMutation({
    mutationFn: () => reconciliationApi.createAccountsPayable(id!, {}),
    onSuccess: (ap) => navigate(`/accounts-payable/${ap.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo công nợ'),
  });

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy bảng đối soát.</p>;
  const statement = query.data;
  const editable = statement.status === 'DRAFT' || statement.status === 'REOPENED';

  function handleAddLine(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    addLineMutation.mutate({
      shipmentOrderId: statement.type === 'CUSTOMER' ? String(form.get('refId')) : undefined,
      tripId: statement.type === 'CARRIER' ? String(form.get('refId')) : undefined,
      description: String(form.get('description')),
      amount: Number(form.get('amount')),
    });
    e.currentTarget.reset();
  }

  function handleCreateInvoice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createInvoiceMutation.mutate({
      vatAmount: Number(form.get('vatAmount')),
      dueDate: form.get('dueDate') ? String(form.get('dueDate')) : undefined,
    });
  }

  return (
    <div>
      <p>
        <Link to="/reconciliation-statements">← Danh sách đối soát</Link>
      </p>
      <div className="page-header">
        <h1>{statement.code}</h1>
        <StatusBadge status={statement.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Loại</dt>
          <dd>{statement.type === 'CUSTOMER' ? 'Khách hàng' : 'Nhà vận tải'}</dd>
          <dt>Đối tượng</dt>
          <dd>{statement.customer?.legalName ?? statement.carrier?.legalName ?? '—'}</dd>
          <dt>Kỳ đối soát</dt>
          <dd>
            {formatDateTime(statement.periodFrom)} — {formatDateTime(statement.periodTo)}
          </dd>
          <dt>Tổng tiền</dt>
          <dd>{formatCurrency(statement.totalAmount)}</dd>
          {statement.reopenReason && (
            <>
              <dt>Lý do mở lại</dt>
              <dd>{statement.reopenReason}</dd>
            </>
          )}
        </dl>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {editable && hasPermission('reconciliation:confirm') && (
            <button className="btn btn-primary" onClick={() => confirmMutation.mutate(id!)}>
              Xác nhận
            </button>
          )}
          {statement.status === 'CONFIRMED' && hasPermission('reconciliation:confirm') && (
            <button className="btn btn-primary" onClick={() => lockMutation.mutate(id!)}>
              Khóa bảng đối soát
            </button>
          )}
          {statement.status === 'LOCKED' &&
            !statement.invoice &&
            !statement.accountsPayable &&
            hasPermission('reconciliation:reopen') && (
              <button className="btn btn-secondary" onClick={() => reopenMutation.mutate()}>
                Mở lại
              </button>
            )}
        </div>
      </div>

      {statement.status === 'LOCKED' && statement.type === 'CUSTOMER' && (
        <div className="panel">
          {statement.invoice ? (
            <p>
              Đã có hóa đơn: <Link to={`/invoices/${statement.invoice.id}`}>{statement.invoice.code}</Link>
            </p>
          ) : hasPermission('invoice:manage') ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowInvoiceForm((v) => !v)}>
                {showInvoiceForm ? 'Đóng' : '+ Tạo hóa đơn từ bảng đối soát này'}
              </button>
              {showInvoiceForm && (
                <form className="form-grid" style={{ marginTop: '0.8rem' }} onSubmit={handleCreateInvoice}>
                  <label>
                    Tiền VAT (VND)
                    <input name="vatAmount" type="number" min={0} required />
                  </label>
                  <label>
                    Hạn thanh toán
                    <input name="dueDate" type="date" />
                  </label>
                  <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                    <button className="btn btn-primary btn-sm" type="submit" disabled={createInvoiceMutation.isPending}>
                      Tạo hóa đơn
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : null}
        </div>
      )}

      {statement.status === 'LOCKED' && statement.type === 'CARRIER' && (
        <div className="panel">
          {statement.accountsPayable ? (
            <p>
              Đã có công nợ phải trả:{' '}
              <Link to={`/accounts-payable/${statement.accountsPayable.id}`}>
                {formatCurrency(statement.accountsPayable.amount)}
              </Link>
            </p>
          ) : (
            hasPermission('accounts-payable:manage') && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => createApMutation.mutate()}
                disabled={createApMutation.isPending}
              >
                Tạo công nợ phải trả từ bảng đối soát này
              </button>
            )
          )}
        </div>
      )}

      <h2>Các dòng đối soát</h2>
      <DataTable<ReconciliationLine>
        rows={statement.lines ?? []}
        rowKey={(l) => l.id}
        emptyMessage="Chưa có dòng nào"
        columns={[
          {
            key: 'ref',
            header: statement.type === 'CUSTOMER' ? 'Đơn' : 'Chuyến',
            render: (l) =>
              l.shipmentOrderId ? (
                <Link to={`/shipment-orders/${l.shipmentOrderId}`}>{l.shipmentOrder?.code ?? l.shipmentOrderId}</Link>
              ) : l.tripId ? (
                <Link to={`/trips/${l.tripId}`}>{l.trip?.code ?? l.tripId}</Link>
              ) : (
                '—'
              ),
          },
          { key: 'description', header: 'Diễn giải', render: (l) => l.description },
          { key: 'amount', header: 'Số tiền', render: (l) => formatCurrency(l.amount) },
        ]}
      />

      {editable && hasPermission('reconciliation:manage') && (
        <form className="panel" onSubmit={handleAddLine}>
          <p className="section-title" style={{ marginTop: 0 }}>
            Thêm dòng đối soát
          </p>
          <div className="form-grid">
            <label>
              {statement.type === 'CUSTOMER' ? 'Đơn vận chuyển' : 'Chuyến'}
              <select name="refId" required defaultValue="">
                <option value="" disabled>
                  Chọn {statement.type === 'CUSTOMER' ? 'đơn' : 'chuyến'}
                </option>
                {statement.type === 'CUSTOMER'
                  ? ordersQuery.data?.items
                      .filter((o) => o.customerId === statement.customerId)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.code}
                        </option>
                      ))
                  : tripsQuery.data?.items
                      .filter((t) => t.carrierId === statement.carrierId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code}
                        </option>
                      ))}
              </select>
            </label>
            <label>
              Diễn giải
              <input name="description" required />
            </label>
            <label>
              Số tiền (VND)
              <input name="amount" type="number" min={0} required />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" type="submit" disabled={addLineMutation.isPending}>
              Thêm dòng
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
