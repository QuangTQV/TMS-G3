import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { CarrierSelect } from '../resources/CarrierSelect';
import { CustomerSelect } from '../customers/CustomerSelect';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { reconciliationApi } from './api';
import type { ReconciliationStatement, ReconciliationType } from './types';

export function ReconciliationStatementsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ReconciliationType>('CUSTOMER');
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['reconciliation-statements'],
    queryFn: ({ pageParam }: { pageParam?: string }) => reconciliationApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: reconciliationApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['reconciliation-statements'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo bảng đối soát'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      type,
      customerId: type === 'CUSTOMER' ? String(form.get('customerId')) : undefined,
      carrierId: type === 'CARRIER' ? String(form.get('carrierId')) : undefined,
      periodFrom: String(form.get('periodFrom')),
      periodTo: String(form.get('periodTo')),
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Đối soát & bảng kê</h1>
        {hasPermission('reconciliation:manage') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Bảng đối soát mới'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Loại đối soát
              <select value={type} onChange={(e) => setType(e.target.value as ReconciliationType)}>
                <option value="CUSTOMER">Khách hàng</option>
                <option value="CARRIER">Nhà vận tải</option>
              </select>
            </label>
            {type === 'CUSTOMER' ? (
              <label>
                Khách hàng
                <CustomerSelect name="customerId" required />
              </label>
            ) : (
              <label>
                Nhà vận tải
                <CarrierSelect name="carrierId" required />
              </label>
            )}
            <label>
              Từ ngày
              <input name="periodFrom" type="date" required />
            </label>
            <label>
              Đến ngày
              <input name="periodTo" type="date" required />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={createMutation.isPending}>
              Lưu
            </button>
          </div>
        </form>
      )}

      <DataTable<ReconciliationStatement>
        rows={rows}
        rowKey={(s) => s.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có bảng đối soát nào'}
        columns={[
          {
            key: 'code',
            header: 'Mã',
            render: (s) => <Link to={`/reconciliation-statements/${s.id}`}>{s.code}</Link>,
          },
          { key: 'type', header: 'Loại', render: (s) => (s.type === 'CUSTOMER' ? 'Khách hàng' : 'Nhà vận tải') },
          { key: 'period', header: 'Kỳ', render: (s) => `${formatDateTime(s.periodFrom)} — ${formatDateTime(s.periodTo)}` },
          { key: 'total', header: 'Tổng tiền', render: (s) => formatCurrency(s.totalAmount) },
          { key: 'status', header: 'Trạng thái', render: (s) => <StatusBadge status={s.status} /> },
        ]}
      />

      {query.hasNextPage && (
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => void query.fetchNextPage()}>
            Tải thêm
          </button>
        </div>
      )}
    </div>
  );
}
