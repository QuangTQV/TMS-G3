import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { driversApi } from './api';
import type { Driver } from './types';

export function DriversPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['drivers'],
    queryFn: ({ pageParam }: { pageParam?: string }) => driversApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: driversApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo tài xế'),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      fullName: String(form.get('fullName')),
      phone: String(form.get('phone')),
      licenseNumber: String(form.get('licenseNumber')),
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Tài xế</h1>
        {hasPermission('resource:manage') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Tài xế mới'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Họ tên
              <input name="fullName" required />
            </label>
            <label>
              Số điện thoại
              <input name="phone" required />
            </label>
            <label>
              Số giấy phép lái xe
              <input name="licenseNumber" required />
            </label>
          </div>
          <p className="empty-state" style={{ padding: '0.5rem 0', textAlign: 'left' }}>
            Không chọn nhà vận tải = tài xế nội bộ G3.
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={createMutation.isPending}>
              Lưu
            </button>
          </div>
        </form>
      )}

      <DataTable<Driver>
        rows={rows}
        rowKey={(d) => d.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có tài xế nào'}
        columns={[
          { key: 'fullName', header: 'Họ tên', render: (d) => d.fullName },
          { key: 'phone', header: 'SĐT', render: (d) => d.phone },
          { key: 'licenseNumber', header: 'GPLX', render: (d) => d.licenseNumber },
          { key: 'source', header: 'Nguồn', render: (d) => (d.carrierId ? 'Nhà vận tải' : 'Nội bộ G3') },
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
