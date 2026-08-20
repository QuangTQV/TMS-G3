from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import Carrier
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateCarrierRequest
from ..serializers import serialize_carrier

router = APIRouter(prefix="/v1/carriers", tags=["carriers"])


@router.post("")
def create(
    dto: CreateCarrierRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:manage")),
):
    existing = db.scalar(select(Carrier).where(Carrier.code == dto.code))
    if existing is not None:
        raise ApiError(409, f"Mã nhà vận tải {dto.code} đã tồn tại")

    carrier = Carrier(branchId=user.branch_id, code=dto.code, legalName=dto.legalName)
    db.add(carrier)
    db.commit()
    db.refresh(carrier)
    return envelope(serialize_carrier(carrier))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:read")),
):
    stmt = select(Carrier).where(Carrier.branchId == user.branch_id).order_by(Carrier.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Carrier.createdAt).where(Carrier.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Carrier.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_carrier(r) for r in page["data"]], "meta": page["meta"]})


@router.get("/{carrier_id}")
def find_one(
    carrier_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("resource:read")),
):
    carrier = db.get(Carrier, carrier_id)
    if carrier is None:
        raise ApiError(404, "Không tìm thấy nhà vận tải")
    assert_branch_scope(user, carrier.branchId)
    return envelope(serialize_carrier(carrier))
