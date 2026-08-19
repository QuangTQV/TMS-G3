import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { carriersApi } from './api';
import type { Carrier } from './types';

export function CarriersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['carriers'],
    queryFn: ({ pageParam }: { pageParam?: string }) => carriersApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: carriersApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['carriers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo nhà vận tải'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      code: String(form.get('code')),
      legalName: String(form.get('legalName')),
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Nhà vận tải</h1>
        {hasPermission('resource:manage') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Nhà vận tải mới'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Mã
              <input name="code" required />
            </label>
            <label>
              Tên pháp nhân
              <input name="legalName" required />
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

      <DataTable<Carrier>
        rows={rows}
        rowKey={(c) => c.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có nhà vận tải nào'}
        columns={[
          { key: 'code', header: 'Mã', render: (c) => c.code },
          { key: 'legalName', header: 'Tên pháp nhân', render: (c) => c.legalName },
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
