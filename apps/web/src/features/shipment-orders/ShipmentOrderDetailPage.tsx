import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency } from '../../lib/format';
import { shipmentOrdersApi } from './api';
import type { Cargo, PickupDeliveryPoint } from './types';

export function ShipmentOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['shipment-orders', id],
    queryFn: () => shipmentOrdersApi.get(id!),
    enabled: Boolean(id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shipment-orders', id] });

  const confirmMutation = useMutation({ mutationFn: () => shipmentOrdersApi.confirm(id!), onSuccess: invalidate });
  const holdMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt('Lý do tạm giữ đơn?');
      if (!reason) throw new Error('cancelled');
      return shipmentOrdersApi.hold(id!, reason);
    },
    onSuccess: invalidate,
  });
  const cancelMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt('Lý do hủy đơn?');
      if (!reason) throw new Error('cancelled');
      return shipmentOrdersApi.cancel(id!, reason);
    },
    onSuccess: invalidate,
  });

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy đơn vận chuyển.</p>;
  const order = query.data;
  const error = confirmMutation.error || holdMutation.error || cancelMutation.error;

  return (
    <div>
      <p>
        <Link to="/shipment-orders">← Danh sách đơn</Link>
      </p>
      <div className="page-header">
        <h1>{order.code}</h1>
        <StatusBadge status={order.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Kênh tiếp nhận</dt>
          <dd>{order.sourceChannel}</dd>
          <dt>Giá bán</dt>
          <dd>{formatCurrency(order.sellTotal)}</dd>
          <dt>Giá mua dự kiến</dt>
          <dd>{formatCurrency(order.estimatedBuyTotal)}</dd>
          {order.cancelReason && (
            <>
              <dt>Lý do hủy</dt>
              <dd>{order.cancelReason}</dd>
            </>
          )}
        </dl>

        {error instanceof ApiError && <p className="form-error">{error.message}</p>}

        {hasPermission('shipment-order:update') && (
          <div className="form-actions">
            {order.status === 'DRAFT' && (
              <button className="btn btn-primary" onClick={() => confirmMutation.mutate()}>
                Xác nhận đơn
              </button>
            )}
            {order.status !== 'CANCELLED' && order.status !== 'HELD' && (
              <button className="btn btn-secondary" onClick={() => holdMutation.mutate()}>
                Tạm giữ
              </button>
            )}
            {hasPermission('shipment-order:cancel') && order.status !== 'CANCELLED' && (
              <button className="btn btn-danger" onClick={() => cancelMutation.mutate()}>
                Hủy đơn
              </button>
            )}
          </div>
        )}
      </div>

      <h2>Điểm lấy / giao hàng</h2>
      <DataTable<PickupDeliveryPoint>
        rows={order.points ?? []}
        rowKey={(p) => p.id}
        columns={[
          { key: 'sequence', header: '#', render: (p) => p.sequence },
          { key: 'type', header: 'Loại', render: (p) => (p.type === 'PICKUP' ? 'Lấy hàng' : 'Giao hàng') },
          { key: 'address', header: 'Địa điểm', render: (p) => p.freeAddress ?? '—' },
          { key: 'container', header: 'Container', render: (p) => p.containerNumber ?? '—' },
        ]}
      />

      <h2>Hàng hóa</h2>
      <DataTable<Cargo>
        rows={order.cargos ?? []}
        rowKey={(c) => c.id}
        columns={[
          { key: 'description', header: 'Mô tả', render: (c) => c.description },
          { key: 'packageCount', header: 'Số kiện', render: (c) => c.packageCount ?? '—' },
          { key: 'weightKg', header: 'Trọng lượng (kg)', render: (c) => c.weightKg ?? '—' },
        ]}
      />
    </div>
  );
}
