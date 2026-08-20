from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import Vehicle
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateVehicleRequest, SetVehicleMaintenanceRequest
from ..serializers import serialize_vehicle

router = APIRouter(prefix="/v1/vehicles", tags=["vehicles"])

ENTITY_TYPE = "Vehicle"


@router.post("")
def create(
    dto: CreateVehicleRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:manage")),
):
    existing = db.scalar(select(Vehicle).where(Vehicle.plateNumber == dto.plateNumber))
    if existing is not None:
        raise ApiError(409, f"Biển số {dto.plateNumber} đã tồn tại")

    vehicle = Vehicle(
        branchId=user.branch_id,
        plateNumber=dto.plateNumber,
        vehicleType=dto.vehicleType,
        loadCapacityKg=dto.loadCapacityKg,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return envelope(serialize_vehicle(vehicle))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:read")),
):
    stmt = select(Vehicle).where(Vehicle.branchId == user.branch_id).order_by(Vehicle.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Vehicle.createdAt).where(Vehicle.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Vehicle.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_vehicle(r) for r in page["data"]], "meta": page["meta"]})


@router.get("/{vehicle_id}")
def find_one(
    vehicle_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:read")),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise ApiError(404, "Không tìm thấy xe")
    assert_branch_scope(user, vehicle.branchId)
    return envelope(serialize_vehicle(vehicle))


@router.patch("/{vehicle_id}/maintenance")
def set_maintenance(
    vehicle_id: str,
    dto: SetVehicleMaintenanceRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:manage")),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise ApiError(404, "Không tìm thấy xe")
    assert_branch_scope(user, vehicle.branchId)

    before_is_maintenance = vehicle.isMaintenance
    vehicle.isMaintenance = dto.isMaintenance
    vehicle.maintenanceUntil = datetime.fromisoformat(dto.maintenanceUntil) if dto.maintenanceUntil else None
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=vehicle_id,
        action="START_MAINTENANCE" if dto.isMaintenance else "END_MAINTENANCE",
        actor_user_id=user.user_id,
        before_state={"isMaintenance": before_is_maintenance},
        after_state={"isMaintenance": vehicle.isMaintenance, "maintenanceUntil": vehicle.maintenanceUntil},
    )
    db.commit()
    db.refresh(vehicle)
    return envelope(serialize_vehicle(vehicle))
