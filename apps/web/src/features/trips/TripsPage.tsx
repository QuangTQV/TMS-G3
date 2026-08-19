import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../lib/auth-context';
import { tripsApi } from './api';
import type { Trip } from './types';

export function TripsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const query = useInfiniteQuery({
    queryKey: ['trips'],
    queryFn: ({ pageParam }: { pageParam?: string }) => tripsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: () => tripsApi.create({}),
    onSuccess: (trip) => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      navigate(`/trips/${trip.id}`);
    },
  });

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Chuyến vận tải</h1>
        {hasPermission('trip:create') && (
          <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            + Chuyến mới
          </button>
        )}
      </div>

      <DataTable<Trip>
        rows={rows}
        rowKey={(t) => t.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có chuyến nào'}
        columns={[
          { key: 'code', header: 'Mã chuyến', render: (t) => <Link to={`/trips/${t.id}`}>{t.code}</Link> },
          { key: 'source', header: 'Nguồn lực', render: (t) => (t.isOutsourced ? 'Thuê ngoài' : 'Nội bộ') },
          { key: 'status', header: 'Trạng thái', render: (t) => <StatusBadge status={t.status} /> },
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
