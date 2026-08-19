import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { formatCurrency } from '../../lib/format';
import { accountsPayableApi } from './api';
import type { AccountsPayable } from './types';

export function AccountsPayablePage() {
  const query = useInfiniteQuery({
    queryKey: ['accounts-payable'],
    queryFn: ({ pageParam }: { pageParam?: string }) => accountsPayableApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Công nợ phải trả nhà vận tải</h1>
      </div>

      <DataTable<AccountsPayable>
        rows={rows}
        rowKey={(a) => a.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có công nợ nào'}
        columns={[
          {
            key: 'id',
            header: 'Mã',
            render: (a) => <Link to={`/accounts-payable/${a.id}`}>{a.id.slice(0, 8)}</Link>,
          },
          { key: 'amount', header: 'Số tiền', render: (a) => formatCurrency(a.amount) },
          { key: 'paidAmount', header: 'Đã trả', render: (a) => formatCurrency(a.paidAmount) },
          { key: 'status', header: 'Trạng thái', render: (a) => <StatusBadge status={a.status} /> },
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
