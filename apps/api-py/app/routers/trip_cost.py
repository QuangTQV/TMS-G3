from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import (
    AdvanceStatus,
    AIJobStatus,
    AIJobType,
    AIProcessingJob,
    Advance,
    DocumentEvidence,
    Trip,
    TripCostActual,
    TripCostActualStatus,
    TripCostCategory,
    TripCostPlan,
    TripStatus,
)
from ..response import envelope
from ..schemas import (
    CancelAdvanceRequest,
    CreateAdvanceRequest,
    CreateTripCostActualRequest,
    CreateTripCostPlanRequest,
    RejectTripCostActualRequest,
)
from ..serializers import serialize_advance, serialize_trip_cost_actual, serialize_trip_cost_plan

trip_financials_router = APIRouter(prefix="/v1/trips/{trip_id}/financials", tags=["trip-cost"])
financials_router = APIRouter(prefix="/v1/financials", tags=["trip-cost"])

ALLOWED_ACTUAL_TRIP_STATUSES = {TripStatus.COMPLETED_VERIFIED, TripStatus.CLOSED}
NON_CANCELLABLE_ADVANCE_STATUSES = {AdvanceStatus.PAID, AdvanceStatus.SETTLED, AdvanceStatus.CANCELLED}


def _get_trip(db: Session, user: AuthenticatedUser, trip_id: str) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise ApiError(404, "Không tìm thấy chuyến")
    assert_branch_scope(user, trip.branchId)
    return trip


def _assert_not_cancelled(status: TripStatus) -> None:
    if status == TripStatus.CANCELLED:
        raise ApiError(400, "Không thể ghi nhận tài chính cho chuyến đã hủy")


def _assert_evidence(user: AuthenticatedUser, db: Session, trip: Trip, evidence_id: str) -> None:
    evidence = db.get(DocumentEvidence, evidence_id)
    if evidence is None or evidence.tripId != trip.id or evidence.branchId != trip.branchId:
        raise ApiError(400, "Chứng từ chi phí không thuộc chuyến này")
    assert_branch_scope(user, evidence.branchId)


@trip_financials_router.get("")
def summary(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:read")),
):
    trip = _get_trip(db, user, trip_id)
    plans = list(db.scalars(select(TripCostPlan).where(TripCostPlan.tripId == trip_id).order_by(TripCostPlan.createdAt.desc())))
    actuals = list(
        db.scalars(select(TripCostActual).where(TripCostActual.tripId == trip_id).order_by(TripCostActual.createdAt.desc()))
    )
    advances = list(db.scalars(select(Advance).where(Advance.tripId == trip_id).order_by(Advance.createdAt.desc())))

    planned = sum((p.amount for p in plans), Decimal("0"))
    actual_approved = sum((a.amount for a in actuals if a.status == TripCostActualStatus.APPROVED), Decimal("0"))
    advance_paid = sum((a.amount for a in advances if a.status == AdvanceStatus.PAID), Decimal("0"))

    return envelope(
        {
            "tripId": trip.id,
            "plans": [serialize_trip_cost_plan(p) for p in plans],
            "actuals": [serialize_trip_cost_actual(a) for a in actuals],
            "advances": [serialize_advance(a) for a in advances],
            "totals": {
                # Khác các field Decimal khác trong dự án: NestJS tính tổng qua
                # `.toNumber()` (JS number thường) chứ không giữ Prisma Decimal, nên
                # serialize thành number JSON thật, không phải string — khớp type
                # `totals: {planned:number,...}` phía apps/web/src/features/trips/api.ts.
                "planned": float(planned),
                "actualApproved": float(actual_approved),
                "advancePaid": float(advance_paid),
            },
        }
    )


@trip_financials_router.post("/plans")
def create_plan(
    trip_id: str,
    dto: CreateTripCostPlanRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:manage")),
):
    trip = _get_trip(db, user, trip_id)
    _assert_not_cancelled(trip.status)

    plan = TripCostPlan(
        branchId=trip.branchId,
        tripId=trip_id,
        category=TripCostCategory(dto.category),
        description=dto.description,
        amount=dto.amount,
        createdByUserId=user.user_id,
    )
    db.add(plan)
    db.flush()
    record_audit_log(
        db,
        entity_type="TripCostPlan",
        entity_id=plan.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_trip_cost_plan(plan),
    )
    db.commit()
    db.refresh(plan)
    return envelope(serialize_trip_cost_plan(plan))


@trip_financials_router.post("/actuals")
def create_actual(
    trip_id: str,
    dto: CreateTripCostActualRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:manage")),
):
    trip = _get_trip(db, user, trip_id)
    if trip.status not in ALLOWED_ACTUAL_TRIP_STATUSES:
        raise ApiError(400, "Chỉ khai chi phí sau khi chuyến đã xác thực chứng từ")
    if dto.evidenceId:
        _assert_evidence(user, db, trip, dto.evidenceId)

    actual = TripCostActual(
        branchId=trip.branchId,
        tripId=trip_id,
        category=TripCostCategory(dto.category),
        description=dto.description,
        amount=dto.amount,
        incurredAt=datetime.fromisoformat(dto.incurredAt),
        evidenceId=dto.evidenceId,
        submittedByUserId=user.user_id,
    )
    db.add(actual)
    db.flush()
    record_audit_log(
        db,
        entity_type="TripCostActual",
        entity_id=actual.id,
        action="CREATE_DRAFT",
        actor_user_id=user.user_id,
        after_state=serialize_trip_cost_actual(actual),
    )
    db.commit()
    db.refresh(actual)
    return envelope(serialize_trip_cost_actual(actual))


def create_draft_from_ai_job(db: Session, user: AuthenticatedUser, ai_job_id: str) -> TripCostActual:
    """Module 8 sở hữu phiếu chi phí. Module AI chỉ yêu cầu tạo nháp từ kết quả OCR
    đã qua validate, tuyệt đối không tự duyệt hay tự sửa số tiền."""
    job = db.get(AIProcessingJob, ai_job_id)
    if job is None or job.extractionResult is None:
        raise ApiError(404, "Không tìm thấy kết quả AI")
    extraction = job.extractionResult
    assert_branch_scope(user, job.documentEvidence.branchId)
    if job.jobType != AIJobType.INVOICE_OCR or job.status != AIJobStatus.VERIFIED:
        raise ApiError(400, "Chỉ kết quả OCR hóa đơn đã xác thực mới tạo được chi phí nháp")
    if extraction.invoiceTotal is None:
        raise ApiError(400, "Kết quả OCR không có tổng tiền hóa đơn")

    actual = TripCostActual(
        branchId=job.documentEvidence.branchId,
        tripId=job.documentEvidence.tripId,
        category=TripCostCategory.OTHER,
        description=f"OCR hóa đơn {extraction.invoiceNumber or ''} - {extraction.invoiceIssuer or ''}".strip(),
        amount=extraction.invoiceTotal,
        incurredAt=extraction.invoiceDate or datetime.utcnow(),
        evidenceId=job.documentEvidenceId,
        submittedByUserId=user.user_id,
    )
    db.add(actual)
    db.flush()
    record_audit_log(
        db,
        entity_type="TripCostActual",
        entity_id=actual.id,
        action="CREATE_FROM_AI",
        actor_user_id=user.user_id,
        after_state={"aiJobId": ai_job_id, "amount": str(actual.amount), "evidenceId": actual.evidenceId},
    )
    db.commit()
    db.refresh(actual)
    return actual


def _change_actual_status(
    db: Session,
    user: AuthenticatedUser,
    actual_id: str,
    from_status: TripCostActualStatus,
    to_status: TripCostActualStatus,
    action: str,
    extra: dict | None = None,
    reason: str | None = None,
) -> TripCostActual:
    actual = db.get(TripCostActual, actual_id)
    if actual is None:
        raise ApiError(404, "Không tìm thấy chi phí thực tế")
    assert_branch_scope(user, actual.branchId)
    if actual.status != from_status:
        raise ApiError(400, f"Chi phí phải ở trạng thái {from_status.value}")

    before_status = actual.status.value
    actual.status = to_status
    for key, value in (extra or {}).items():
        setattr(actual, key, value)
    db.flush()
    record_audit_log(
        db,
        entity_type="TripCostActual",
        entity_id=actual_id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": actual.status.value},
    )
    db.commit()
    db.refresh(actual)
    return actual


@financials_router.post("/actuals/{actual_id}/submit")
def submit_actual(
    actual_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:manage")),
):
    actual = _change_actual_status(
        db, user, actual_id, TripCostActualStatus.DRAFT, TripCostActualStatus.SUBMITTED, "SUBMIT"
    )
    return envelope(serialize_trip_cost_actual(actual))


@financials_router.post("/actuals/{actual_id}/approve")
def approve_actual(
    actual_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:approve")),
):
    actual = _change_actual_status(
        db,
        user,
        actual_id,
        TripCostActualStatus.SUBMITTED,
        TripCostActualStatus.APPROVED,
        "APPROVE",
        {"approvedByUserId": user.user_id, "approvedAt": datetime.utcnow(), "rejectionReason": None},
    )
    return envelope(serialize_trip_cost_actual(actual))


@financials_router.post("/actuals/{actual_id}/reject")
def reject_actual(
    actual_id: str,
    dto: RejectTripCostActualRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip-cost:approve")),
):
    actual = _change_actual_status(
        db,
        user,
        actual_id,
        TripCostActualStatus.SUBMITTED,
        TripCostActualStatus.REJECTED,
        "REJECT",
        {"rejectionReason": dto.reason},
        dto.reason,
    )
    return envelope(serialize_trip_cost_actual(actual))


@trip_financials_router.post("/advances")
def create_advance(
    trip_id: str,
    dto: CreateAdvanceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("advance:manage")),
):
    trip = _get_trip(db, user, trip_id)
    _assert_not_cancelled(trip.status)

    advance = Advance(
        branchId=trip.branchId,
        tripId=trip_id,
        recipientName=dto.recipientName,
        amount=dto.amount,
        purpose=dto.purpose,
        requestedByUserId=user.user_id,
    )
    db.add(advance)
    db.flush()
    record_audit_log(
        db,
        entity_type="Advance",
        entity_id=advance.id,
        action="REQUEST",
        actor_user_id=user.user_id,
        after_state=serialize_advance(advance),
    )
    db.commit()
    db.refresh(advance)
    return envelope(serialize_advance(advance))


def _change_advance_status(
    db: Session,
    user: AuthenticatedUser,
    advance_id: str,
    from_status: AdvanceStatus,
    to_status: AdvanceStatus,
    action: str,
    extra: dict | None = None,
    reason: str | None = None,
) -> Advance:
    advance = db.get(Advance, advance_id)
    if advance is None:
        raise ApiError(404, "Không tìm thấy tạm ứng")
    assert_branch_scope(user, advance.branchId)
    if advance.status != from_status:
        raise ApiError(400, f"Tạm ứng phải ở trạng thái {from_status.value}")

    before_status = advance.status.value
    advance.status = to_status
    for key, value in (extra or {}).items():
        setattr(advance, key, value)
    db.flush()
    record_audit_log(
        db,
        entity_type="Advance",
        entity_id=advance_id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": advance.status.value},
    )
    db.commit()
    db.refresh(advance)
    return advance


@financials_router.post("/advances/{advance_id}/approve")
def approve_advance(
    advance_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("advance:approve")),
):
    advance = _change_advance_status(
        db, user, advance_id, AdvanceStatus.REQUESTED, AdvanceStatus.APPROVED, "APPROVE", {"approvedByUserId": user.user_id}
    )
    return envelope(serialize_advance(advance))


@financials_router.post("/advances/{advance_id}/pay")
def pay_advance(
    advance_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("advance:pay")),
):
    advance = _change_advance_status(
        db,
        user,
        advance_id,
        AdvanceStatus.APPROVED,
        AdvanceStatus.PAID,
        "PAY",
        {"paidByUserId": user.user_id, "paidAt": datetime.utcnow()},
    )
    return envelope(serialize_advance(advance))


@financials_router.post("/advances/{advance_id}/settle")
def settle_advance(
    advance_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("advance:manage")),
):
    advance = _change_advance_status(
        db, user, advance_id, AdvanceStatus.PAID, AdvanceStatus.SETTLED, "SETTLE", {"settledAt": datetime.utcnow()}
    )
    return envelope(serialize_advance(advance))


@financials_router.post("/advances/{advance_id}/cancel")
def cancel_advance(
    advance_id: str,
    dto: CancelAdvanceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("advance:manage")),
):
    advance = db.get(Advance, advance_id)
    if advance is None:
        raise ApiError(404, "Không tìm thấy tạm ứng")
    assert_branch_scope(user, advance.branchId)
    if advance.status in NON_CANCELLABLE_ADVANCE_STATUSES:
        raise ApiError(400, "Tạm ứng ở trạng thái hiện tại không thể hủy")

    advance = _change_advance_status(
        db, user, advance_id, advance.status, AdvanceStatus.CANCELLED, "CANCEL", {"cancelReason": dto.reason}, dto.reason
    )
    return envelope(serialize_advance(advance))
