from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import Driver
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateDriverRequest
from ..serializers import serialize_driver

router = APIRouter(prefix="/v1/drivers", tags=["drivers"])


@router.post("")
def create(
    dto: CreateDriverRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:manage")),
):
    driver = Driver(
        branchId=user.branch_id,
        fullName=dto.fullName,
        phone=dto.phone,
        licenseNumber=dto.licenseNumber,
        carrierId=dto.carrierId,
    )
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return envelope(serialize_driver(driver))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:read")),
):
    stmt = select(Driver).where(Driver.branchId == user.branch_id).order_by(Driver.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Driver.createdAt).where(Driver.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Driver.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_driver(r) for r in page["data"]], "meta": page["meta"]})


@router.get("/{driver_id}")
def find_one(
    driver_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:read")),
):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise ApiError(404, "Không tìm thấy tài xế")
    assert_branch_scope(user, driver.branchId)
    return envelope(serialize_driver(driver))
