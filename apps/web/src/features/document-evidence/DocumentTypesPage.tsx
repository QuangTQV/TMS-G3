import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { documentTypesApi } from "./api";
import type { AIJobType, RequiredDocumentType } from "./types";

export function DocumentTypesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["document-types"],
    queryFn: documentTypesApi.list,
  });

  const createMutation = useMutation({
    mutationFn: documentTypesApi.create,
    onSuccess: () => {
      setShowForm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["document-types"] });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Không thể tạo loại chứng từ",
      ),
  });

  const deactivateMutation = useMutation({
    mutationFn: documentTypesApi.deactivate,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["document-types"] }),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const aiJobType = String(form.get("aiJobType") || "");
    createMutation.mutate({
      code: String(form.get("code")),
      name: String(form.get("name")),
      aiJobType: aiJobType ? (aiJobType as AIJobType) : undefined,
    });
  }

  return (
    <div>
      <div className="page-header">
        <h1>Loại chứng từ bắt buộc</h1>
        {hasPermission("document-type:manage") && (
          <button
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Đóng" : "+ Loại chứng từ mới"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Mã
              <input name="code" required />
            </label>
            <label>
              Tên
              <input name="name" required />
            </label>
            <label>
              Loại AI xử lý
              <select name="aiJobType" defaultValue="">
                <option value="">Không có AI</option>
                <option value="PHOTO_CHECK">
                  Kiểm tra ảnh (xe/container/seal)
                </option>
                <option value="INVOICE_OCR">Đọc hóa đơn</option>
              </select>
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={createMutation.isPending}
            >
              Lưu
            </button>
          </div>
        </form>
      )}

      <DataTable<RequiredDocumentType>
        rows={query.data ?? []}
        rowKey={(t) => t.id}
        emptyMessage={
          query.isLoading ? "Đang tải…" : "Chưa có loại chứng từ nào"
        }
        columns={[
          { key: "code", header: "Mã", render: (t) => t.code },
          { key: "name", header: "Tên", render: (t) => t.name },
          { key: "aiJobType", header: "AI", render: (t) => t.aiJobType ?? "—" },
          {
            key: "status",
            header: "Trạng thái",
            render: (t) => (
              <StatusBadge status={t.isActive ? "ACTIVE" : "CANCELLED"} />
            ),
          },
          {
            key: "actions",
            header: "",
            render: (t) =>
              t.isActive && hasPermission("document-type:manage") ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => deactivateMutation.mutate(t.id)}
                >
                  Vô hiệu hóa
                </button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
