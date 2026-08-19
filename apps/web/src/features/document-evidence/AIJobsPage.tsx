import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../lib/auth-context";
import { aiJobsApi } from "./api";
import type { AIJobStatus, AIProcessingJob } from "./types";

const STATUSES: Array<AIJobStatus | ""> = [
  "",
  "QUEUED",
  "PROCESSING",
  "NEEDS_REVIEW",
  "FAILED",
  "VERIFIED",
];

export function AIJobsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AIJobStatus | "">("");
  const query = useInfiniteQuery({
    queryKey: ["ai-jobs", status],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      aiJobsApi.list(pageParam, status || undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.hasMore ? (last.nextCursor ?? undefined) : undefined,
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
  const start = useMutation({
    mutationFn: aiJobsApi.start,
    onSuccess: invalidate,
  });
  const process = useMutation({
    mutationFn: aiJobsApi.process,
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: aiJobsApi.retry,
    onSuccess: invalidate,
  });
  const createCostDraft = useMutation({
    mutationFn: aiJobsApi.createCostDraft,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Hàng đợi AI</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AIJobStatus | "")}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value || "Tất cả trạng thái"}
            </option>
          ))}
        </select>
      </div>
      <p
        className="empty-state"
        style={{ textAlign: "left", padding: "0.2rem 0 1rem" }}
      >
        Worker hoặc công cụ vận hành xử lý job tại đây; hệ thống không tự gửi
        chứng từ đến nhà cung cấp AI khi chưa có chính sách dữ liệu được duyệt.
      </p>
      <DataTable<AIProcessingJob>
        rows={rows}
        rowKey={(job) => job.id}
        emptyMessage={query.isLoading ? "Đang tải…" : "Chưa có job AI"}
        columns={[
          { key: "jobType", header: "Loại", render: (job) => job.jobType },
          {
            key: "document",
            header: "Chứng từ",
            render: (job) =>
              job.documentEvidence?.requiredDocumentType?.name ??
              job.documentEvidenceId,
          },
          {
            key: "status",
            header: "Trạng thái",
            render: (job) => <StatusBadge status={job.status} />,
          },
          {
            key: "retries",
            header: "Lần chạy lại",
            render: (job) => job.retryCount,
          },
          {
            key: "error",
            header: "Lỗi",
            render: (job) => job.errorMessage ?? "—",
          },
          {
            key: "actions",
            header: "",
            render: (job) =>
              hasPermission("ai-job:manage") ? (
                <>
                  {job.status === "QUEUED" && (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => process.mutate(job.id)}
                      >
                        Trích xuất
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => start.mutate(job.id)}
                      >
                        Nhận job
                      </button>
                    </>
                  )}
                  {job.status === "FAILED" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => retry.mutate(job.id)}
                    >
                      Chạy lại
                    </button>
                  )}
                  {job.jobType === "INVOICE_OCR" &&
                    job.status === "VERIFIED" &&
                    hasPermission("trip-cost:manage") && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => createCostDraft.mutate(job.id)}
                      >
                        Tạo chi phí nháp
                      </button>
                    )}
                </>
              ) : null,
          },
        ]}
      />
      {query.hasNextPage && (
        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={() => void query.fetchNextPage()}
          >
            Tải thêm
          </button>
        </div>
      )}
    </div>
  );
}
