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
    Carrier,
    CarrierStatus,
    Driver,
    ShipmentOrder,
    ShipmentOrderStatus,
    Trip,
    TripOrderLink,
    TripStatus,
    Vehicle,
)
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import (
    AssignResourceRequest,
    ChangeStatusReasonRequest,
    CreateTripRequest,
    LinkOrderRequest,
    UnlinkOrderRequest,
)
from ..serializers import serialize_carrier, serialize_driver, serialize_trip, serialize_vehicle

router = APIRouter(prefix="/v1/trips", tags=["trips"])

ENTITY_TYPE = "Trip"

# Chuyến còn có thể hủy — trước khi Closed.
CANCELLABLE_STATUSES = {
    TripStatus.PLANNED,
    TripStatus.DISPATCHED,
    TripStatus.IN_PROGRESS,
    TripStatus.PAUSED,
    TripStatus.COMPLETED_PENDING_DOCS,
    TripStatus.EXCEPTION,
}

# Chuyến coi là "đang chiếm dụng" nguồn lực khi gợi ý/kiểm tra bận-rảnh.
# CompletedPendingDocs không tính là bận: hàng đã giao xong, chỉ còn chờ chứng từ.
OCCUPYING_STATUSES = {TripStatus.PLANNED, TripStatus.DISPATCHED, TripStatus.IN_PROGRESS, TripStatus.PAUSED}


def _get_or_404(db: Session, user: AuthenticatedUser, trip_id: str) -> Trip:
    trip = db.scalar(
        select(Trip)
        .options(
            selectinload(Trip.stops),
            selectinload(Trip.orderLinks).selectinload(TripOrderLink.shipmentOrder),
            selectinload(Trip.vehicle),
            selectinload(Trip.driver),
            selectinload(Trip.carrier),
        )
        .where(Trip.id == trip_id)
    )
    if trip is None:
        raise ApiError(404, "Không tìm thấy chuyến")
    assert_branch_scope(user, trip.branchId)
    return trip


@router.post("")
def create(
    dto: CreateTripRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:create")),
):
    trip = Trip(
        branchId=user.branch_id,
        code=generate_code("TRIP"),
        isOutsourced=dto.isOutsourced,
        createdByUserId=user.user_id,
    )
    db.add(trip)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=trip.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_trip(trip, with_relations=False),
    )
    db.commit()
    db.refresh(trip)
    return envelope(serialize_trip(trip, with_relations=False))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:read")),
):
    stmt = select(Trip).where(Trip.branchId == user.branch_id).order_by(Trip.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Trip.createdAt).where(Trip.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Trip.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_trip(r, with_relations=False) for r in page["data"]], "meta": page["meta"]})


@router.get("/{trip_id}")
def find_one(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:read")),
):
    trip = _get_or_404(db, user, trip_id)
    return envelope(serialize_trip(trip))


@router.post("/{trip_id}/orders")
def link_order(
    trip_id: str,
    dto: LinkOrderRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)
    order = db.get(ShipmentOrder, dto.shipmentOrderId)
    if order is None:
        raise ApiError(404, "Không tìm thấy đơn vận chuyển")
    assert_branch_scope(user, order.branchId)
    if order.status not in (ShipmentOrderStatus.CONFIRMED, ShipmentOrderStatus.PLANNED):
        raise ApiError(400, "Chỉ đơn đã xác nhận mới có thể ghép vào chuyến")

    link = TripOrderLink(tripId=trip.id, shipmentOrderId=dto.shipmentOrderId, splitReason=dto.splitReason)
    db.add(link)
    if order.status == ShipmentOrderStatus.CONFIRMED:
        order.status = ShipmentOrderStatus.PLANNED
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=trip.id,
        action="LINK_ORDER",
        actor_user_id=user.user_id,
        reason=dto.splitReason,
        after_state={"shipmentOrderId": dto.shipmentOrderId},
    )
    db.commit()
    trip = _get_or_404(db, user, trip_id)
    return envelope(serialize_trip(trip))


@router.delete("/{trip_id}/orders/{shipment_order_id}")
def unlink_order(
    trip_id: str,
    shipment_order_id: str,
    dto: UnlinkOrderRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)
    link = next((link for link in trip.orderLinks if link.shipmentOrderId == shipment_order_id), None)
    if link is None:
        raise ApiError(404, "Đơn này chưa được ghép vào chuyến")

    db.delete(link)
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=trip.id,
        action="UNLINK_ORDER",
        actor_user_id=user.user_id,
        reason=dto.reason,
        before_state={"shipmentOrderId": shipment_order_id},
    )
    db.commit()
    return envelope(None)


def _busy_resource_ids(db: Session, branch_id: str, exclude_trip_id: str, field: str) -> set[str]:
    column = getattr(Trip, field)
    rows = db.scalars(
        select(column).where(
            Trip.branchId == branch_id,
            Trip.id != exclude_trip_id,
            Trip.status.in_(OCCUPYING_STATUSES),
            column.is_not(None),
        )
    )
    return {r for r in rows if r is not None}


@router.get("/{trip_id}/resource-suggestions")
def suggest_resources(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:read")),
):
    trip = _get_or_404(db, user, trip_id)

    order_ids = [link.shipmentOrderId for link in trip.orderLinks]
    orders = (
        list(
            db.scalars(
                select(ShipmentOrder).options(selectinload(ShipmentOrder.cargos)).where(ShipmentOrder.id.in_(order_ids))
            )
        )
        if order_ids
        else []
    )
    cargos = [c for o in orders for c in o.cargos]
    has_weight_data = any(c.weightKg is not None for c in cargos)
    required_weight_kg = sum((c.weightKg or Decimal("0") for c in cargos), Decimal("0")) if has_weight_data else None

    if trip.isOutsourced:
        carriers = list(
            db.scalars(
                select(Carrier)
                .where(Carrier.branchId == trip.branchId, Carrier.status == CarrierStatus.ACTIVE)
                .order_by(Carrier.code.asc())
            )
        )
        busy_carrier_ids = _busy_resource_ids(db, trip.branchId, trip_id, "carrierId")
        suggestions = sorted(
            ({"carrier": serialize_carrier(c), "busy": c.id in busy_carrier_ids} for c in carriers),
            key=lambda s: s["busy"],
        )
        return envelope(
            {"requiredWeightKg": float(required_weight_kg) if required_weight_kg is not None else None, "vehicles": [], "drivers": [], "carriers": suggestions}
        )

    vehicles = list(
        db.scalars(
            select(Vehicle)
            .where(Vehicle.branchId == trip.branchId, Vehicle.isMaintenance.is_(False))
            .order_by(Vehicle.plateNumber.asc())
        )
    )
    drivers = list(
        db.scalars(
            select(Driver)
            .where(Driver.branchId == trip.branchId, Driver.isActive.is_(True), Driver.carrierId.is_(None))
            .order_by(Driver.fullName.asc())
        )
    )
    busy_vehicle_ids = _busy_resource_ids(db, trip.branchId, trip_id, "vehicleId")
    busy_driver_ids = _busy_resource_ids(db, trip.branchId, trip_id, "driverId")

    vehicle_suggestions = []
    for vehicle in vehicles:
        capacity_kg = vehicle.loadCapacityKg
        fits_capacity = (
            None if required_weight_kg is None or capacity_kg is None else capacity_kg >= required_weight_kg
        )
        excess_capacity_kg = capacity_kg - required_weight_kg if capacity_kg is not None and required_weight_kg is not None else None
        busy = vehicle.id in busy_vehicle_ids
        warnings = []
        if capacity_kg is None:
            warnings.append("Xe chưa khai tải trọng")
        if required_weight_kg is None:
            warnings.append("Đơn chưa khai trọng lượng hàng")
        if fits_capacity is False:
            warnings.append("Tải trọng xe nhỏ hơn tổng trọng lượng hàng của chuyến")
        if busy:
            warnings.append("Xe đang giữ ở chuyến khác chưa đóng")
        vehicle_suggestions.append(
            {
                "vehicle": serialize_vehicle(vehicle),
                "fitsCapacity": fits_capacity,
                "excessCapacityKg": float(excess_capacity_kg) if excess_capacity_kg is not None else None,
                "busy": busy,
                "warnings": warnings,
                "_sort_excess": excess_capacity_kg if excess_capacity_kg is not None else Decimal("Infinity"),
                "_sort_fits": 0 if fits_capacity is True else 1,
            }
        )
    vehicle_suggestions.sort(key=lambda s: (s["busy"], s["_sort_fits"], s["_sort_excess"]))
    for s in vehicle_suggestions:
        del s["_sort_excess"]
        del s["_sort_fits"]

    driver_suggestions = sorted(
        ({"driver": serialize_driver(d), "busy": d.id in busy_driver_ids} for d in drivers),
        key=lambda s: s["busy"],
    )

    return envelope(
        {
            "requiredWeightKg": float(required_weight_kg) if required_weight_kg is not None else None,
            "vehicles": vehicle_suggestions,
            "drivers": driver_suggestions,
            "carriers": [],
        }
    )


@router.patch("/{trip_id}/resource")
def assign_resource(
    trip_id: str,
    dto: AssignResourceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)

    if dto.vehicleId:
        vehicle = db.get(Vehicle, dto.vehicleId)
        if vehicle is None:
            raise ApiError(404, "Không tìm thấy xe")
        assert_branch_scope(user, vehicle.branchId)
        if vehicle.isMaintenance:
            raise ApiError(400, "Xe đang bảo trì, không thể gán cho chuyến")
    if dto.driverId:
        driver = db.get(Driver, dto.driverId)
        if driver is None:
            raise ApiError(404, "Không tìm thấy tài xế")
        assert_branch_scope(user, driver.branchId)
    if dto.carrierId:
        carrier = db.get(Carrier, dto.carrierId)
        if carrier is None:
            raise ApiError(404, "Không tìm thấy nhà vận tải")
        assert_branch_scope(user, carrier.branchId)

    before_state = {"vehicleId": trip.vehicleId, "driverId": trip.driverId, "carrierId": trip.carrierId}
    trip.vehicleId = dto.vehicleId
    trip.driverId = dto.driverId
    trip.carrierId = dto.carrierId
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=trip_id,
        action="ASSIGN_RESOURCE",
        actor_user_id=user.user_id,
        before_state=before_state,
        after_state={"vehicleId": trip.vehicleId, "driverId": trip.driverId, "carrierId": trip.carrierId},
    )
    db.commit()
    trip = _get_or_404(db, user, trip_id)
    return envelope(serialize_trip(trip))


def _transition(
    db: Session,
    user: AuthenticatedUser,
    trip: Trip,
    status: TripStatus,
    action: str,
    reason: str | None = None,
) -> Trip:
    before_status = trip.status.value
    trip.status = status
    if action == "CANCEL":
        trip.cancelReason = reason
    if action == "PAUSE":
        trip.pauseReason = reason
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=trip.id,
        action=action,
        actor_user_id=user.user_id,
        reason=reason,
        before_state={"status": before_status},
        after_state={"status": trip.status.value},
    )
    db.commit()
    db.refresh(trip)
    return trip


@router.patch("/{trip_id}/dispatch")
def dispatch(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:dispatch")),
):
    trip = _get_or_404(db, user, trip_id)
    if trip.status != TripStatus.PLANNED:
        raise ApiError(400, "Chỉ chuyến ở trạng thái kế hoạch mới có thể phát lệnh")
    has_internal_resource = bool(trip.vehicleId and trip.driverId)
    has_carrier = bool(trip.carrierId)
    if not has_internal_resource and not has_carrier:
        raise ApiError(400, "Chuyến chưa được gán xe/tài xế hoặc nhà vận tải")
    trip = _transition(db, user, trip, TripStatus.DISPATCHED, "DISPATCH")
    return envelope(serialize_trip(trip, with_relations=False))


@router.patch("/{trip_id}/start")
def start(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)
    if trip.status != TripStatus.DISPATCHED:
        raise ApiError(400, "Chỉ chuyến đã phát lệnh mới có thể bắt đầu thực hiện")
    trip = _transition(db, user, trip, TripStatus.IN_PROGRESS, "START")
    return envelope(serialize_trip(trip, with_relations=False))


@router.patch("/{trip_id}/complete")
def complete(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)
    if trip.status != TripStatus.IN_PROGRESS:
        raise ApiError(400, "Chỉ chuyến đang thực hiện mới có thể hoàn tất")
    trip = _transition(db, user, trip, TripStatus.COMPLETED_PENDING_DOCS, "COMPLETE")
    return envelope(serialize_trip(trip, with_relations=False))


@router.patch("/{trip_id}/pause")
def pause(
    trip_id: str,
    dto: ChangeStatusReasonRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)
    if trip.status not in (TripStatus.IN_PROGRESS, TripStatus.DISPATCHED):
        raise ApiError(400, "Chỉ chuyến đã phát lệnh hoặc đang thực hiện mới có thể tạm dừng")
    trip = _transition(db, user, trip, TripStatus.PAUSED, "PAUSE", dto.reason)
    return envelope(serialize_trip(trip, with_relations=False))


@router.patch("/{trip_id}/resume")
def resume(
    trip_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:update")),
):
    trip = _get_or_404(db, user, trip_id)
    if trip.status != TripStatus.PAUSED:
        raise ApiError(400, "Chỉ chuyến đang tạm dừng mới có thể tiếp tục")
    trip = _transition(db, user, trip, TripStatus.IN_PROGRESS, "RESUME")
    return envelope(serialize_trip(trip, with_relations=False))


@router.patch("/{trip_id}/cancel")
def cancel(
    trip_id: str,
    dto: ChangeStatusReasonRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("trip:cancel")),
):
    trip = _get_or_404(db, user, trip_id)
    if trip.status not in CANCELLABLE_STATUSES:
        raise ApiError(400, f"Không thể hủy chuyến ở trạng thái {trip.status.value}")
    trip = _transition(db, user, trip, TripStatus.CANCELLED, "CANCEL", dto.reason)
    return envelope(serialize_trip(trip, with_relations=False))


def complete_document_verification(db: Session, user: AuthenticatedUser, trip_id: str) -> Trip:
    """Gọi từ module 7 khi đủ chứng từ bắt buộc đã xác thực (bước 7, luồng nghiệp
    vụ). No-op nếu chuyến không còn ở CompletedPendingDocs — đây là bước tự động
    tiện ích, không phải hành động người dùng yêu cầu tường minh."""
    trip = _get_or_404(db, user, trip_id)
    if trip.status != TripStatus.COMPLETED_PENDING_DOCS:
        return trip
    return _transition(db, user, trip, TripStatus.COMPLETED_VERIFIED, "VERIFY_DOCS")
