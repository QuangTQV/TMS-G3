from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import Contract
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateContractRequest
from ..serializers import serialize_contract

router = APIRouter(prefix="/v1/contracts", tags=["contracts"])

ENTITY_TYPE = "Contract"


@router.post("")
def create(
    dto: CreateContractRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("contract:create")),
):
    existing = db.scalar(select(Contract).where(Contract.code == dto.code))
    if existing is not None:
        raise ApiError(409, f"Mã hợp đồng {dto.code} đã tồn tại")

    contract = Contract(
        branchId=user.branch_id,
        customerId=dto.customerId,
        code=dto.code,
        effectiveFrom=datetime.fromisoformat(dto.effectiveFrom),
        effectiveTo=datetime.fromisoformat(dto.effectiveTo) if dto.effectiveTo else None,
    )
    db.add(contract)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=contract.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_contract(contract),
    )
    db.commit()
    db.refresh(contract)
    return envelope(serialize_contract(contract))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("contract:read")),
):
    stmt = select(Contract).where(Contract.branchId == user.branch_id).order_by(Contract.createdAt.desc())
    if cursor:
        anchor = db.scalar(select(Contract.createdAt).where(Contract.id == cursor))
        if anchor is not None:
            stmt = stmt.where(Contract.createdAt < anchor)
    rows = list(db.scalars(stmt.limit(limit + 1)))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_contract(r) for r in page["data"]], "meta": page["meta"]})


@router.get("/{contract_id}")
def find_one(
    contract_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("contract:read")),
):
    contract = db.scalar(
        select(Contract).options(selectinload(Contract.priceLists)).where(Contract.id == contract_id)
    )
    if contract is None:
        raise ApiError(404, "Không tìm thấy hợp đồng")
    assert_branch_scope(user, contract.branchId)
    return envelope(serialize_contract(contract, with_relations=True))
