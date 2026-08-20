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
from ..models import Quote, QuoteLine, QuoteStatus, ShipmentOrder
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateQuoteRequest, RejectQuoteRequest
from ..serializers import serialize_quote, serialize_shipment_order
from .shipment_orders import create_shipment_order_from_quote

router = APIRouter(prefix="/v1/quotes", tags=["quotes"])

ENTITY_TYPE = "Quote"


def _get_or_404(db: Session, user: AuthenticatedUser, quote_id: str) -> Quote:
    quote = db.scalar(select(Quote).options(selectinload(Quote.lines)).where(Quote.id == quote_id))
    if quote is None:
        raise ApiError(404, "Không tìm thấy báo giá")
    assert_branch_scope(user, quote.branchId)
    return quote


@router.post("")
def create(
    dto: CreateQuoteRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:create")),
):
    # Luôn tính lại tổng tiền bằng code thường ở server, không tin tổng tiền client
    # gửi lên (ràng buộc 3, CLAUDE.md).
    sell_total = sum((line.quantity * line.unitPrice for line in dto.lines), Decimal("0"))
    margin_amount = sell_total - dto.estimatedBuyTotal if dto.estimatedBuyTotal is not None else None

    quote = Quote(
        branchId=user.branch_id,
        code=generate_code("QT"),
        customerId=dto.customerId,
        contractId=dto.contractId,
        sellTotal=sell_total,
        estimatedBuyTotal=dto.estimatedBuyTotal,
        marginAmount=margin_amount,
        validUntil=datetime.fromisoformat(dto.validUntil) if dto.validUntil else None,
        createdByUserId=user.user_id,
    )
    db.add(quote)
    db.flush()

    for line in dto.lines:
        db.add(
            QuoteLine(
                quoteId=quote.id,
                description=line.description,
                quantity=line.quantity,
                unitPrice=line.unitPrice,
                lineTotal=line.quantity * line.unitPrice,
            )
        )
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=quote.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_quote(quote),
    )
    db.commit()
    db.refresh(quote)
    return envelope(serialize_quote(quote))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:read")),
):
    stmt = select(Quote).where(Quote.branchId == user.branch_id).order_by(Quote.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Quote.createdAt).where(Quote.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Quote.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_quote(r, with_relations=False) for r in page["data"]], "meta": page["meta"]})


@router.get("/{quote_id}")
def find_one(
    quote_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:read")),
):
    quote = _get_or_404(db, user, quote_id)
    return envelope(serialize_quote(quote))


def _transition(
    db: Session,
    user: AuthenticatedUser,
    quote: Quote,
    status: QuoteStatus,
    action: str,
    extra: dict,
    reason: str | None = None,
) -> Quote:
    before_status = quote.status.value
    quote.status = status
    for key, value in extra.items():
        setattr(quote, key, value)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=quote.id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": quote.status.value},
    )
    db.commit()
    db.refresh(quote)
    return quote


@router.patch("/{quote_id}/approve-and-send")
def approve_and_send(
    quote_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:approve")),
):
    quote = _get_or_404(db, user, quote_id)
    if quote.status != QuoteStatus.DRAFT:
        raise ApiError(400, "Chỉ báo giá ở trạng thái nháp mới có thể duyệt và gửi")
    quote = _transition(db, user, quote, QuoteStatus.SENT, "APPROVE_AND_SEND", {"sentAt": datetime.utcnow()})
    return envelope(serialize_quote(quote))


@router.patch("/{quote_id}/accept")
def accept(
    quote_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:update")),
):
    quote = _get_or_404(db, user, quote_id)
    if quote.status != QuoteStatus.SENT:
        raise ApiError(400, "Chỉ báo giá đã gửi mới có thể chấp nhận")
    quote = _transition(db, user, quote, QuoteStatus.ACCEPTED, "ACCEPT", {"respondedAt": datetime.utcnow()})
    return envelope(serialize_quote(quote))


@router.patch("/{quote_id}/reject")
def reject(
    quote_id: str,
    dto: RejectQuoteRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:update")),
):
    quote = _get_or_404(db, user, quote_id)
    if quote.status != QuoteStatus.SENT:
        raise ApiError(400, "Chỉ báo giá đã gửi mới có thể từ chối")
    quote = _transition(
        db, user, quote, QuoteStatus.REJECTED, "REJECT", {"respondedAt": datetime.utcnow()}, dto.reason
    )
    return envelope(serialize_quote(quote))


@router.post("/{quote_id}/convert-to-order")
def convert_to_order(
    quote_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("quote:convert")),
):
    quote = _get_or_404(db, user, quote_id)
    if quote.status != QuoteStatus.ACCEPTED:
        raise ApiError(400, "Chỉ báo giá đã được khách hàng chấp nhận mới có thể chuyển đơn")

    existing_order = db.scalar(select(ShipmentOrder).where(ShipmentOrder.quoteId == quote_id))
    if existing_order is not None:
        raise ApiError(400, "Báo giá này đã được chuyển thành đơn trước đó")

    order = create_shipment_order_from_quote(
        db,
        user,
        quote_id=quote.id,
        customer_id=quote.customerId,
        sell_total=quote.sellTotal,
        estimated_buy_total=quote.estimatedBuyTotal,
    )
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=quote_id,
        action="CONVERT_TO_ORDER",
        actor_user_id=user.user_id,
        after_state={"shipmentOrderId": order.id},
    )
    db.commit()
    db.refresh(order)
    return envelope(serialize_shipment_order(order))
