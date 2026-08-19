import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { CustomerSelect } from '../customers/CustomerSelect';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency } from '../../lib/format';
import { quotesApi } from './api';
import type { Quote, QuoteLineInput } from './types';

const EMPTY_LINE: QuoteLineInput = { description: '', quantity: 1, unitPrice: 0 };

export function QuotesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<QuoteLineInput[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['quotes'],
    queryFn: ({ pageParam }: { pageParam?: string }) => quotesApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: quotesApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setLines([{ ...EMPTY_LINE }]);
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo báo giá'),
  });

  function handleSubmit() {
    setError(null);
    createMutation.mutate({ customerId, lines });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Báo giá</h1>
        {hasPermission('quote:create') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Báo giá mới'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="panel">
          <div className="form-grid">
            <label>
              Khách hàng
              <CustomerSelect value={customerId} onChange={setCustomerId} required />
            </label>
          </div>

          <p className="section-title">Hạng mục báo giá</p>
          {lines.map((line, i) => (
            <div className="form-grid" key={i}>
              <label>
                Mô tả
                <input
                  value={line.description}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))
                  }
                  required
                />
              </label>
              <label>
                Số lượng
                <input
                  type="number"
                  min={0}
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l, j) => (j === i ? { ...l, quantity: Number(e.target.value) } : l)),
                    )
                  }
                  required
                />
              </label>
              <label>
                Đơn giá
                <input
                  type="number"
                  min={0}
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l, j) => (j === i ? { ...l, unitPrice: Number(e.target.value) } : l)),
                    )
                  }
                  required
                />
              </label>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  Xóa dòng
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
          >
            + Thêm hạng mục
          </button>

          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !customerId}
            >
              Lưu
            </button>
          </div>
        </div>
      )}

      <DataTable<Quote>
        rows={rows}
        rowKey={(q) => q.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có báo giá nào'}
        columns={[
          { key: 'code', header: 'Mã', render: (q) => <Link to={`/quotes/${q.id}`}>{q.code}</Link> },
          { key: 'sellTotal', header: 'Giá bán', render: (q) => formatCurrency(q.sellTotal) },
          { key: 'status', header: 'Trạng thái', render: (q) => <StatusBadge status={q.status} /> },
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

