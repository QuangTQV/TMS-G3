from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..idempotency import with_idempotency
from ..models import AIProcessingJob, DocumentEvidence, DocumentEvidenceStatus, RequiredDocumentType, Trip, TripStatus
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import RejectDocumentEvidenceRequest, UploadDocumentEvidenceRequest
from ..serializers import serialize_ai_processing_job, serialize_document_evidence
from .trips import complete_document_verification

ENTITY_TYPE = "DocumentEvidence"
UPLOAD_ENDPOINT = "POST /v1/trips/:tripId/documents"

trip_documents_router = APIRouter(prefix="/v1/trips/{trip_id}/documents", tags=["document-evidences"])
document_evidences_router = APIRouter(prefix="/v1/document-evidences", tags=["document-evidences"])


def _get_or_404(db: Session, user: AuthenticatedUser, evidence_id: str) -> DocumentEvidence:
    evidence = db.scalar(
        select(DocumentEvidence)
        .options(
            selectinload(DocumentEvidence.requiredDocumentType),
            selectinload(DocumentEvidence.aiJobs).selectinload(AIProcessingJob.extractionResult),
        )
        .where(DocumentEvidence.id == evidence_id)
    )
    if evidence is None:
        raise ApiError(404, "Không tìm thấy chứng từ")
    assert_branch_scope(user, evidence.branchId)
    return evidence


def _assert_mutable(db: Session, user: AuthenticatedUser, evidence_id: str) -> DocumentEvidence:
    evidence = db.get(DocumentEvidence, evidence_id)
    if evidence is None:
        raise ApiError(404, "Không tìm thấy chứng từ")
    assert_branch_scope(user, evidence.branchId)
    if evidence.status == DocumentEvidenceStatus.LOCKED:
        raise ApiError(400, "Chứng từ đã khóa, không thể sửa")
    return evidence


def recompute_trip_completion(db: Session, user: AuthenticatedUser, trip_id: str) -> None:
    """Điều kiện qua bước 7 (luồng nghiệp vụ): khi mọi RequiredDocumentType đang
    active đã có bằng chứng VERIFIED/LOCKED cho chuyến, tự chuyển Trip sang
    CompletedVerified. No-op nếu chuyến không ở CompletedPendingDocs hoặc chưa đủ
    chứng từ — đây là bước tiện ích tự động, không phải điều kiện tài chính bắt
    buộc đồng bộ tuyệt đối trong cùng transaction ghi chứng từ."""
    trip = db.get(Trip, trip_id)
    if trip is None or trip.status != TripStatus.COMPLETED_PENDING_DOCS:
        return

    required_types = list(db.scalars(select(RequiredDocumentType).where(RequiredDocumentType.isActive.is_(True))))
    if not required_types:
        return

    evidences = list(db.scalars(select(DocumentEvidence).where(DocumentEvidence.tripId == trip_id)))
    satisfied = all(
        any(
            e.requiredDocumentTypeId == t.id
            and e.status in (DocumentEvidenceStatus.VERIFIED, DocumentEvidenceStatus.LOCKED)
            for e in evidences
        )
        for t in required_types
    )
    if not satisfied:
        return

    complete_document_verification(db, user, trip_id)


@trip_documents_router.post("")
def upload(
    trip_id: str,
    dto: UploadDocumentEvidenceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:upload")),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    def do_upload():
        trip = db.get(Trip, trip_id)
        if trip is None:
            raise ApiError(404, "Không tìm thấy chuyến")
        assert_branch_scope(user, trip.branchId)

        doc_type = db.get(RequiredDocumentType, dto.requiredDocumentTypeId)
        if doc_type is None or not doc_type.isActive:
            raise ApiError(404, "Không tìm thấy loại chứng từ hợp lệ")

        evidence = DocumentEvidence(
            branchId=trip.branchId,
            tripId=trip.id,
            requiredDocumentTypeId=doc_type.id,
            fileUrl=dto.fileUrl,
            fileHash=dto.fileHash,
            uploadedByUserId=user.user_id,
        )
        db.add(evidence)
        db.flush()
        record_audit_log(
            db,
            entity_type=ENTITY_TYPE,
            entity_id=evidence.id,
            action="UPLOAD",
            actor_user_id=user.user_id,
            after_state=serialize_document_evidence(evidence, with_relations=False),
        )

        ai_job = None
        if doc_type.aiJobType is not None:
            ai_job = AIProcessingJob(documentEvidenceId=evidence.id, jobType=doc_type.aiJobType)
            db.add(ai_job)
            db.flush()
            record_audit_log(
                db,
                entity_type="AIProcessingJob",
                entity_id=ai_job.id,
                action="QUEUE",
                actor_user_id=user.user_id,
                after_state=serialize_ai_processing_job(ai_job, with_relations=False),
            )

        body = serialize_document_evidence(evidence, with_relations=False)
        body["aiJob"] = serialize_ai_processing_job(ai_job, with_relations=False) if ai_job is not None else None
        return body

    result = with_idempotency(db, idempotency_key, UPLOAD_ENDPOINT, do_upload)
    return envelope(result)


@trip_documents_router.get("")
def find_many_by_trip(
    trip_id: str,
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:read")),
):
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise ApiError(404, "Không tìm thấy chuyến")
    assert_branch_scope(user, trip.branchId)

    stmt = (
        select(DocumentEvidence)
        .options(selectinload(DocumentEvidence.requiredDocumentType), selectinload(DocumentEvidence.aiJobs))
        .where(DocumentEvidence.tripId == trip_id)
        .order_by(DocumentEvidence.createdAt.desc())
    )
    if cursor:
        anchor = db.scalar(select(DocumentEvidence.createdAt).where(DocumentEvidence.id == cursor))
        if anchor is not None:
            stmt = stmt.where(DocumentEvidence.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_document_evidence(r) for r in page["data"]], "meta": page["meta"]})


@document_evidences_router.get("/{evidence_id}")
def find_one(
    evidence_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:read")),
):
    evidence = _get_or_404(db, user, evidence_id)
    return envelope(serialize_document_evidence(evidence))


@document_evidences_router.patch("/{evidence_id}/verify")
def verify(
    evidence_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:verify")),
):
    evidence = _assert_mutable(db, user, evidence_id)
    before_status = evidence.status.value
    evidence.status = DocumentEvidenceStatus.VERIFIED
    evidence.rejectedReason = None
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=evidence_id,
        action="VERIFY",
        actor_user_id=user.user_id,
        before_state={"status": before_status},
        after_state={"status": evidence.status.value},
    )
    db.commit()
    recompute_trip_completion(db, user, evidence.tripId)
    evidence = _get_or_404(db, user, evidence_id)
    return envelope(serialize_document_evidence(evidence))


@document_evidences_router.patch("/{evidence_id}/reject")
def reject(
    evidence_id: str,
    dto: RejectDocumentEvidenceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:verify")),
):
    evidence = _assert_mutable(db, user, evidence_id)
    before_status = evidence.status.value
    evidence.status = DocumentEvidenceStatus.REJECTED
    evidence.rejectedReason = dto.reason
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=evidence_id,
        action="REJECT",
        actor_user_id=user.user_id,
        reason=dto.reason,
        before_state={"status": before_status},
        after_state={"status": evidence.status.value},
    )
    db.commit()
    evidence = _get_or_404(db, user, evidence_id)
    return envelope(serialize_document_evidence(evidence))


@document_evidences_router.patch("/{evidence_id}/lock")
def lock(
    evidence_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:lock")),
):
    import datetime

    evidence = db.get(DocumentEvidence, evidence_id)
    if evidence is None:
        raise ApiError(404, "Không tìm thấy chứng từ")
    assert_branch_scope(user, evidence.branchId)
    if evidence.status != DocumentEvidenceStatus.VERIFIED:
        raise ApiError(400, "Chỉ chứng từ đã xác thực mới có thể khóa")

    before_status = evidence.status.value
    evidence.status = DocumentEvidenceStatus.LOCKED
    evidence.lockedAt = datetime.datetime.utcnow()
    evidence.lockedByUserId = user.user_id
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=evidence_id,
        action="LOCK",
        actor_user_id=user.user_id,
        before_state={"status": before_status},
        after_state={"status": evidence.status.value},
    )
    db.commit()
    evidence = _get_or_404(db, user, evidence_id)
    return envelope(serialize_document_evidence(evidence))


@document_evidences_router.patch("/{evidence_id}/share")
def share(
    evidence_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-evidence:share")),
):
    import datetime

    evidence = db.get(DocumentEvidence, evidence_id)
    if evidence is None:
        raise ApiError(404, "Không tìm thấy chứng từ")
    assert_branch_scope(user, evidence.branchId)
    if evidence.status != DocumentEvidenceStatus.LOCKED:
        raise ApiError(400, "Chỉ chứng từ đã khóa mới có thể chia sẻ")

    evidence.sharedAt = datetime.datetime.utcnow()
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=evidence_id,
        action="SHARE",
        actor_user_id=user.user_id,
        after_state={"sharedAt": evidence.sharedAt},
    )
    db.commit()
    evidence = _get_or_404(db, user, evidence_id)
    return envelope(serialize_document_evidence(evidence))
