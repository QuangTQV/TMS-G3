import { api } from "../../lib/api-client";
import type {
  AIJobType,
  AIProcessingJob,
  DocumentEvidence,
  RequiredDocumentType,
} from "./types";

export const documentTypesApi = {
  list: () => api.get<RequiredDocumentType[]>("/v1/document-types"),
  create: (input: { code: string; name: string; aiJobType?: AIJobType }) =>
    api.post<RequiredDocumentType>("/v1/document-types", input),
  deactivate: (id: string) =>
    api.patch<RequiredDocumentType>(`/v1/document-types/${id}/deactivate`),
};

export const aiJobsApi = {
  list: (cursor?: string, status?: string) => {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (status) query.set("status", status);
    return api.getPage<AIProcessingJob>(
      `/v1/ai-jobs${query.size ? `?${query}` : ""}`,
    );
  },
  start: (id: string) => api.post<AIProcessingJob>(`/v1/ai-jobs/${id}/start`),
  process: (id: string) =>
    api.post<AIProcessingJob>(`/v1/ai-jobs/${id}/process`),
  retry: (id: string) => api.post<AIProcessingJob>(`/v1/ai-jobs/${id}/retry`),
  createCostDraft: (id: string) =>
    api.post(`/v1/ai-jobs/${id}/create-cost-draft`),
};

export const documentEvidenceApi = {
  listByTrip: (tripId: string) =>
    api.getPage<DocumentEvidence>(`/v1/trips/${tripId}/documents`),
  // Bắt buộc Idempotency-Key vì đây là endpoint ghi dữ liệu gọi từ app tài xế
  // (docs/api-conventions.md mục 4) — client sinh UUID cho mỗi lần chụp/chọn file.
  upload: (
    tripId: string,
    input: {
      requiredDocumentTypeId: string;
      fileUrl: string;
      fileHash: string;
    },
    idempotencyKey: string,
  ) =>
    api.post<DocumentEvidence>(`/v1/trips/${tripId}/documents`, input, {
      "Idempotency-Key": idempotencyKey,
    }),
  verify: (id: string) =>
    api.patch<DocumentEvidence>(`/v1/document-evidences/${id}/verify`),
  reject: (id: string, reason: string) =>
    api.patch<DocumentEvidence>(`/v1/document-evidences/${id}/reject`, {
      reason,
    }),
  lock: (id: string) =>
    api.patch<DocumentEvidence>(`/v1/document-evidences/${id}/lock`),
  share: (id: string) =>
    api.patch<DocumentEvidence>(`/v1/document-evidences/${id}/share`),
};
