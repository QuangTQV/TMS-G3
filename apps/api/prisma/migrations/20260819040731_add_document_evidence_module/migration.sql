-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('PHOTO_CHECK', 'INVOICE_OCR');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'VERIFIED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentEvidenceStatus" AS ENUM ('PENDING_REVIEW', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED', 'LOCKED');

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "required_document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aiJobType" "AIJobType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "required_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_evidences" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "requiredDocumentTypeId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "DocumentEvidenceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectedReason" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_processing_jobs" (
    "id" TEXT NOT NULL,
    "documentEvidenceId" TEXT NOT NULL,
    "jobType" "AIJobType" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ai_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_extraction_results" (
    "id" TEXT NOT NULL,
    "aiProcessingJobId" TEXT NOT NULL,
    "rawResult" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "validatedStatus" "AIJobStatus" NOT NULL,
    "validationNotes" TEXT,
    "invoiceIssuer" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceSubtotal" DECIMAL(18,2),
    "invoiceVatAmount" DECIMAL(18,2),
    "invoiceTotal" DECIMAL(18,2),
    "containerNumber" TEXT,
    "plateNumber" TEXT,
    "correctedByUserId" TEXT,
    "finalResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_extraction_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_idempotencyKey_endpoint_key" ON "idempotency_records"("idempotencyKey", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "required_document_types_code_key" ON "required_document_types"("code");

-- CreateIndex
CREATE INDEX "document_evidences_tripId_idx" ON "document_evidences"("tripId");

-- CreateIndex
CREATE INDEX "document_evidences_branchId_idx" ON "document_evidences"("branchId");

-- CreateIndex
CREATE INDEX "ai_processing_jobs_documentEvidenceId_idx" ON "ai_processing_jobs"("documentEvidenceId");

-- CreateIndex
CREATE INDEX "ai_processing_jobs_status_idx" ON "ai_processing_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_extraction_results_aiProcessingJobId_key" ON "ai_extraction_results"("aiProcessingJobId");

-- CreateIndex
CREATE INDEX "ai_extraction_results_invoiceIssuer_invoiceNumber_invoiceDa_idx" ON "ai_extraction_results"("invoiceIssuer", "invoiceNumber", "invoiceDate");

-- AddForeignKey
ALTER TABLE "document_evidences" ADD CONSTRAINT "document_evidences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_evidences" ADD CONSTRAINT "document_evidences_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_evidences" ADD CONSTRAINT "document_evidences_requiredDocumentTypeId_fkey" FOREIGN KEY ("requiredDocumentTypeId") REFERENCES "required_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_processing_jobs" ADD CONSTRAINT "ai_processing_jobs_documentEvidenceId_fkey" FOREIGN KEY ("documentEvidenceId") REFERENCES "document_evidences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extraction_results" ADD CONSTRAINT "ai_extraction_results_aiProcessingJobId_fkey" FOREIGN KEY ("aiProcessingJobId") REFERENCES "ai_processing_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
