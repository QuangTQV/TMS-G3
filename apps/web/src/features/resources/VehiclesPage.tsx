import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { vehiclesApi } from './api';
import type { Vehicle } from './types';

export function VehiclesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['vehicles'],
    queryFn: ({ pageParam }: { pageParam?: string }) => vehiclesApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: vehiclesApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo xe'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, isMaintenance }: { id: string; isMaintenance: boolean }) =>
      vehiclesApi.setMaintenance(id, { isMaintenance }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      plateNumber: String(form.get('plateNumber')),
      vehicleType: String(form.get('vehicleType')),
      loadCapacityKg: form.get('loadCapacityKg') ? Number(form.get('loadCapacityKg')) : undefined,
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Xe</h1>
        {hasPermission('resource:manage') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Xe mới'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Biển số
              <input name="plateNumber" required />
            </label>
            <label>
              Loại xe
              <input name="vehicleType" required placeholder="VD: Container 40ft" />
            </label>
            <label>
              Tải trọng (kg)
              <input name="loadCapacityKg" type="number" min={0} />
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

      <DataTable<Vehicle>
        rows={rows}
        rowKey={(v) => v.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có xe nào'}
        columns={[
          { key: 'plateNumber', header: 'Biển số', render: (v) => v.plateNumber },
          { key: 'vehicleType', header: 'Loại xe', render: (v) => v.vehicleType },
          { key: 'loadCapacityKg', header: 'Tải trọng (kg)', render: (v) => v.loadCapacityKg ?? '—' },
          {
            key: 'status',
            header: 'Trạng thái',
            render: (v) => <StatusBadge status={v.isMaintenance ? 'MAINTENANCE' : 'ACTIVE'} />,
          },
          {
            key: 'actions',
            header: '',
            render: (v) =>
              hasPermission('resource:manage') ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    maintenanceMutation.mutate({ id: v.id, isMaintenance: !v.isMaintenance })
                  }
                >
                  {v.isMaintenance ? 'Kết thúc bảo trì' : 'Đưa vào bảo trì'}
                </button>
              ) : null,
          },
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
