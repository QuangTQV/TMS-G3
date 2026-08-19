import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { CustomerSelect } from '../customers/CustomerSelect';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatDateTime } from '../../lib/format';
import { contractsApi } from './api';
import type { Contract } from './types';

export function ContractsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['contracts'],
    queryFn: ({ pageParam }: { pageParam?: string }) => contractsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: contractsApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo hợp đồng'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      code: String(form.get('code')),
      customerId: String(form.get('customerId')),
      effectiveFrom: String(form.get('effectiveFrom')),
      effectiveTo: form.get('effectiveTo') ? String(form.get('effectiveTo')) : undefined,
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Hợp đồng</h1>
        {hasPermission('contract:create') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Hợp đồng mới'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Mã hợp đồng
              <input name="code" required />
            </label>
            <label>
              Khách hàng
              <CustomerSelect name="customerId" required />
            </label>
            <label>
              Hiệu lực từ
              <input name="effectiveFrom" type="date" required />
            </label>
            <label>
              Hiệu lực đến
              <input name="effectiveTo" type="date" />
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

      <DataTable<Contract>
        rows={rows}
        rowKey={(c) => c.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có hợp đồng nào'}
        columns={[
          { key: 'code', header: 'Mã', render: (c) => <Link to={`/contracts/${c.id}`}>{c.code}</Link> },
          { key: 'effectiveFrom', header: 'Hiệu lực từ', render: (c) => formatDateTime(c.effectiveFrom) },
          { key: 'effectiveTo', header: 'Hiệu lực đến', render: (c) => formatDateTime(c.effectiveTo) },
          { key: 'status', header: 'Trạng thái', render: (c) => <StatusBadge status={c.status} /> },
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
