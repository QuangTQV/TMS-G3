export type DocumentEvidenceStatus =
  "PENDING_REVIEW" | "NEEDS_REVIEW" | "VERIFIED" | "REJECTED" | "LOCKED";

export type AIJobType = "PHOTO_CHECK" | "INVOICE_OCR";
export type AIJobStatus =
  "QUEUED" | "PROCESSING" | "VERIFIED" | "NEEDS_REVIEW" | "FAILED";

export interface RequiredDocumentType {
  id: string;
  code: string;
  name: string;
  aiJobType: AIJobType | null;
  isActive: boolean;
  createdAt: string;
}

export interface AIProcessingJob {
  id: string;
  documentEvidenceId: string;
  jobType: AIJobType;
  status: AIJobStatus;
  retryCount: number;
  errorMessage: string | null;
  requestedAt: string;
  completedAt: string | null;
  documentEvidence?: DocumentEvidence & {
    requiredDocumentType?: RequiredDocumentType;
  };
}

export interface DocumentEvidence {
  id: string;
  tripId: string;
  requiredDocumentTypeId: string;
  fileUrl: string;
  fileHash: string;
  status: DocumentEvidenceStatus;
  rejectedReason: string | null;
  lockedAt: string | null;
  sharedAt: string | null;
  createdAt: string;
  requiredDocumentType?: RequiredDocumentType;
  aiJobs?: AIProcessingJob[];
  aiJob?: AIProcessingJob | null;
}
