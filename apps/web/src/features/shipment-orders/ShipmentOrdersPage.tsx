import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { CustomerSelect } from '../customers/CustomerSelect';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatCurrency } from '../../lib/format';
import { shipmentOrdersApi } from './api';
import type { CreateCargoInput, ShipmentOrder } from './types';

const SOURCE_CHANNELS = ['manual', 'excel', 'email', 'zalo', 'api', 'old_order'];

export function ShipmentOrdersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [sourceChannel, setSourceChannel] = useState('manual');
  const [sellTotal, setSellTotal] = useState(0);
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [cargos, setCargos] = useState<CreateCargoInput[]>([{ description: '' }]);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['shipment-orders'],
    queryFn: ({ pageParam }: { pageParam?: string }) => shipmentOrdersApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  const createMutation = useMutation({
    mutationFn: shipmentOrdersApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setCargos([{ description: '' }]);
      void queryClient.invalidateQueries({ queryKey: ['shipment-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo đơn'),
  });

  function handleSubmit() {
    setError(null);
    createMutation.mutate({
      customerId,
      sourceChannel,
      sellTotal,
      points: [
        { type: 'PICKUP', sequence: 1, freeAddress: pickupAddress },
        { type: 'DELIVERY', sequence: 2, freeAddress: deliveryAddress },
      ],
      cargos,
    });
  }

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Đơn vận chuyển</h1>
        {hasPermission('shipment-order:create') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Đơn mới'}
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
            <label>
              Kênh tiếp nhận
              <select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)}>
                {SOURCE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Giá bán (VND)
              <input
                type="number"
                min={0}
                value={sellTotal}
                onChange={(e) => setSellTotal(Number(e.target.value))}
                required
              />
            </label>
          </div>

          <p className="section-title">Điểm lấy / giao hàng</p>
          <div className="form-grid">
            <label>
              Điểm lấy hàng
              <input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} required />
            </label>
            <label>
              Điểm giao hàng
              <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required />
            </label>
          </div>

          <p className="section-title">Hàng hóa</p>
          {cargos.map((cargo, i) => (
            <div className="form-grid" key={i}>
              <label>
                Mô tả hàng
                <input
                  value={cargo.description}
                  onChange={(e) =>
                    setCargos((cs) => cs.map((c, j) => (j === i ? { ...c, description: e.target.value } : c)))
                  }
                  required
                />
              </label>
              <label>
                Số kiện
                <input
                  type="number"
                  min={0}
                  value={cargo.packageCount ?? ''}
                  onChange={(e) =>
                    setCargos((cs) =>
                      cs.map((c, j) => (j === i ? { ...c, packageCount: Number(e.target.value) } : c)),
                    )
                  }
                />
              </label>
              <label>
                Trọng lượng (kg)
                <input
                  type="number"
                  min={0}
                  value={cargo.weightKg ?? ''}
                  onChange={(e) =>
                    setCargos((cs) => cs.map((c, j) => (j === i ? { ...c, weightKg: Number(e.target.value) } : c)))
                  }
                />
              </label>
              {cargos.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCargos((cs) => cs.filter((_, j) => j !== i))}
                >
                  Xóa
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCargos((cs) => [...cs, { description: '' }])}
          >
            + Thêm hàng hóa
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

      <DataTable<ShipmentOrder>
        rows={rows}
        rowKey={(o) => o.id}
        emptyMessage={query.isLoading ? 'Đang tải…' : 'Chưa có đơn nào'}
        columns={[
          { key: 'code', header: 'Mã đơn', render: (o) => <Link to={`/shipment-orders/${o.id}`}>{o.code}</Link> },
          { key: 'sourceChannel', header: 'Kênh', render: (o) => o.sourceChannel },
          { key: 'sellTotal', header: 'Giá bán', render: (o) => formatCurrency(o.sellTotal) },
          { key: 'status', header: 'Trạng thái', render: (o) => <StatusBadge status={o.status} /> },
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
