import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { formatDateTime } from '../../lib/format';
import { contractsApi, priceListsApi } from './api';
import type { PriceListLineInput, SurchargeInput } from './types';

const EMPTY_LINE: PriceListLineInput = { originLabel: '', destLabel: '', unitPrice: 0, unit: 'chuyến' };
const EMPTY_SURCHARGE: SurchargeInput = { type: 'FUEL', name: '', amount: 0, isPercent: false };

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [lines, setLines] = useState<PriceListLineInput[]>([{ ...EMPTY_LINE }]);
  const [surcharges, setSurcharges] = useState<SurchargeInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['contracts', id],
    queryFn: () => contractsApi.get(id!),
    enabled: Boolean(id),
  });

  const createPriceListMutation = useMutation({
    mutationFn: priceListsApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      setLines([{ ...EMPTY_LINE }]);
      setSurcharges([]);
      void queryClient.invalidateQueries({ queryKey: ['contracts', id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Không thể tạo bảng giá'),
  });

  const approveMutation = useMutation({
    mutationFn: priceListsApi.approve,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contracts', id] }),
  });

  function submitPriceList() {
    setError(null);
    createPriceListMutation.mutate({
      contractId: id!,
      effectiveFrom,
      effectiveTo: effectiveTo || undefined,
      lines,
      surcharges,
    });
  }

  if (query.isLoading) return <p>Đang tải…</p>;
  if (query.isError || !query.data) return <p>Không tìm thấy hợp đồng.</p>;

  const contract = query.data;

  return (
    <div>
      <p>
        <Link to="/contracts">← Danh sách hợp đồng</Link>
      </p>
      <div className="page-header">
        <h1>{contract.code}</h1>
        <StatusBadge status={contract.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Hiệu lực từ</dt>
          <dd>{formatDateTime(contract.effectiveFrom)}</dd>
          <dt>Hiệu lực đến</dt>
          <dd>{formatDateTime(contract.effectiveTo)}</dd>
        </dl>
      </div>

      <div className="page-header">
        <h2>Bảng giá</h2>
        {hasPermission('price-list:create') && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Đóng' : '+ Bảng giá mới'}
          </button>
        )}
      </div>

      {contract.priceLists && contract.priceLists.length > 0 ? (
        contract.priceLists.map((pl) => (
          <div className="panel" key={pl.id}>
            <div className="page-header">
              <strong>Phiên bản {pl.version}</strong>
              <StatusBadge status={pl.status} />
            </div>
            <p>
              Hiệu lực: {formatDateTime(pl.effectiveFrom)} — {formatDateTime(pl.effectiveTo)}
            </p>
            {(pl.status === 'DRAFT' || pl.status === 'PENDING_APPROVAL') &&
              hasPermission('price-list:approve') && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => approveMutation.mutate(pl.id)}
                disabled={approveMutation.isPending}
              >
                Duyệt bảng giá
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="empty-state">Chưa có bảng giá nào</p>
      )}

      {showForm && (
        <div className="panel">
          <div className="form-grid">
            <label>
              Hiệu lực từ
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </label>
            <label>
              Hiệu lực đến
              <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </label>
          </div>

          <p className="section-title">Đơn giá theo tuyến</p>
          {lines.map((line, i) => (
            <div className="form-grid" key={i}>
              <label>
                Điểm đi
                <input
                  value={line.originLabel}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, originLabel: e.target.value } : l)))
                  }
                  required
                />
              </label>
              <label>
                Điểm đến
                <input
                  value={line.destLabel}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, destLabel: e.target.value } : l)))
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
              <label>
                Đơn vị
                <input
                  value={line.unit}
                  onChange={(e) =>
                    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, unit: e.target.value } : l)))
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
            + Thêm dòng giá
          </button>

          <p className="section-title">Phụ phí</p>
          {surcharges.map((s, i) => (
            <div className="form-grid" key={i}>
              <label>
                Loại
                <select
                  value={s.type}
                  onChange={(e) =>
                    setSurcharges((ss) => ss.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                  }
                >
                  {['FUEL', 'TOLL', 'WAITING', 'LIFT_ON_OFF', 'OVERTIME', 'YARD_STORAGE', 'OTHER'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tên phụ phí
                <input
                  value={s.name}
                  onChange={(e) =>
                    setSurcharges((ss) => ss.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  required
                />
              </label>
              <label>
                Giá trị
                <input
                  type="number"
                  min={0}
                  value={s.amount}
                  onChange={(e) =>
                    setSurcharges((ss) =>
                      ss.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)),
                    )
                  }
                  required
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSurcharges((ss) => ss.filter((_, j) => j !== i))}
              >
                Xóa phụ phí
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSurcharges((ss) => [...ss, { ...EMPTY_SURCHARGE }])}
          >
            + Thêm phụ phí
          </button>

          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={submitPriceList}
              disabled={createPriceListMutation.isPending || !effectiveFrom}
            >
              Lưu bảng giá
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
