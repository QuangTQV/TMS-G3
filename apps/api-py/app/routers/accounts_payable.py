from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import (
    AccountsPayable,
    PayablePayment,
    PayableStatus,
    ReconciliationStatement,
    ReconciliationStatus,
    ReconciliationType,
)
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateAccountsPayableFromStatementRequest, RecordPaymentRequest
from ..serializers import serialize_accounts_payable

statement_router = APIRouter(
    prefix="/v1/reconciliation-statements/{statement_id}/accounts-payable", tags=["accounts-payable"]
)
router = APIRouter(prefix="/v1/accounts-payable", tags=["accounts-payable"])

ENTITY_TYPE = "AccountsPayable"


def _load(db: Session, payable_id: str) -> AccountsPayable | None:
    return db.scalar(
        select(AccountsPayable)
        .options(
            selectinload(AccountsPayable.payments),
            selectinload(AccountsPayable.carrier),
            selectinload(AccountsPayable.reconciliationStatement).selectinload(ReconciliationStatement.lines),
        )
        .where(AccountsPayable.id == payable_id)
    )


def _get_or_404(db: Session, user: AuthenticatedUser, payable_id: str) -> AccountsPayable:
    payable = _load(db, payable_id)
    if payable is None:
        raise ApiError(404, "Không tìm thấy công nợ phải trả")
    assert_branch_scope(user, payable.branchId)
    return payable


@statement_router.post("")
def create_from_statement(
    statement_id: str,
    dto: CreateAccountsPayableFromStatementRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("accounts-payable:manage")),
):
    """Chỉ tạo được từ 1 ReconciliationStatement CARRIER đã LOCKED — G3 không phát
    hành hóa đơn ở chiều này, chỉ ghi nhận công nợ phải trả."""
    statement = db.scalar(
        select(ReconciliationStatement)
        .options(selectinload(ReconciliationStatement.accountsPayable))
        .where(ReconciliationStatement.id == statement_id)
    )
    if statement is None:
        raise ApiError(404, "Không tìm thấy bảng đối soát")
    assert_branch_scope(user, statement.branchId)
    if statement.type != ReconciliationType.CARRIER or not statement.carrierId:
        raise ApiError(400, "Chỉ bảng đối soát nhà vận tải mới tạo được công nợ phải trả")
    if statement.status != ReconciliationStatus.LOCKED:
        raise ApiError(400, "Chỉ bảng đối soát đã khóa mới tạo được công nợ")
    if statement.accountsPayable is not None:
        raise ApiError(400, "Bảng đối soát này đã có công nợ phải trả")

    payable = AccountsPayable(
        branchId=statement.branchId,
        carrierId=statement.carrierId,
        reconciliationStatementId=statement.id,
        amount=statement.totalAmount,
        dueDate=datetime.fromisoformat(dto.dueDate) if dto.dueDate else None,
    )
    db.add(payable)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=payable.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_accounts_payable(payable, with_relations=False),
    )
    db.commit()
    payable = _get_or_404(db, user, payable.id)
    return envelope(serialize_accounts_payable(payable))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("accounts-payable:read")),
):
    stmt = (
        select(AccountsPayable)
        .where(AccountsPayable.branchId == user.branch_id)
        .order_by(AccountsPayable.createdAt.desc())
    )
    if cursor:
        anchor = db.scalar(select(AccountsPayable.createdAt).where(AccountsPayable.id == cursor))
        if anchor is not None:
            stmt = stmt.where(AccountsPayable.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope(
        {"data": [serialize_accounts_payable(r, with_relations=False) for r in page["data"]], "meta": page["meta"]}
    )


@router.get("/{payable_id}")
def find_one(
    payable_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("accounts-payable:read")),
):
    payable = _get_or_404(db, user, payable_id)
    return envelope(serialize_accounts_payable(payable))


@router.post("/{payable_id}/payments")
def record_payment(
    payable_id: str,
    dto: RecordPaymentRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("accounts-payable:record-payment")),
):
    payable = db.get(AccountsPayable, payable_id)
    if payable is None:
        raise ApiError(404, "Không tìm thấy công nợ phải trả")
    assert_branch_scope(user, payable.branchId)
    if payable.status == PayableStatus.PAID:
        raise ApiError(400, "Công nợ này đã thanh toán đủ")

    new_paid = payable.paidAmount + dto.amount
    if new_paid > payable.amount:
        raise ApiError(400, "Số tiền thanh toán vượt quá công nợ còn lại")
    new_status = PayableStatus.PAID if new_paid == payable.amount else PayableStatus.PARTIALLY_PAID

    payment = PayablePayment(
        accountsPayableId=payable_id,
        amount=dto.amount,
        method=dto.method,
        reference=dto.reference,
        recordedByUserId=user.user_id,
    )
    db.add(payment)
    payable.paidAmount = new_paid
    payable.status = new_status
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=payable_id,
        action="RECORD_PAYMENT",
        actor_user_id=user.user_id,
        after_state={"paymentId": payment.id, "amount": str(dto.amount), "paidAmount": str(new_paid)},
    )
    db.commit()
    payable = _get_or_404(db, user, payable_id)
    return envelope(serialize_accounts_payable(payable))
