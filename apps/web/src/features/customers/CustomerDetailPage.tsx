import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { customersApi } from './api';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customersApi.get(id!),
    enabled: Boolean(id),
  });

  const creditMutation = useMutation({
    mutationFn: (input: { paymentTermDays?: number; creditLimit?: number; reason: string }) =>
      customersApi.updateCreditTerms(id!, input),
    onSuccess: () => {
      setShowCreditForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['customers', id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể cập nhật'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'LOCKED') => {
      const reason = window.prompt(
        status === 'LOCKED' ? 'Lý do khóa khách hàng?' : 'Lý do mở khóa khách hàng?',
      );
      if (!reason) throw new Error('cancelled');
      return customersApi.setStatus(id!, { status, reason });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['customers', id] }),
  });

  function handleCreditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    creditMutation.mutate({
      paymentTermDays: form.get('paymentTermDays') ? Number(form.get('paymentTermDays')) : undefined,
      creditLimit: form.get('creditLimit') ? Number(form.get('creditLimit')) : undefined,
      reason: String(form.get('reason')),
    });
  }

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy khách hàng.</p>;

  const customer = query.data;

  return (
    <div>
      <p>
        <Link to="/customers">← Danh sách khách hàng</Link>
      </p>
      <div className="page-header">
        <h1>{customer.legalName}</h1>
        <StatusBadge status={customer.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Mã khách hàng</dt>
          <dd>{customer.code}</dd>
          <dt>Mã số thuế</dt>
          <dd>{customer.taxCode}</dd>
          <dt>Hạn thanh toán</dt>
          <dd>{customer.paymentTermDays} ngày</dd>
          <dt>Hạn mức tín dụng</dt>
          <dd>{formatCurrency(customer.creditLimit)}</dd>
          <dt>Tạo lúc</dt>
          <dd>{formatDateTime(customer.createdAt)}</dd>
        </dl>

        {hasPermission('customer:manage-credit') && (
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowCreditForm((v) => !v)}>
              Sửa điều khoản thanh toán
            </button>
            <button
              className="btn btn-danger"
              onClick={() =>
                statusMutation.mutate(customer.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE')
              }
            >
              {customer.status === 'ACTIVE' ? 'Khóa khách hàng' : 'Mở khóa khách hàng'}
            </button>
          </div>
        )}
      </div>

      {showCreditForm && (
        <form className="panel" onSubmit={handleCreditSubmit}>
          <div className="form-grid">
            <label>
              Hạn thanh toán (ngày)
              <input name="paymentTermDays" type="number" min={0} defaultValue={customer.paymentTermDays} />
            </label>
            <label>
              Hạn mức tín dụng (VND)
              <input name="creditLimit" type="number" min={0} defaultValue={customer.creditLimit ?? ''} />
            </label>
          </div>
          <label>
            Lý do thay đổi (bắt buộc, phục vụ audit log)
            <input name="reason" required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={creditMutation.isPending}>
              Lưu
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
