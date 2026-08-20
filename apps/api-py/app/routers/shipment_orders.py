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
from ..models import Cargo, PickupDeliveryPoint, ShipmentOrder, ShipmentOrderStatus, StopType
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import ChangeStatusReasonRequest, CreateShipmentOrderRequest
from ..serializers import serialize_shipment_order

router = APIRouter(prefix="/v1/shipment-orders", tags=["shipment-orders"])

ENTITY_TYPE = "ShipmentOrder"

# Trạng thái còn được phép hủy — trước Delivered, theo docs/data-model.md mục 3.
CANCELLABLE_STATUSES = {
    ShipmentOrderStatus.DRAFT,
    ShipmentOrderStatus.CONFIRMED,
    ShipmentOrderStatus.PLANNED,
    ShipmentOrderStatus.IN_TRANSIT,
    ShipmentOrderStatus.HELD,
}


def create_shipment_order_from_quote(
    db: Session,
    user: AuthenticatedUser,
    *,
    quote_id: str,
    customer_id: str,
    sell_total: Decimal,
    estimated_buy_total: Decimal | None,
) -> ShipmentOrder:
    """Chuyển báo giá thành đơn không nhập lại dữ liệu (module 3 gọi qua đây) — giữ
    points/cargos trống, chờ bước "Hoàn thiện đơn". Chỉ add()/flush(), không commit
    — caller (QuoteService.convert_to_order) chịu trách nhiệm commit chung 1
    transaction với audit log của Quote."""
    order = ShipmentOrder(
        branchId=user.branch_id,
        code=generate_code("SO"),
        customerId=customer_id,
        quoteId=quote_id,
        sourceChannel="quote",
        sellTotal=sell_total,
        estimatedBuyTotal=estimated_buy_total,
        createdByUserId=user.user_id,
    )
    db.add(order)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=order.id,
        action="CREATE_FROM_QUOTE",
        actor_user_id=user.user_id,
        after_state=serialize_shipment_order(order),
    )
    return order


def _get_or_404(db: Session, user: AuthenticatedUser, order_id: str) -> ShipmentOrder:
    order = db.scalar(
        select(ShipmentOrder)
        .options(selectinload(ShipmentOrder.points), selectinload(ShipmentOrder.cargos))
        .where(ShipmentOrder.id == order_id)
    )
    if order is None:
        raise ApiError(404, "Không tìm thấy đơn vận chuyển")
    assert_branch_scope(user, order.branchId)
    return order


@router.post("")
def create(
    dto: CreateShipmentOrderRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("shipment-order:create")),
):
    order = ShipmentOrder(
        branchId=user.branch_id,
        code=generate_code("SO"),
        customerId=dto.customerId,
        quoteId=dto.quoteId,
        customerRef=dto.customerRef,
        sourceChannel=dto.sourceChannel,
        sellTotal=dto.sellTotal,
        estimatedBuyTotal=dto.estimatedBuyTotal,
        createdByUserId=user.user_id,
    )
    db.add(order)
    db.flush()

    for p in dto.points:
        db.add(
            PickupDeliveryPoint(
                shipmentOrderId=order.id,
                sequence=p.sequence,
                type=StopType(p.type),
                customerLocationId=p.customerLocationId,
                freeAddress=p.freeAddress,
                windowFrom=datetime.fromisoformat(p.windowFrom) if p.windowFrom else None,
                windowTo=datetime.fromisoformat(p.windowTo) if p.windowTo else None,
                bookingNumber=p.bookingNumber,
                containerNumber=p.containerNumber,
                sealNumber=p.sealNumber,
                depotCode=p.depotCode,
                cutOffAt=datetime.fromisoformat(p.cutOffAt) if p.cutOffAt else None,
            )
        )
    for c in dto.cargos:
        db.add(
            Cargo(
                shipmentOrderId=order.id,
                description=c.description,
                packageCount=c.packageCount,
                weightKg=c.weightKg,
                volumeCbm=c.volumeCbm,
                requiresStorage=c.requiresStorage,
            )
        )
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=order.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_shipment_order(order),
    )
    db.commit()
    db.refresh(order)
    return envelope(serialize_shipment_order(order))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("shipment-order:read")),
):
    stmt = select(ShipmentOrder).where(ShipmentOrder.branchId == user.branch_id).order_by(
        ShipmentOrder.createdAt.desc()
    )
    if cursor:
        anchor = db.scalar(select(ShipmentOrder.createdAt).where(ShipmentOrder.id == cursor))
        if anchor is not None:
            stmt = stmt.where(ShipmentOrder.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope(
        {"data": [serialize_shipment_order(r, with_relations=False) for r in page["data"]], "meta": page["meta"]}
    )


@router.get("/{order_id}")
def find_one(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("shipment-order:read")),
):
    order = _get_or_404(db, user, order_id)
    return envelope(serialize_shipment_order(order))


def _transition(
    db: Session,
    user: AuthenticatedUser,
    order: ShipmentOrder,
    status: ShipmentOrderStatus,
    action: str,
    reason: str | None = None,
) -> ShipmentOrder:
    before_status = order.status.value
    order.status = status
    if action == "CANCEL":
        order.cancelReason = reason
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=order.id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": order.status.value},
    )
    db.commit()
    db.refresh(order)
    return order


@router.patch("/{order_id}/confirm")
def confirm(
    order_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("shipment-order:update")),
):
    order = _get_or_404(db, user, order_id)
    if order.status != ShipmentOrderStatus.DRAFT:
        raise ApiError(400, "Chỉ đơn ở trạng thái nháp mới có thể xác nhận")
    order = _transition(db, user, order, ShipmentOrderStatus.CONFIRMED, "CONFIRM")
    return envelope(serialize_shipment_order(order))


@router.patch("/{order_id}/hold")
def hold(
    order_id: str,
    dto: ChangeStatusReasonRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("shipment-order:update")),
):
    order = _get_or_404(db, user, order_id)
    order = _transition(db, user, order, ShipmentOrderStatus.HELD, "HOLD", dto.reason)
    return envelope(serialize_shipment_order(order))


@router.patch("/{order_id}/cancel")
def cancel(
    order_id: str,
    dto: ChangeStatusReasonRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("shipment-order:cancel")),
):
    order = _get_or_404(db, user, order_id)
    if order.status not in CANCELLABLE_STATUSES:
        raise ApiError(400, f"Không thể hủy đơn ở trạng thái {order.status.value}")
    order = _transition(db, user, order, ShipmentOrderStatus.CANCELLED, "CANCEL", dto.reason)
    return envelope(serialize_shipment_order(order))
