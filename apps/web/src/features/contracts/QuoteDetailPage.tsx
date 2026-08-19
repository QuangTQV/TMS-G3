import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { quotesApi } from './api';
import type { QuoteLine } from './types';

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['quotes', id],
    queryFn: () => quotesApi.get(id!),
    enabled: Boolean(id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['quotes', id] });

  const approveMutation = useMutation({ mutationFn: () => quotesApi.approveAndSend(id!), onSuccess: invalidate });
  const acceptMutation = useMutation({ mutationFn: () => quotesApi.accept(id!), onSuccess: invalidate });
  const rejectMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt('Lý do từ chối báo giá?');
      if (!reason) throw new Error('cancelled');
      return quotesApi.reject(id!, reason);
    },
    onSuccess: invalidate,
  });
  const convertMutation = useMutation({
    mutationFn: () => quotesApi.convertToOrder(id!),
    onSuccess: (order) => navigate(`/shipment-orders/${order.id}`),
  });

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy báo giá.</p>;
  const quote = query.data;
  const error =
    approveMutation.error || acceptMutation.error || rejectMutation.error || convertMutation.error;

  return (
    <div>
      <p>
        <Link to="/quotes">← Danh sách báo giá</Link>
      </p>
      <div className="page-header">
        <h1>{quote.code}</h1>
        <StatusBadge status={quote.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Giá bán</dt>
          <dd>{formatCurrency(quote.sellTotal)}</dd>
          <dt>Giá mua dự kiến</dt>
          <dd>{formatCurrency(quote.estimatedBuyTotal)}</dd>
          <dt>Hiệu lực đến</dt>
          <dd>{formatDateTime(quote.validUntil)}</dd>
        </dl>

        {error instanceof ApiError && <p className="form-error">{error.message}</p>}

        <div className="form-actions">
          {quote.status === 'DRAFT' && hasPermission('quote:approve') && (
            <button className="btn btn-primary" onClick={() => approveMutation.mutate()}>
              Duyệt & gửi
            </button>
          )}
          {quote.status === 'SENT' && hasPermission('quote:update') && (
            <>
              <button className="btn btn-primary" onClick={() => acceptMutation.mutate()}>
                Khách chấp nhận
              </button>
              <button className="btn btn-danger" onClick={() => rejectMutation.mutate()}>
                Khách từ chối
              </button>
            </>
          )}
          {quote.status === 'ACCEPTED' && hasPermission('quote:convert') && (
            <button className="btn btn-primary" onClick={() => convertMutation.mutate()}>
              Chuyển thành đơn vận chuyển
            </button>
          )}
        </div>
      </div>

      <h2>Hạng mục</h2>
      <DataTable<QuoteLine>
        rows={quote.lines ?? []}
        rowKey={(l) => l.id}
        columns={[
          { key: 'description', header: 'Mô tả', render: (l) => l.description },
          { key: 'quantity', header: 'SL', render: (l) => l.quantity },
          { key: 'unitPrice', header: 'Đơn giá', render: (l) => formatCurrency(l.unitPrice) },
          { key: 'lineTotal', header: 'Thành tiền', render: (l) => formatCurrency(l.lineTotal) },
        ]}
      />
    </div>
  );
}
