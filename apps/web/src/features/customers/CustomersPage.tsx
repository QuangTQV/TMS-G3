import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency } from '../../lib/format';
import { customersApi } from './api';
import type { Customer } from './types';

export function CustomersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['customers'],
    queryFn: ({ pageParam }: { pageParam?: string }) => customersApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo khách hàng'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      code: String(form.get('code')),
      legalName: String(form.get('legalName')),
      taxCode: String(form.get('taxCode')),
      paymentTermDays: form.get('paymentTermDays') ? Number(form.get('paymentTermDays')) : undefined,
      creditLimit: form.get('creditLimit') ? Number(form.get('creditLimit')) : undefined,
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Khách hàng</h1>
        {hasPermission('customer:create') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Khách hàng mới'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Mã khách hàng
              <input name="code" required />
            </label>
            <label>
              Tên pháp nhân
              <input name="legalName" required />
            </label>
            <label>
              Mã số thuế
              <input name="taxCode" required />
            </label>
            <label>
              Hạn thanh toán (ngày)
              <input name="paymentTermDays" type="number" min={0} defaultValue={30} />
            </label>
            <label>
              Hạn mức tín dụng (VND)
              <input name="creditLimit" type="number" min={0} step="1" />
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

      <DataTable<Customer>
        rows={rows}
        rowKey={(c) => c.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có khách hàng nào'}
        columns={[
          { key: 'code', header: 'Mã', render: (c) => <Link to={`/customers/${c.id}`}>{c.code}</Link> },
          { key: 'legalName', header: 'Tên pháp nhân', render: (c) => c.legalName },
          { key: 'taxCode', header: 'MST', render: (c) => c.taxCode },
          { key: 'paymentTermDays', header: 'Hạn TT (ngày)', render: (c) => c.paymentTermDays },
          { key: 'creditLimit', header: 'Hạn mức tín dụng', render: (c) => formatCurrency(c.creditLimit) },
          { key: 'status', header: 'Trạng thái', render: (c) => <StatusBadge status={c.status} /> },
        ]}
      />

      {query.hasNextPage && (
        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
          </button>
        </div>
      )}
    </div>
  );
}
