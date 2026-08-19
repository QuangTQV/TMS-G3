import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { accountsPayableApi } from './api';
import type { PayablePayment } from './types';

export function AccountsPayableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const query = useQuery({
    queryKey: ['accounts-payable', id],
    queryFn: () => accountsPayableApi.get(id!),
    enabled: Boolean(id),
  });

  const paymentMutation = useMutation({
    mutationFn: (input: { amount: number; method: string; reference?: string }) =>
      accountsPayableApi.recordPayment(id!, input),
    onSuccess: () => {
      setShowPaymentForm(false);
      void queryClient.invalidateQueries({ queryKey: ['accounts-payable', id] });
    },
  });

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy công nợ.</p>;
  const payable = query.data;
  const remaining = Number(payable.amount) - Number(payable.paidAmount);

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
        <Link to="/accounts-payable">← Danh sách công nợ phải trả</Link>
      </p>
      <div className="page-header">
        <h1>Công nợ {payable.carrier?.legalName ?? ''}</h1>
        <StatusBadge status={payable.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Số tiền</dt>
          <dd>{formatCurrency(payable.amount)}</dd>
          <dt>Đã trả</dt>
          <dd>{formatCurrency(payable.paidAmount)}</dd>
          <dt>Còn lại</dt>
          <dd>{formatCurrency(remaining)}</dd>
          <dt>Hạn thanh toán</dt>
          <dd>{formatDateTime(payable.dueDate)}</dd>
        </dl>

        {remaining > 0 && hasPermission('accounts-payable:record-payment') && (
          <div className="form-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPaymentForm((v) => !v)}>
              {showPaymentForm ? 'Đóng' : '+ Ghi nhận thanh toán'}
            </button>
          </div>
        )}

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
      </div>

      <h2>Lịch sử thanh toán</h2>
      <DataTable<PayablePayment>
        rows={payable.payments ?? []}
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
  );
}
