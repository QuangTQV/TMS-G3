import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { formatCurrency } from '../../lib/format';
import { invoicesApi } from './api';
import type { Invoice } from './types';

export function InvoicesPage() {
  const query = useInfiniteQuery({
    queryKey: ['invoices'],
    queryFn: ({ pageParam }: { pageParam?: string }) => invoicesApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Hóa đơn</h1>
      </div>

      <DataTable<Invoice>
        rows={rows}
        rowKey={(i) => i.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có hóa đơn nào'}
        columns={[
          { key: 'code', header: 'Mã', render: (i) => <Link to={`/invoices/${i.id}`}>{i.code}</Link> },
          { key: 'total', header: 'Tổng tiền', render: (i) => formatCurrency(i.total) },
          { key: 'status', header: 'Trạng thái', render: (i) => <StatusBadge status={i.status} /> },
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
