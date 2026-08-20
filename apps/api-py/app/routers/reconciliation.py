from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..codegen import generate_code
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import (
    Carrier,
    Customer,
    ReconciliationLine,
    ReconciliationStatement,
    ReconciliationStatus,
    ReconciliationType,
    ShipmentOrder,
    Trip,
)
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import (
    AddReconciliationLineRequest,
    CreateReconciliationStatementRequest,
    ReopenReconciliationStatementRequest,
)
from ..serializers import serialize_reconciliation_statement

router = APIRouter(prefix="/v1/reconciliation-statements", tags=["reconciliation"])

ENTITY_TYPE = "ReconciliationStatement"

# Trạng thái còn cho phép thêm/xóa dòng — REOPENED coi như "mở lại để sửa", vẫn
# chỉnh được cho tới khi confirm lại.
EDITABLE_STATUSES = {ReconciliationStatus.DRAFT, ReconciliationStatus.REOPENED}


def _load(db: Session, statement_id: str) -> ReconciliationStatement | None:
    return db.scalar(
        select(ReconciliationStatement)
        .options(
            selectinload(ReconciliationStatement.lines).selectinload(ReconciliationLine.shipmentOrder),
            selectinload(ReconciliationStatement.lines).selectinload(ReconciliationLine.trip),
            selectinload(ReconciliationStatement.invoice),
            selectinload(ReconciliationStatement.accountsPayable),
            selectinload(ReconciliationStatement.customer),
            selectinload(ReconciliationStatement.carrier),
        )
        .where(ReconciliationStatement.id == statement_id)
    )


def _get_or_404(db: Session, user: AuthenticatedUser, statement_id: str) -> ReconciliationStatement:
    statement = _load(db, statement_id)
    if statement is None:
        raise ApiError(404, "Không tìm thấy bảng đối soát")
    assert_branch_scope(user, statement.branchId)
    return statement


def _get_editable(db: Session, user: AuthenticatedUser, statement_id: str) -> ReconciliationStatement:
    statement = _get_or_404(db, user, statement_id)
    if statement.status not in EDITABLE_STATUSES:
        raise ApiError(400, f"Bảng đối soát ở trạng thái {statement.status.value} không thể sửa")
    return statement


def _recalculate_total(db: Session, statement_id: str) -> ReconciliationStatement:
    total = db.scalar(
        select(func.coalesce(func.sum(ReconciliationLine.amount), 0)).where(
            ReconciliationLine.statementId == statement_id
        )
    )
    statement = db.get(ReconciliationStatement, statement_id)
    statement.totalAmount = Decimal(total)
    db.flush()
    return statement


@router.post("")
def create(
    dto: CreateReconciliationStatementRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:manage")),
):
    if dto.type == "CUSTOMER":
        if not dto.customerId:
            raise ApiError(400, "Đối soát khách hàng cần customerId")
        customer = db.get(Customer, dto.customerId)
        if customer is None:
            raise ApiError(404, "Không tìm thấy khách hàng")
        assert_branch_scope(user, customer.branchId)
    else:
        if not dto.carrierId:
            raise ApiError(400, "Đối soát nhà vận tải cần carrierId")
        carrier = db.get(Carrier, dto.carrierId)
        if carrier is None:
            raise ApiError(404, "Không tìm thấy nhà vận tải")
        assert_branch_scope(user, carrier.branchId)

    statement = ReconciliationStatement(
        branchId=user.branch_id,
        code=generate_code("RC"),
        type=ReconciliationType(dto.type),
        customerId=dto.customerId if dto.type == "CUSTOMER" else None,
        carrierId=dto.carrierId if dto.type == "CARRIER" else None,
        periodFrom=datetime.fromisoformat(dto.periodFrom),
        periodTo=datetime.fromisoformat(dto.periodTo),
        createdByUserId=user.user_id,
    )
    db.add(statement)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=statement.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_reconciliation_statement(statement, with_relations=False),
    )
    db.commit()
    statement = _get_or_404(db, user, statement.id)
    return envelope(serialize_reconciliation_statement(statement))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    type: Literal["CUSTOMER", "CARRIER"] | None = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:read")),
):
    stmt = (
        select(ReconciliationStatement)
        .where(ReconciliationStatement.branchId == user.branch_id)
        .order_by(ReconciliationStatement.createdAt.desc())
    )
    if type:
        stmt = stmt.where(ReconciliationStatement.type == type)
    if cursor:
        anchor = db.scalar(select(ReconciliationStatement.createdAt).where(ReconciliationStatement.id == cursor))
        if anchor is not None:
            stmt = stmt.where(ReconciliationStatement.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope(
        {"data": [serialize_reconciliation_statement(r, with_relations=False) for r in page["data"]], "meta": page["meta"]}
    )


@router.get("/{statement_id}")
def find_one(
    statement_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:read")),
):
    statement = _get_or_404(db, user, statement_id)
    return envelope(serialize_reconciliation_statement(statement))


@router.post("/{statement_id}/lines")
def add_line(
    statement_id: str,
    dto: AddReconciliationLineRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:manage")),
):
    statement = _get_editable(db, user, statement_id)

    if statement.type == ReconciliationType.CUSTOMER:
        if not dto.shipmentOrderId:
            raise ApiError(400, "Dòng đối soát khách hàng cần tham chiếu shipmentOrderId")
        order = db.get(ShipmentOrder, dto.shipmentOrderId)
        if order is None or order.customerId != statement.customerId:
            raise ApiError(400, "Đơn không thuộc khách hàng của bảng đối soát này")
    else:
        if not dto.tripId:
            raise ApiError(400, "Dòng đối soát nhà vận tải cần tham chiếu tripId")
        trip = db.get(Trip, dto.tripId)
        if trip is None or trip.carrierId != statement.carrierId:
            raise ApiError(400, "Chuyến không thuộc nhà vận tải của bảng đối soát này")

    line = ReconciliationLine(
        statementId=statement.id,
        shipmentOrderId=dto.shipmentOrderId,
        tripId=dto.tripId,
        description=dto.description,
        amount=dto.amount,
        createdByUserId=user.user_id,
    )
    db.add(line)
    db.flush()
    after = _recalculate_total(db, statement.id)
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=statement.id,
        action="ADD_LINE",
        actor_user_id=user.user_id,
        after_state={"lineId": line.id, "amount": str(line.amount), "totalAmount": str(after.totalAmount)},
    )
    db.commit()
    statement = _get_or_404(db, user, statement_id)
    return envelope(serialize_reconciliation_statement(statement))


@router.delete("/{statement_id}/lines/{line_id}")
def remove_line(
    statement_id: str,
    line_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:manage")),
):
    statement = _get_editable(db, user, statement_id)
    line = db.get(ReconciliationLine, line_id)
    if line is None or line.statementId != statement.id:
        raise ApiError(404, "Không tìm thấy dòng đối soát")

    line_amount = line.amount
    db.delete(line)
    db.flush()
    after = _recalculate_total(db, statement.id)
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=statement.id,
        action="REMOVE_LINE",
        actor_user_id=user.user_id,
        before_state={"lineId": line_id, "amount": str(line_amount)},
        after_state={"totalAmount": str(after.totalAmount)},
    )
    db.commit()
    statement = _get_or_404(db, user, statement_id)
    return envelope(serialize_reconciliation_statement(statement))


def _transition(
    db: Session,
    user: AuthenticatedUser,
    statement: ReconciliationStatement,
    status: ReconciliationStatus,
    action: str,
    extra: dict | None = None,
    reason: str | None = None,
) -> ReconciliationStatement:
    before_status = statement.status.value
    statement.status = status
    for key, value in (extra or {}).items():
        setattr(statement, key, value)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=statement.id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": statement.status.value},
    )
    db.commit()
    return _get_or_404(db, user, statement.id)


@router.patch("/{statement_id}/confirm")
def confirm(
    statement_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:confirm")),
):
    statement = _get_editable(db, user, statement_id)
    line_count = db.scalar(
        select(func.count()).select_from(ReconciliationLine).where(ReconciliationLine.statementId == statement_id)
    )
    if not line_count:
        raise ApiError(400, "Bảng đối soát chưa có dòng nào để xác nhận")
    statement = _transition(
        db,
        user,
        statement,
        ReconciliationStatus.CONFIRMED,
        "CONFIRM",
        {"confirmedByUserId": user.user_id, "confirmedAt": datetime.utcnow()},
    )
    return envelope(serialize_reconciliation_statement(statement))


@router.patch("/{statement_id}/lock")
def lock(
    statement_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:confirm")),
):
    statement = _get_or_404(db, user, statement_id)
    if statement.status != ReconciliationStatus.CONFIRMED:
        raise ApiError(400, "Chỉ bảng đã xác nhận mới có thể khóa")
    statement = _transition(db, user, statement, ReconciliationStatus.LOCKED, "LOCK", {"lockedAt": datetime.utcnow()})
    return envelope(serialize_reconciliation_statement(statement))


@router.patch("/{statement_id}/reopen")
def reopen(
    statement_id: str,
    dto: ReopenReconciliationStatementRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("reconciliation:reopen")),
):
    statement = _get_or_404(db, user, statement_id)
    if statement.status != ReconciliationStatus.LOCKED:
        raise ApiError(400, "Chỉ bảng đã khóa mới có thể mở lại")
    if statement.invoice is not None or statement.accountsPayable is not None:
        raise ApiError(400, "Bảng đã phát sinh hóa đơn/công nợ, không thể mở lại — cần hủy hóa đơn/công nợ trước")
    statement = _transition(
        db, user, statement, ReconciliationStatus.REOPENED, "REOPEN", {"reopenReason": dto.reason}, dto.reason
    )
    return envelope(serialize_reconciliation_statement(statement))
