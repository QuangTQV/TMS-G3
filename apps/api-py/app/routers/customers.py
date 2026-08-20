from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, assert_branch_scope, require_permission
from ..errors import ApiError
from ..models import Customer, CustomerStatus
from ..pagination import to_cursor_page
from ..response import envelope
from ..schemas import CreateCustomerRequest, SetCustomerStatusRequest, UpdateCreditTermsRequest
from ..serializers import serialize_customer

router = APIRouter(prefix="/v1/customers", tags=["customers"])

ENTITY_TYPE = "Customer"


def _get_or_404(db: Session, user: AuthenticatedUser, customer_id: str) -> Customer:
    customer = db.scalar(
        select(Customer)
        .options(selectinload(Customer.contacts), selectinload(Customer.locations))
        .where(Customer.id == customer_id)
    )
    if customer is None:
        raise ApiError(404, "Không tìm thấy khách hàng")
    assert_branch_scope(user, customer.branchId)
    return customer


@router.post("")
def create(
    dto: CreateCustomerRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("customer:create")),
):
    existing = db.scalar(select(Customer).where(Customer.code == dto.code))
    if existing is not None:
        raise ApiError(409, f"Mã khách hàng {dto.code} đã tồn tại")

    customer = Customer(
        branchId=user.branch_id,
        code=dto.code,
        legalName=dto.legalName,
        taxCode=dto.taxCode,
        paymentTermDays=dto.paymentTermDays if dto.paymentTermDays is not None else 30,
        creditLimit=dto.creditLimit,
    )
    db.add(customer)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=customer.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_customer(customer),
    )
    db.commit()
    db.refresh(customer)
    return envelope(serialize_customer(customer))


@router.get("")
def find_many(
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("customer:read")),
):
    stmt = (
        select(Customer)
        .where(Customer.branchId == user.branch_id)
        .order_by(Customer.createdAt.desc())
        .limit(limit + 1)
    )
    if cursor:
        anchor = db.scalar(select(Customer.createdAt).where(Customer.id == cursor))
        if anchor is not None:
            stmt = (
                select(Customer)
                .where(Customer.branchId == user.branch_id, Customer.createdAt < anchor)
                .order_by(Customer.createdAt.desc())
                .limit(limit + 1)
            )
    rows = list(db.scalars(stmt))
    page = to_cursor_page(rows, limit)
    return envelope({"data": [serialize_customer(r) for r in page["data"]], "meta": page["meta"]})


@router.get("/{customer_id}")
def find_one(
    customer_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("customer:read")),
):
    customer = _get_or_404(db, user, customer_id)
    return envelope(serialize_customer(customer, with_relations=True))


@router.patch("/{customer_id}/credit-terms")
def update_credit_terms(
    customer_id: str,
    dto: UpdateCreditTermsRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("customer:manage-credit")),
):
    customer = _get_or_404(db, user, customer_id)
    before = serialize_customer(customer)

    if dto.paymentTermDays is not None:
        customer.paymentTermDays = dto.paymentTermDays
    if dto.creditLimit is not None:
        customer.creditLimit = dto.creditLimit
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=customer_id,
        action="UPDATE_CREDIT_TERMS",
        actor_user_id=user.user_id,
        reason=dto.reason,
        before_state=before,
        after_state=serialize_customer(customer),
    )
    db.commit()
    db.refresh(customer)
    return envelope(serialize_customer(customer))


@router.patch("/{customer_id}/status")
def set_status(
    customer_id: str,
    dto: SetCustomerStatusRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("customer:manage-credit")),
):
    customer = _get_or_404(db, user, customer_id)
    before_status = customer.status.value

    customer.status = CustomerStatus(dto.status)
    db.flush()

    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=customer_id,
        action="LOCK" if dto.status == "LOCKED" else "UNLOCK",
        actor_user_id=user.user_id,
        reason=dto.reason,
        before_state={"status": before_status},
        after_state={"status": customer.status.value},
    )
    db.commit()
    db.refresh(customer)
    return envelope(serialize_customer(customer))
