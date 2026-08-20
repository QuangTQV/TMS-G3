from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..codegen import generate_code
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import (
    AccountsReceivable,
    Invoice,
    InvoiceStatus,
    ReceivablePayment,
    ReceivableStatus,
    ReconciliationStatement,
    ReconciliationStatus,
    ReconciliationType,
)
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import (
    CreateInvoiceFromStatementRequest,
    MarkInvoiceDisputedRequest,
    RecordPaymentRequest,
    VoidInvoiceRequest,
)
from ..serializers import serialize_invoice

statement_invoice_router = APIRouter(
    prefix="/v1/reconciliation-statements/{statement_id}/invoice", tags=["invoices"]
)
router = APIRouter(prefix="/v1/invoices", tags=["invoices"])

ENTITY_TYPE = "Invoice"

NON_VOIDABLE = {InvoiceStatus.PAID, InvoiceStatus.VOIDED, InvoiceStatus.REPLACED}
DISPUTABLE = {InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID}


def _load(db: Session, invoice_id: str) -> Invoice | None:
    return db.scalar(
        select(Invoice)
        .options(
            selectinload(Invoice.accountsReceivable).selectinload(AccountsReceivable.payments),
            selectinload(Invoice.customer),
            selectinload(Invoice.reconciliationStatement).selectinload(ReconciliationStatement.lines),
        )
        .where(Invoice.id == invoice_id)
    )


def _get_or_404(db: Session, user: AuthenticatedUser, invoice_id: str) -> Invoice:
    invoice = _load(db, invoice_id)
    if invoice is None:
        raise ApiError(404, "Không tìm thấy hóa đơn")
    assert_branch_scope(user, invoice.branchId)
    return invoice


@statement_invoice_router.post("")
def create_from_statement(
    statement_id: str,
    dto: CreateInvoiceFromStatementRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:manage")),
):
    statement = db.scalar(
        select(ReconciliationStatement)
        .options(selectinload(ReconciliationStatement.invoice))
        .where(ReconciliationStatement.id == statement_id)
    )
    if statement is None:
        raise ApiError(404, "Không tìm thấy bảng đối soát")
    assert_branch_scope(user, statement.branchId)
    if statement.type != ReconciliationType.CUSTOMER or not statement.customerId:
        raise ApiError(400, "Chỉ bảng đối soát khách hàng mới phát hành hóa đơn")
    if statement.status != ReconciliationStatus.LOCKED:
        raise ApiError(400, "Chỉ bảng đối soát đã khóa mới phát hành được hóa đơn")
    if statement.invoice is not None:
        raise ApiError(400, "Bảng đối soát này đã có hóa đơn")

    subtotal = statement.totalAmount
    vat_amount = dto.vatAmount
    total = subtotal + vat_amount

    invoice = Invoice(
        branchId=statement.branchId,
        customerId=statement.customerId,
        reconciliationStatementId=statement.id,
        code=generate_code("INV"),
        subtotal=subtotal,
        vatAmount=vat_amount,
        total=total,
        dueDate=datetime.fromisoformat(dto.dueDate) if dto.dueDate else None,
        createdByUserId=user.user_id,
    )
    db.add(invoice)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=invoice.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_invoice(invoice, with_relations=False),
    )
    db.commit()
    invoice = _get_or_404(db, user, invoice.id)
    return envelope(serialize_invoice(invoice))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:read")),
):
    stmt = select(Invoice).where(Invoice.branchId == user.branch_id).order_by(Invoice.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Invoice.createdAt).where(Invoice.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Invoice.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_invoice(r, with_relations=False) for r in page["data"]], "meta": page["meta"]})


@router.get("/{invoice_id}")
def find_one(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:read")),
):
    invoice = _get_or_404(db, user, invoice_id)
    return envelope(serialize_invoice(invoice))


def _transition(
    db: Session,
    user: AuthenticatedUser,
    invoice_id: str,
    from_status: InvoiceStatus,
    to_status: InvoiceStatus,
    action: str,
    reason: str | None = None,
    extra: dict | None = None,
) -> Invoice:
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise ApiError(404, "Không tìm thấy hóa đơn")
    assert_branch_scope(user, invoice.branchId)
    if invoice.status != from_status:
        raise ApiError(400, f"Hóa đơn phải ở trạng thái {from_status.value}")

    before_status = invoice.status.value
    invoice.status = to_status
    for key, value in (extra or {}).items():
        setattr(invoice, key, value)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=invoice_id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": invoice.status.value},
    )
    db.commit()
    return _get_or_404(db, user, invoice_id)


@router.patch("/{invoice_id}/submit")
def submit(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:manage")),
):
    invoice = _transition(db, user, invoice_id, InvoiceStatus.DRAFT, InvoiceStatus.PENDING_APPROVAL, "SUBMIT")
    return envelope(serialize_invoice(invoice))


@router.patch("/{invoice_id}/issue")
def issue(
    invoice_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:issue")),
):
    """Tích hợp VNPT thật CHƯA làm — đánh dấu eInvoiceStatus=PENDING_INTEGRATION
    thay vì chặn luồng nghiệp vụ chính. Sinh AccountsReceivable ngay khi phát hành
    nội bộ."""
    before = db.get(Invoice, invoice_id)
    if before is None:
        raise ApiError(404, "Không tìm thấy hóa đơn")
    assert_branch_scope(user, before.branchId)
    if before.status != InvoiceStatus.PENDING_APPROVAL:
        raise ApiError(400, "Chỉ hóa đơn chờ duyệt mới có thể phát hành")

    before_status = before.status.value
    before.status = InvoiceStatus.ISSUED
    before.issuedAt = datetime.utcnow()
    before.eInvoiceStatus = "PENDING_INTEGRATION"
    db.flush()

    receivable = AccountsReceivable(
        branchId=before.branchId,
        customerId=before.customerId,
        invoiceId=before.id,
        amount=before.total,
        dueDate=before.dueDate,
    )
    db.add(receivable)
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=invoice_id,
        action="ISSUE",
        actor_user_id=user.user_id,
        before_state={"status": before_status},
        after_state={"status": before.status.value, "accountsReceivableId": receivable.id},
    )
    db.commit()
    invoice = _get_or_404(db, user, invoice_id)
    return envelope(serialize_invoice(invoice))


@router.patch("/{invoice_id}/void")
def void_invoice(
    invoice_id: str,
    dto: VoidInvoiceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:void")),
):
    before = db.get(Invoice, invoice_id)
    if before is None:
        raise ApiError(404, "Không tìm thấy hóa đơn")
    assert_branch_scope(user, before.branchId)
    if before.status in NON_VOIDABLE:
        raise ApiError(400, f"Không thể hủy hóa đơn ở trạng thái {before.status.value}")

    invoice = _transition(
        db, user, invoice_id, before.status, InvoiceStatus.VOIDED, "VOID", dto.reason, {"voidReason": dto.reason}
    )
    return envelope(serialize_invoice(invoice))


@router.patch("/{invoice_id}/mark-disputed")
def mark_disputed(
    invoice_id: str,
    dto: MarkInvoiceDisputedRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:manage")),
):
    before = db.get(Invoice, invoice_id)
    if before is None:
        raise ApiError(404, "Không tìm thấy hóa đơn")
    assert_branch_scope(user, before.branchId)
    if before.status not in DISPUTABLE:
        raise ApiError(400, "Chỉ hóa đơn đã phát hành mới có thể đánh dấu tranh chấp")

    invoice = _transition(
        db,
        user,
        invoice_id,
        before.status,
        InvoiceStatus.DISPUTED,
        "MARK_DISPUTED",
        dto.reason,
        {"disputeReason": dto.reason},
    )
    return envelope(serialize_invoice(invoice))


@router.post("/{invoice_id}/payments")
def record_payment(
    invoice_id: str,
    dto: RecordPaymentRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("invoice:record-payment")),
):
    """Ghi nhận thanh toán — cập nhật AccountsReceivable và phản ánh ngược lên
    Invoice.status (PartiallyPaid/Paid)."""
    invoice = db.scalar(
        select(Invoice).options(selectinload(Invoice.accountsReceivable)).where(Invoice.id == invoice_id)
    )
    if invoice is None or invoice.accountsReceivable is None:
        raise ApiError(404, "Không tìm thấy công nợ phải thu của hóa đơn này")
    assert_branch_scope(user, invoice.branchId)
    receivable = invoice.accountsReceivable
    if receivable.status == ReceivableStatus.PAID:
        raise ApiError(400, "Hóa đơn này đã thanh toán đủ")

    new_paid = receivable.paidAmount + dto.amount
    if new_paid > receivable.amount:
        raise ApiError(400, "Số tiền thanh toán vượt quá công nợ còn lại")

    new_receivable_status = ReceivableStatus.PAID if new_paid == receivable.amount else ReceivableStatus.PARTIALLY_PAID
    new_invoice_status = InvoiceStatus.PAID if new_receivable_status == ReceivableStatus.PAID else InvoiceStatus.PARTIALLY_PAID

    payment = ReceivablePayment(
        accountsReceivableId=receivable.id,
        amount=dto.amount,
        method=dto.method,
        reference=dto.reference,
        recordedByUserId=user.user_id,
    )
    db.add(payment)
    receivable.paidAmount = new_paid
    receivable.status = new_receivable_status
    invoice.status = new_invoice_status
    db.flush()

    record_audit_log(
        db,
        entity_type="AccountsReceivable",
        entity_id=receivable.id,
        action="RECORD_PAYMENT",
        actor_user_id=user.user_id,
        after_state={"paymentId": payment.id, "amount": str(dto.amount), "paidAmount": str(new_paid)},
    )
    db.commit()
    invoice = _get_or_404(db, user, invoice_id)
    return envelope(serialize_invoice(invoice))
