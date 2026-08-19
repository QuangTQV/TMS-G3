import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { invoicesApi } from './api';
import type { ReceivablePayment } from './types';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const query = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => invoicesApi.get(id!),
    enabled: Boolean(id),
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['invoices', id] });

  const submitMutation = useMutation({ mutationFn: () => invoicesApi.submit(id!), onSuccess: invalidate });
  const issueMutation = useMutation({ mutationFn: () => invoicesApi.issue(id!), onSuccess: invalidate });
  const voidMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt('Lý do hủy hóa đơn?');
      if (!reason) throw new Error('cancelled');
      return invoicesApi.void(id!, reason);
    },
    onSuccess: invalidate,
  });
  const disputeMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt('Lý do tranh chấp?');
      if (!reason) throw new Error('cancelled');
      return invoicesApi.markDisputed(id!, reason);
    },
    onSuccess: invalidate,
  });
  const paymentMutation = useMutation({
    mutationFn: (input: { amount: number; method: string; reference?: string }) =>
      invoicesApi.recordPayment(id!, input),
    onSuccess: () => {
      setShowPaymentForm(false);
      invalidate();
    },
  });

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy hóa đơn.</p>;
  const invoice = query.data;
  const actionError =
    submitMutation.error || issueMutation.error || voidMutation.error || disputeMutation.error || paymentMutation.error;
  const remaining = invoice.accountsReceivable
    ? Number(invoice.accountsReceivable.amount) - Number(invoice.accountsReceivable.paidAmount)
    : 0;

  function handlePayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    paymentMutation.mutate({
      amount: Number(form.get('amount')),
      method: String(form.get('method')),
      reference: form.get('reference') ? String(form.get('reference')) : undefined,
    });
  }

  return (
    <div>
      <p>
        <Link to="/invoices">← Danh sách hóa đơn</Link>
      </p>
      <div className="page-header">
        <h1>{invoice.code}</h1>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Khách hàng</dt>
          <dd>{invoice.customer?.legalName ?? '—'}</dd>
          <dt>Tạm tính</dt>
          <dd>{formatCurrency(invoice.subtotal)}</dd>
          <dt>VAT</dt>
          <dd>{formatCurrency(invoice.vatAmount)}</dd>
          <dt>Tổng cộng</dt>
          <dd>{formatCurrency(invoice.total)}</dd>
          <dt>Ngày phát hành</dt>
          <dd>{formatDateTime(invoice.issuedAt)}</dd>
          <dt>Tích hợp hóa đơn điện tử</dt>
          <dd>{invoice.eInvoiceStatus ?? '—'}</dd>
          {invoice.voidReason && (
            <>
              <dt>Lý do hủy</dt>
              <dd>{invoice.voidReason}</dd>
            </>
          )}
          {invoice.disputeReason && (
            <>
              <dt>Lý do tranh chấp</dt>
              <dd>{invoice.disputeReason}</dd>
            </>
          )}
        </dl>

        {actionError instanceof ApiError && <p className="form-error">{actionError.message}</p>}

        <div className="form-actions">
          {invoice.status === 'DRAFT' && hasPermission('invoice:manage') && (
            <button className="btn btn-primary" onClick={() => submitMutation.mutate()}>
              Trình duyệt
            </button>
          )}
          {invoice.status === 'PENDING_APPROVAL' && hasPermission('invoice:issue') && (
            <button className="btn btn-primary" onClick={() => issueMutation.mutate()}>
              Phát hành
            </button>
          )}
          {!['PAID', 'VOIDED', 'REPLACED'].includes(invoice.status) && hasPermission('invoice:void') && (
            <button className="btn btn-danger" onClick={() => voidMutation.mutate()}>
              Hủy hóa đơn
            </button>
          )}
          {['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status) && hasPermission('invoice:manage') && (
            <button className="btn btn-secondary" onClick={() => disputeMutation.mutate()}>
              Đánh dấu tranh chấp
            </button>
          )}
        </div>
      </div>

      {invoice.accountsReceivable && (
        <div className="panel">
          <div className="page-header">
            <p className="section-title" style={{ margin: 0 }}>
              Công nợ phải thu — còn lại {formatCurrency(remaining)}
            </p>
            {remaining > 0 && hasPermission('invoice:record-payment') && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPaymentForm((v) => !v)}>
                {showPaymentForm ? 'Đóng' : '+ Ghi nhận thanh toán'}
              </button>
            )}
          </div>

          {showPaymentForm && (
            <form className="form-grid" onSubmit={handlePayment}>
              <label>
                Số tiền (VND)
                <input name="amount" type="number" min={0} max={remaining} required />
              </label>
              <label>
                Hình thức
                <input name="method" placeholder="chuyển khoản, tiền mặt…" required />
              </label>
              <label>
                Tham chiếu
                <input name="reference" placeholder="số UNC, mã giao dịch…" />
              </label>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary btn-sm" type="submit" disabled={paymentMutation.isPending}>
                  Lưu
                </button>
              </div>
            </form>
          )}

          <DataTable<ReceivablePayment>
            rows={invoice.accountsReceivable.payments ?? []}
            rowKey={(p) => p.id}
            emptyMessage="Chưa có thanh toán nào"
            columns={[
              { key: 'amount', header: 'Số tiền', render: (p) => formatCurrency(p.amount) },
              { key: 'method', header: 'Hình thức', render: (p) => p.method },
              { key: 'reference', header: 'Tham chiếu', render: (p) => p.reference ?? '—' },
              { key: 'recordedAt', header: 'Thời gian', render: (p) => formatDateTime(p.recordedAt) },
            ]}
          />
        </div>
      )}
    </div>
  );
}
