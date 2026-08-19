import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import {
  documentEvidenceApi,
  documentTypesApi,
} from "../document-evidence/api";
import type { DocumentEvidence } from "../document-evidence/types";
import { shipmentOrdersApi } from "../shipment-orders/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { formatDateTime } from "../../lib/format";
import { tripFinancialsApi, tripsApi } from "./api";
import type { TripOrderLink } from "./types";

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const tripQuery = useQuery({
    queryKey: ["trips", id],
    queryFn: () => tripsApi.get(id!),
    enabled: Boolean(id),
  });
  const invalidateTrip = () =>
    queryClient.invalidateQueries({ queryKey: ["trips", id] });

  const statusMutations = {
    dispatch: useMutation({
      mutationFn: () => tripsApi.dispatch(id!),
      onSuccess: invalidateTrip,
    }),
    start: useMutation({
      mutationFn: () => tripsApi.start(id!),
      onSuccess: invalidateTrip,
    }),
    complete: useMutation({
      mutationFn: () => tripsApi.complete(id!),
      onSuccess: invalidateTrip,
    }),
    resume: useMutation({
      mutationFn: () => tripsApi.resume(id!),
      onSuccess: invalidateTrip,
    }),
    pause: useMutation({
      mutationFn: () => {
        const reason = window.prompt("Lý do tạm dừng chuyến?");
        if (!reason) throw new Error("cancelled");
        return tripsApi.pause(id!, reason);
      },
      onSuccess: invalidateTrip,
    }),
    cancel: useMutation({
      mutationFn: () => {
        const reason = window.prompt("Lý do hủy chuyến?");
        if (!reason) throw new Error("cancelled");
        return tripsApi.cancel(id!, reason);
      },
      onSuccess: invalidateTrip,
    }),
  };

  if (tripQuery.isLoading) return <p>Đang tải…</p>;
  if (tripQuery.isError || !tripQuery.data)
    return <p>Không tìm thấy chuyến.</p>;
  const trip = tripQuery.data;

  const statusError = Object.values(statusMutations).find(
    (m) => m.error,
  )?.error;

  return (
    <div>
      <p>
        <Link to="/trips">← Danh sách chuyến</Link>
      </p>
      <div className="page-header">
        <h1>{trip.code}</h1>
        <StatusBadge status={trip.status} />
      </div>

      <div className="panel">
        <dl className="field-list">
          <dt>Loại nguồn lực</dt>
          <dd>{trip.isOutsourced ? "Thuê ngoài" : "Nội bộ"}</dd>
          <dt>Xe</dt>
          <dd>{trip.vehicle?.plateNumber ?? "—"}</dd>
          <dt>Tài xế</dt>
          <dd>{trip.driver?.fullName ?? "—"}</dd>
          <dt>Nhà vận tải</dt>
          <dd>{trip.carrier?.legalName ?? "—"}</dd>
          {trip.pauseReason && (
            <>
              <dt>Lý do tạm dừng</dt>
              <dd>{trip.pauseReason}</dd>
            </>
          )}
          {trip.cancelReason && (
            <>
              <dt>Lý do hủy</dt>
              <dd>{trip.cancelReason}</dd>
            </>
          )}
        </dl>

        {statusError instanceof ApiError && (
          <p className="form-error">{statusError.message}</p>
        )}

        {hasPermission("trip:update") && (
          <div className="form-actions">
            {trip.status === "PLANNED" && hasPermission("trip:dispatch") && (
              <button
                className="btn btn-primary"
                onClick={() => statusMutations.dispatch.mutate()}
              >
                Phát lệnh
              </button>
            )}
            {trip.status === "DISPATCHED" && (
              <button
                className="btn btn-primary"
                onClick={() => statusMutations.start.mutate()}
              >
                Bắt đầu chuyến
              </button>
            )}
            {trip.status === "IN_PROGRESS" && (
              <button
                className="btn btn-primary"
                onClick={() => statusMutations.complete.mutate()}
              >
                Hoàn tất chuyến
              </button>
            )}
            {(trip.status === "DISPATCHED" ||
              trip.status === "IN_PROGRESS") && (
              <button
                className="btn btn-secondary"
                onClick={() => statusMutations.pause.mutate()}
              >
                Tạm dừng
              </button>
            )}
            {trip.status === "PAUSED" && (
              <button
                className="btn btn-primary"
                onClick={() => statusMutations.resume.mutate()}
              >
                Tiếp tục
              </button>
            )}
            {hasPermission("trip:cancel") &&
              !["CLOSED", "CANCELLED"].includes(trip.status) && (
                <button
                  className="btn btn-danger"
                  onClick={() => statusMutations.cancel.mutate()}
                >
                  Hủy chuyến
                </button>
              )}
          </div>
        )}
      </div>

      <ResourcePanel
        tripId={trip.id}
        isOutsourced={trip.isOutsourced}
        onDone={invalidateTrip}
      />
      <OrdersPanel
        tripId={trip.id}
        orderLinks={trip.orderLinks ?? []}
        onDone={invalidateTrip}
      />
      <FinancialsPanel tripId={trip.id} />
      <DocumentsPanel tripId={trip.id} />
    </div>
  );
}

function FinancialsPanel({ tripId }: { tripId: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const financials = useQuery({
    queryKey: ["trips", tripId, "financials"],
    queryFn: () => tripFinancialsApi.get(tripId),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["trips", tripId, "financials"],
    });
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: invalidate,
  });
  const data = financials.data;

  const addPlan = () => {
    const description = window.prompt("Diễn giải chi phí kế hoạch?");
    const amount = Number(window.prompt("Số tiền (VND)?"));
    if (description && Number.isFinite(amount) && amount >= 0)
      action.mutate(() =>
        tripFinancialsApi.createPlan(tripId, {
          category: "OTHER",
          description,
          amount,
        }),
      );
  };
  const addActual = () => {
    const description = window.prompt("Diễn giải chi phí thực tế?");
    const amount = Number(window.prompt("Số tiền (VND)?"));
    if (description && Number.isFinite(amount) && amount >= 0)
      action.mutate(() =>
        tripFinancialsApi.createActual(tripId, {
          category: "OTHER",
          description,
          amount,
          incurredAt: new Date().toISOString(),
        }),
      );
  };
  const addAdvance = () => {
    const recipientName = window.prompt("Người nhận tạm ứng?");
    const amount = Number(window.prompt("Số tiền (VND)?"));
    const purpose = window.prompt("Mục đích tạm ứng?");
    if (recipientName && purpose && Number.isFinite(amount) && amount > 0)
      action.mutate(() =>
        tripFinancialsApi.createAdvance(tripId, {
          recipientName,
          purpose,
          amount,
        }),
      );
  };

  return (
    <div className="panel">
      <div className="page-header">
        <p className="section-title" style={{ margin: 0 }}>
          Chi phí, tạm ứng &amp; quyết toán
        </p>
        <div className="form-actions">
          {hasPermission("trip-cost:manage") && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={addPlan}>
                + Kế hoạch
              </button>
              <button className="btn btn-secondary btn-sm" onClick={addActual}>
                + Chi phí
              </button>
            </>
          )}
          {hasPermission("advance:manage") && (
            <button className="btn btn-secondary btn-sm" onClick={addAdvance}>
              + Tạm ứng
            </button>
          )}
        </div>
      </div>
      {data && (
        <p
          className="empty-state"
          style={{ padding: "0.3rem 0", textAlign: "left" }}
        >
          Kế hoạch: {data.totals.planned.toLocaleString("vi-VN")} ₫ · Đã duyệt:{" "}
          {data.totals.actualApproved.toLocaleString("vi-VN")} ₫ · Đã chi tạm
          ứng: {data.totals.advancePaid.toLocaleString("vi-VN")} ₫
        </p>
      )}
      <DataTable
        rows={data?.actuals ?? []}
        rowKey={(x) => x.id}
        emptyMessage={
          financials.isLoading ? "Đang tải…" : "Chưa có chi phí thực tế"
        }
        columns={[
          {
            key: "description",
            header: "Chi phí",
            render: (x) => x.description,
          },
          {
            key: "amount",
            header: "Số tiền",
            render: (x) => Number(x.amount).toLocaleString("vi-VN"),
          },
          {
            key: "status",
            header: "Trạng thái",
            render: (x) => <StatusBadge status={x.status} />,
          },
          {
            key: "action",
            header: "",
            render: (x) => (
              <>
                {x.status === "DRAFT" && hasPermission("trip-cost:manage") && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      action.mutate(() => tripFinancialsApi.submitActual(x.id))
                    }
                  >
                    Trình
                  </button>
                )}
                {x.status === "SUBMITTED" &&
                  hasPermission("trip-cost:approve") && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        action.mutate(() =>
                          tripFinancialsApi.approveActual(x.id),
                        )
                      }
                    >
                      Duyệt
                    </button>
                  )}
              </>
            ),
          },
        ]}
      />
      <DataTable
        rows={data?.advances ?? []}
        rowKey={(x) => x.id}
        emptyMessage="Chưa có tạm ứng"
        columns={[
          {
            key: "recipientName",
            header: "Người nhận",
            render: (x) => x.recipientName,
          },
          {
            key: "amount",
            header: "Số tiền",
            render: (x) => Number(x.amount).toLocaleString("vi-VN"),
          },
          {
            key: "status",
            header: "Trạng thái",
            render: (x) => <StatusBadge status={x.status} />,
          },
          {
            key: "action",
            header: "",
            render: (x) => (
              <>
                {x.status === "REQUESTED" &&
                  hasPermission("advance:approve") && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        action.mutate(() =>
                          tripFinancialsApi.approveAdvance(x.id),
                        )
                      }
                    >
                      Duyệt
                    </button>
                  )}
                {x.status === "APPROVED" && hasPermission("advance:pay") && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      action.mutate(() => tripFinancialsApi.payAdvance(x.id))
                    }
                  >
                    Đã chi
                  </button>
                )}
                {x.status === "PAID" && hasPermission("advance:manage") && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      action.mutate(() => tripFinancialsApi.settleAdvance(x.id))
                    }
                  >
                    Quyết toán
                  </button>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

function ResourcePanel({
  tripId,
  isOutsourced,
  onDone,
}: {
  tripId: string;
  isOutsourced: boolean;
  onDone: () => void;
}) {
  const { hasPermission } = useAuth();
  // Gợi ý xe/tài xế/nhà vận tải theo tải trọng đơn đã ghép + trạng thái bận/rảnh
  // (module 5, phân hệ "Gợi ý tối ưu") — xem trip.service.ts#suggestResources.
  const suggestionsQuery = useQuery({
    queryKey: ["trips", tripId, "resource-suggestions"],
    queryFn: () => tripsApi.suggestResources(tripId),
  });

  const assignMutation = useMutation({
    mutationFn: (input: {
      vehicleId?: string;
      driverId?: string;
      carrierId?: string;
    }) => tripsApi.assignResource(tripId, input),
    onSuccess: onDone,
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (isOutsourced) {
      assignMutation.mutate({
        carrierId: String(form.get("carrierId")) || undefined,
      });
    } else {
      assignMutation.mutate({
        vehicleId: String(form.get("vehicleId")) || undefined,
        driverId: String(form.get("driverId")) || undefined,
      });
    }
  }

  if (!hasPermission("trip:update")) return null;

  const suggestions = suggestionsQuery.data;

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <p className="section-title">Gán nguồn lực</p>
      {suggestions?.requiredWeightKg !== null &&
        suggestions?.requiredWeightKg !== undefined && (
          <p className="empty-state" style={{ padding: "0.2rem 0", textAlign: "left" }}>
            Tổng trọng lượng hàng của chuyến: {suggestions.requiredWeightKg} kg
          </p>
        )}
      <div className="form-grid">
        {isOutsourced ? (
          <label>
            Nhà vận tải
            <select name="carrierId" defaultValue="">
              <option value="">Chọn nhà vận tải</option>
              {suggestions?.carriers.map(({ carrier, busy }) => (
                <option key={carrier.id} value={carrier.id}>
                  {carrier.code} — {carrier.legalName}
                  {busy ? ' — đang bận' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Xe {suggestionsQuery.isLoading && '(đang tính gợi ý…)'}
              <select name="vehicleId" defaultValue="">
                <option value="">Chọn xe</option>
                {suggestions?.vehicles.map(({ vehicle, fitsCapacity, busy, warnings }) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} ({vehicle.vehicleType})
                    {fitsCapacity === false ? ' — thiếu tải trọng' : ''}
                    {busy ? ' — đang bận' : ''}
                    {warnings.length > 0 && fitsCapacity !== false && !busy ? ' — ⚠' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tài xế {suggestionsQuery.isLoading && '(đang tính gợi ý…)'}
              <select name="driverId" defaultValue="">
                <option value="">Chọn tài xế</option>
                {suggestions?.drivers.map(({ driver, busy }) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName} — {driver.phone}
                    {busy ? ' — đang bận' : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <p className="empty-state" style={{ padding: "0.2rem 0", textAlign: "left" }}>
        Danh sách đã xếp theo mức độ phù hợp (đủ tải trọng, rảnh, dư tải ít nhất trước)
        — vẫn có thể chọn thủ công lựa chọn khác nếu cần.
      </p>
      {assignMutation.error instanceof ApiError && (
        <p className="form-error">{assignMutation.error.message}</p>
      )}
      <div className="form-actions">
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={assignMutation.isPending}
        >
          Lưu
        </button>
      </div>
    </form>
  );
}

function OrdersPanel({
  tripId,
  orderLinks,
  onDone,
}: {
  tripId: string;
  orderLinks: TripOrderLink[];
  onDone: () => void;
}) {
  const { hasPermission } = useAuth();
  const ordersQuery = useQuery({
    queryKey: ["shipment-orders", "select-options"],
    queryFn: () => shipmentOrdersApi.list(),
  });

  const linkMutation = useMutation({
    mutationFn: (shipmentOrderId: string) =>
      tripsApi.linkOrder(tripId, { shipmentOrderId }),
    onSuccess: onDone,
  });

  const linkedIds = new Set(orderLinks.map((l) => l.shipmentOrderId));
  const linkableOrders = (ordersQuery.data?.items ?? []).filter(
    (o) =>
      !linkedIds.has(o.id) &&
      (o.status === "CONFIRMED" || o.status === "PLANNED"),
  );

  return (
    <div className="panel">
      <p className="section-title">Đơn ghép vào chuyến</p>
      <DataTable<TripOrderLink>
        rows={orderLinks}
        rowKey={(l) => l.id}
        emptyMessage="Chưa ghép đơn nào"
        columns={[
          {
            key: "order",
            header: "Mã đơn",
            render: (l) => (
              <Link to={`/shipment-orders/${l.shipmentOrderId}`}>
                {l.shipmentOrder?.code ?? l.shipmentOrderId}
              </Link>
            ),
          },
        ]}
      />

      {hasPermission("trip:update") && linkableOrders.length > 0 && (
        <div className="form-actions">
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) linkMutation.mutate(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Ghép đơn vào chuyến…
            </option>
            {linkableOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code}
              </option>
            ))}
          </select>
        </div>
      )}
      {linkMutation.error instanceof ApiError && (
        <p className="form-error">{linkMutation.error.message}</p>
      )}
    </div>
  );
}

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function DocumentsPanel({ tripId }: { tripId: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsQuery = useQuery({
    queryKey: ["trips", tripId, "documents"],
    queryFn: () => documentEvidenceApi.listByTrip(tripId),
  });
  const typesQuery = useQuery({
    queryKey: ["document-types"],
    queryFn: documentTypesApi.list,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["trips", tripId, "documents"],
    });
    void queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
  };

  const uploadMutation = useMutation({
    mutationFn: (input: {
      requiredDocumentTypeId: string;
      fileUrl: string;
      fileHash: string;
    }) => documentEvidenceApi.upload(tripId, input, crypto.randomUUID()),
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Không thể tải lên chứng từ",
      ),
  });

  const verifyMutation = useMutation({
    mutationFn: documentEvidenceApi.verify,
    onSuccess: invalidate,
  });
  const lockMutation = useMutation({
    mutationFn: documentEvidenceApi.lock,
    onSuccess: invalidate,
  });
  const shareMutation = useMutation({
    mutationFn: documentEvidenceApi.share,
    onSuccess: invalidate,
  });
  const rejectMutation = useMutation({
    mutationFn: (evidenceId: string) => {
      const reason = window.prompt("Lý do từ chối chứng từ?");
      if (!reason) throw new Error("cancelled");
      return documentEvidenceApi.reject(evidenceId, reason);
    },
    onSuccess: invalidate,
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fileUrl = String(form.get("fileUrl"));
    const fileHash = await hashText(fileUrl + Date.now());
    uploadMutation.mutate({
      requiredDocumentTypeId: String(form.get("requiredDocumentTypeId")),
      fileUrl,
      fileHash,
    });
  }

  const activeTypes = (typesQuery.data ?? []).filter((t) => t.isActive);

  return (
    <div className="panel">
      <div className="page-header">
        <p className="section-title" style={{ margin: 0 }}>
          Chứng từ &amp; bằng chứng giao nhận
        </p>
        {hasPermission("document-evidence:upload") && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Đóng" : "+ Tải lên chứng từ"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Loại chứng từ
              <select name="requiredDocumentTypeId" required defaultValue="">
                <option value="" disabled>
                  Chọn loại chứng từ
                </option>
                {activeTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.aiJobType ? `(AI: ${t.aiJobType})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Đường dẫn file (đã upload lên storage)
              <input
                name="fileUrl"
                type="url"
                required
                placeholder="https://…"
              />
            </label>
          </div>
          <p
            className="empty-state"
            style={{ padding: "0.3rem 0", textAlign: "left" }}
          >
            Hash file được tự tính từ đường dẫn — hệ thống lưu trữ file thật
            chưa được quyết định (xem docs/open-questions.md).
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button
              className="btn btn-primary btn-sm"
              type="submit"
              disabled={uploadMutation.isPending}
            >
              Lưu
            </button>
          </div>
        </form>
      )}

      <DataTable<DocumentEvidence>
        rows={docsQuery.data?.items ?? []}
        rowKey={(d) => d.id}
        emptyMessage={
          docsQuery.isLoading ? "Đang tải…" : "Chưa có chứng từ nào"
        }
        columns={[
          {
            key: "type",
            header: "Loại",
            render: (d) =>
              d.requiredDocumentType?.name ?? d.requiredDocumentTypeId,
          },
          {
            key: "file",
            header: "File",
            render: (d) => (
              <a href={d.fileUrl} target="_blank" rel="noreferrer">
                Xem file
              </a>
            ),
          },
          {
            key: "status",
            header: "Trạng thái",
            render: (d) => <StatusBadge status={d.status} />,
          },
          {
            key: "ai",
            header: "Kết quả AI",
            render: (d) => {
              const job = d.aiJobs?.[0] ?? d.aiJob;
              return job ? <StatusBadge status={job.status} /> : "—";
            },
          },
          {
            key: "createdAt",
            header: "Tạo lúc",
            render: (d) => formatDateTime(d.createdAt),
          },
          {
            key: "actions",
            header: "",
            render: (d) => (
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {hasPermission("document-evidence:verify") &&
                  d.status !== "LOCKED" && (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => verifyMutation.mutate(d.id)}
                      >
                        Xác thực
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => rejectMutation.mutate(d.id)}
                      >
                        Từ chối
                      </button>
                    </>
                  )}
                {hasPermission("document-evidence:lock") &&
                  d.status === "VERIFIED" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => lockMutation.mutate(d.id)}
                    >
                      Khóa
                    </button>
                  )}
                {hasPermission("document-evidence:share") &&
                  d.status === "LOCKED" &&
                  !d.sharedAt && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => shareMutation.mutate(d.id)}
                    >
                      Chia sẻ
                    </button>
                  )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
