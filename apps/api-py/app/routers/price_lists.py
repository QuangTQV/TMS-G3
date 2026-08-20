from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import Contract, PriceList, PriceListLine, PriceListStatus, Surcharge, SurchargeType
from ..response import envelope
from ..schemas import CreatePriceListRequest
from ..serializers import serialize_price_list

router = APIRouter(prefix="/v1/price-lists", tags=["price-lists"])

ENTITY_TYPE = "PriceList"


def _get_or_404(db: Session, user: AuthenticatedUser, price_list_id: str) -> PriceList:
    price_list = db.scalar(
        select(PriceList)
        .options(selectinload(PriceList.lines), selectinload(PriceList.surcharges), selectinload(PriceList.contract))
        .where(PriceList.id == price_list_id)
    )
    if price_list is None:
        raise ApiError(404, "Không tìm thấy bảng giá")
    assert_branch_scope(user, price_list.contract.branchId)
    return price_list


@router.post("")
def create(
    dto: CreatePriceListRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("price-list:create")),
):
    contract = db.get(Contract, dto.contractId)
    if contract is None:
        raise ApiError(404, "Không tìm thấy hợp đồng")
    assert_branch_scope(user, contract.branchId)

    existing_count = db.scalar(select(func.count()).select_from(PriceList).where(PriceList.contractId == dto.contractId))

    price_list = PriceList(
        contractId=dto.contractId,
        version=(existing_count or 0) + 1,
        effectiveFrom=datetime.fromisoformat(dto.effectiveFrom),
        effectiveTo=datetime.fromisoformat(dto.effectiveTo) if dto.effectiveTo else None,
    )
    db.add(price_list)
    db.flush()

    for line in dto.lines:
        db.add(
            PriceListLine(
                priceListId=price_list.id,
                originLabel=line.originLabel,
                destLabel=line.destLabel,
                vehicleType=line.vehicleType,
                unitPrice=line.unitPrice,
                unit=line.unit,
            )
        )
    for surcharge in dto.surcharges:
        db.add(
            Surcharge(
                priceListId=price_list.id,
                type=SurchargeType(surcharge.type),
                name=surcharge.name,
                amount=surcharge.amount,
                isPercent=surcharge.isPercent,
            )
        )
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=price_list.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_price_list(price_list),
    )
    db.commit()
    db.refresh(price_list)
    return envelope(serialize_price_list(price_list))


@router.get("/{price_list_id}")
def find_one(
    price_list_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("price-list:read")),
):
    price_list = _get_or_404(db, user, price_list_id)
    return envelope(serialize_price_list(price_list))


@router.patch("/{price_list_id}/approve")
def approve(
    price_list_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("price-list:approve")),
):
    price_list = _get_or_404(db, user, price_list_id)
    if price_list.status not in (PriceListStatus.DRAFT, PriceListStatus.PENDING_APPROVAL):
        raise ApiError(400, "Chỉ bảng giá ở trạng thái nháp/chờ duyệt mới có thể duyệt")

    before_status = price_list.status.value

    # Bảng giá ACTIVE trước đó của cùng hợp đồng chuyển sang SUPERSEDED khi có bảng
    # giá mới được duyệt — chỉ một bảng giá ACTIVE tại một thời điểm.
    others = db.scalars(
        select(PriceList).where(
            PriceList.contractId == price_list.contractId, PriceList.status == PriceListStatus.ACTIVE
        )
    )
    for other in others:
        other.status = PriceListStatus.SUPERSEDED

    price_list.status = PriceListStatus.ACTIVE
    price_list.approvedAt = datetime.utcnow()
    price_list.approvedByUserId = user.user_id
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=price_list_id,
        action="APPROVE",
        actor_user_id=user.user_id,
        before_state={"status": before_status},
        after_state={"status": price_list.status.value},
    )
    db.commit()
    db.refresh(price_list)
    return envelope(serialize_price_list(price_list))
