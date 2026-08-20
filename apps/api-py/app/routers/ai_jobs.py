from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..image_extraction import ExtractImageInput
from ..image_extraction import extract as extract_image
from ..models import (
    AIExtractionResult,
    AIJobStatus,
    AIJobType,
    AIProcessingJob,
    DocumentEvidence,
    DocumentEvidenceStatus,
    Trip,
    Vehicle,
)
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import FailAiJobRequest, SubmitAiResultRequest
from ..serializers import serialize_ai_processing_job, serialize_trip_cost_actual
from ..validators import is_invoice_date_valid, is_invoice_total_consistent, is_valid_container_number
from .document_evidences import recompute_trip_completion
from .trip_cost import create_draft_from_ai_job

router = APIRouter(prefix="/v1/ai-jobs", tags=["ai-jobs"])

ENTITY_TYPE = "AIProcessingJob"

# Ngưỡng độ tin cậy cấu hình được (docs/ai-processing.md nhóm A #3) — R1 dùng hằng
# số cố định, chuyển sang cấu hình theo chi nhánh/loại chứng từ khi có yêu cầu.
CONFIDENCE_THRESHOLD = Decimal("0.8")


def _get_or_404(db: Session, user: AuthenticatedUser, job_id: str) -> AIProcessingJob:
    job = db.scalar(
        select(AIProcessingJob)
        .options(selectinload(AIProcessingJob.documentEvidence), selectinload(AIProcessingJob.extractionResult))
        .where(AIProcessingJob.id == job_id)
    )
    if job is None:
        raise ApiError(404, "Không tìm thấy job AI")
    assert_branch_scope(user, job.documentEvidence.branchId)
    return job


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    status: Literal["QUEUED", "PROCESSING", "VERIFIED", "NEEDS_REVIEW", "FAILED"] | None = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:read")),
):
    stmt = (
        select(AIProcessingJob)
        .join(DocumentEvidence, AIProcessingJob.documentEvidenceId == DocumentEvidence.id)
        .options(
            selectinload(AIProcessingJob.documentEvidence).selectinload(DocumentEvidence.requiredDocumentType)
        )
        .where(DocumentEvidence.branchId == user.branch_id)
        .order_by(AIProcessingJob.requestedAt.desc())
    )
    if status:
        stmt = stmt.where(AIProcessingJob.status == status)
    if cursor:
        anchor = db.scalar(select(AIProcessingJob.requestedAt).where(AIProcessingJob.id == cursor))
        if anchor is not None:
            stmt = stmt.where(AIProcessingJob.requestedAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_ai_processing_job(r) for r in page["data"]], "meta": page["meta"]})


@router.get("/{job_id}")
def find_one(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:read")),
):
    job = _get_or_404(db, user, job_id)
    return envelope(serialize_ai_processing_job(job))


def _transition_job(
    db: Session,
    user: AuthenticatedUser,
    job_id: str,
    from_status: AIJobStatus,
    to_status: AIJobStatus,
    action: str,
    error_message: str | None = None,
) -> AIProcessingJob:
    job = _get_or_404(db, user, job_id)
    if job.status != from_status:
        raise ApiError(400, f"Job phải ở trạng thái {from_status.value}")

    before_status = job.status.value
    before_error = job.errorMessage
    job.status = to_status
    if to_status == AIJobStatus.FAILED:
        job.errorMessage = error_message
        job.completedAt = datetime.utcnow()
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=job_id,
        action=action,
        actor_user_id=user.user_id,
        reason=error_message,
        before_state={"status": before_status, "errorMessage": before_error},
        after_state={"status": job.status.value, "errorMessage": job.errorMessage},
    )
    db.commit()
    return _get_or_404(db, user, job_id)


@router.post("/{job_id}/start")
def start(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:manage")),
):
    job = _transition_job(db, user, job_id, AIJobStatus.QUEUED, AIJobStatus.PROCESSING, "START")
    return envelope(serialize_ai_processing_job(job))


@router.post("/{job_id}/fail")
def fail(
    job_id: str,
    dto: FailAiJobRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:manage")),
):
    job = _transition_job(db, user, job_id, AIJobStatus.PROCESSING, AIJobStatus.FAILED, "FAIL", dto.errorMessage)
    return envelope(serialize_ai_processing_job(job))


@router.post("/{job_id}/retry")
def retry(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:manage")),
):
    job = _get_or_404(db, user, job_id)
    if job.status != AIJobStatus.FAILED:
        raise ApiError(400, "Chỉ job thất bại mới có thể chạy lại")

    before_status = job.status.value
    before_retry_count = job.retryCount
    job.status = AIJobStatus.QUEUED
    job.retryCount += 1
    job.errorMessage = None
    job.completedAt = None
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=job_id,
        action="RETRY",
        actor_user_id=user.user_id,
        before_state={"status": before_status, "retryCount": before_retry_count},
        after_state={"status": job.status.value, "retryCount": job.retryCount},
    )
    db.commit()
    job = _get_or_404(db, user, job_id)
    return envelope(serialize_ai_processing_job(job))


def _validate(db: Session, job: AIProcessingJob, dto: SubmitAiResultRequest) -> tuple[AIJobStatus, str | None]:
    if dto.confidence is not None and dto.confidence < CONFIDENCE_THRESHOLD:
        return AIJobStatus.NEEDS_REVIEW, f"Độ tin cậy AI dưới ngưỡng ({dto.confidence} < {CONFIDENCE_THRESHOLD})"

    if job.jobType == AIJobType.PHOTO_CHECK:
        if not dto.containerNumber and not dto.plateNumber:
            return AIJobStatus.NEEDS_REVIEW, "Thiếu số container/biển số để đối chiếu"
        if dto.containerNumber and not is_valid_container_number(dto.containerNumber):
            return AIJobStatus.NEEDS_REVIEW, "Số container không hợp lệ (sai check digit ISO 6346)"
        if dto.plateNumber:
            trip = db.get(Trip, job.documentEvidence.tripId)
            if trip is not None and trip.vehicleId:
                vehicle = db.get(Vehicle, trip.vehicleId)
                if vehicle is not None and vehicle.plateNumber.replace(" ", "").upper() != dto.plateNumber.replace(
                    " ", ""
                ).upper():
                    return AIJobStatus.NEEDS_REVIEW, "Biển số AI đọc được không khớp xe đã phân công"
        return AIJobStatus.VERIFIED, None

    # INVOICE_OCR
    if dto.invoice is None:
        return AIJobStatus.NEEDS_REVIEW, "Không có dữ liệu hóa đơn trích xuất"
    if not is_invoice_total_consistent(dto.invoice.subtotal, dto.invoice.vatAmount, dto.invoice.total):
        return AIJobStatus.NEEDS_REVIEW, "Tổng tiền không khớp: total phải bằng subtotal + vatAmount"
    invoice_date = datetime.fromisoformat(dto.invoice.invoiceDate)
    if not is_invoice_date_valid(invoice_date):
        return AIJobStatus.NEEDS_REVIEW, "Ngày hóa đơn ở tương lai"

    duplicate = db.scalar(
        select(AIExtractionResult).where(
            AIExtractionResult.invoiceIssuer == dto.invoice.issuer,
            AIExtractionResult.invoiceNumber == dto.invoice.invoiceNumber,
            AIExtractionResult.invoiceDate == invoice_date,
        )
    )
    if duplicate is not None:
        return AIJobStatus.NEEDS_REVIEW, "Trùng số hóa đơn/nhà phát hành/ngày với hóa đơn đã đọc trước đó"

    duplicate_file = db.scalar(
        select(DocumentEvidence).where(
            DocumentEvidence.fileHash == job.documentEvidence.fileHash,
            DocumentEvidence.id != job.documentEvidence.id,
        )
    )
    if duplicate_file is not None:
        return AIJobStatus.NEEDS_REVIEW, "Tệp hóa đơn trùng hash với chứng từ khác"

    return AIJobStatus.VERIFIED, None


def _do_submit_result(db: Session, user: AuthenticatedUser, job_id: str, dto: SubmitAiResultRequest) -> AIProcessingJob:
    job = _get_or_404(db, user, job_id)
    if job.extractionResult is not None:
        raise ApiError(400, "Job này đã có kết quả")
    if job.status not in (AIJobStatus.PROCESSING, AIJobStatus.QUEUED):
        raise ApiError(400, "Job không ở trạng thái chờ xử lý")

    status, notes = _validate(db, job, dto)

    extraction = AIExtractionResult(
        aiProcessingJobId=job.id,
        rawResult=dto.rawResult,
        confidence=float(dto.confidence) if dto.confidence is not None else None,
        validatedStatus=status,
        validationNotes=notes,
        invoiceIssuer=dto.invoice.issuer if dto.invoice else None,
        invoiceNumber=dto.invoice.invoiceNumber if dto.invoice else None,
        invoiceDate=datetime.fromisoformat(dto.invoice.invoiceDate) if dto.invoice else None,
        invoiceSubtotal=dto.invoice.subtotal if dto.invoice else None,
        invoiceVatAmount=dto.invoice.vatAmount if dto.invoice else None,
        invoiceTotal=dto.invoice.total if dto.invoice else None,
        containerNumber=dto.containerNumber,
        plateNumber=dto.plateNumber,
    )
    db.add(extraction)

    job.status = status
    job.completedAt = datetime.utcnow()

    # Nhóm A map thẳng kết quả AI sang trạng thái chứng từ (đạt/cần kiểm tra lại).
    # Nhóm B chỉ đẩy NEEDS_REVIEW khi nghi vấn — kết quả hợp lệ vẫn chờ người phụ
    # trách bấm "Xác thực" (module 8 chỉ tiêu thụ dữ liệu, không tự khóa chứng từ).
    evidence = job.documentEvidence
    if job.jobType == AIJobType.PHOTO_CHECK:
        evidence.status = (
            DocumentEvidenceStatus.VERIFIED if status == AIJobStatus.VERIFIED else DocumentEvidenceStatus.NEEDS_REVIEW
        )
    elif status == AIJobStatus.NEEDS_REVIEW:
        evidence.status = DocumentEvidenceStatus.NEEDS_REVIEW

    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=job.id,
        action="SUBMIT_RESULT",
        actor_user_id=user.user_id,
        after_state={"validatedStatus": status.value, "notes": notes},
    )
    trip_id = evidence.tripId
    db.commit()

    if job.jobType == AIJobType.PHOTO_CHECK and status == AIJobStatus.VERIFIED:
        recompute_trip_completion(db, user, trip_id)

    return _get_or_404(db, user, job_id)


@router.post("/{job_id}/result")
def submit_result(
    job_id: str,
    dto: SubmitAiResultRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:submit-result")),
):
    job = _do_submit_result(db, user, job_id, dto)
    return envelope(serialize_ai_processing_job(job))


@router.post("/{job_id}/process")
def process(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("ai-job:manage")),
):
    """Worker entrypoint: lấy URL đã lưu từ chứng từ, gọi extractor được cấu hình
    (tắt mặc định — xem app/image_extraction.py), rồi đi qua đúng cùng một
    validate path với kết quả từ worker bên ngoài."""
    job = _get_or_404(db, user, job_id)
    _transition_job(db, user, job_id, AIJobStatus.QUEUED, AIJobStatus.PROCESSING, "START")
    try:
        output = extract_image(
            ExtractImageInput(
                image_url=job.documentEvidence.fileUrl,
                job_type=job.jobType,
                document_name=job.documentEvidence.requiredDocumentType.name,
            )
        )
    except ApiError as error:
        _transition_job(db, user, job_id, AIJobStatus.PROCESSING, AIJobStatus.FAILED, "FAIL", error.message)
        raise

    dto = SubmitAiResultRequest(
        rawResult=output.raw_result,
        confidence=Decimal(str(output.confidence)) if output.confidence is not None else None,
        invoice=output.invoice,
        containerNumber=output.container_number,
        plateNumber=output.plate_number,
    )
    job = _do_submit_result(db, user, job_id, dto)
    return envelope(serialize_ai_processing_job(job))


@router.post("/{job_id}/create-cost-draft")
def create_cost_draft(
    job_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:manage")),
):
    actual = create_draft_from_ai_job(db, user, job_id)
    return envelope(serialize_trip_cost_actual(actual))
