import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def gen_id() -> str:
    # Khớp Prisma `@default(uuid())` — UUID sinh ở tầng ứng dụng, cột DB không có
    # DEFAULT (xem apps/api/prisma/migrations/20260819032611_init/migration.sql).
    return str(uuid.uuid4())


class CustomerStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"


class ContractStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SIGNED = "SIGNED"
    EXPIRED = "EXPIRED"
    TERMINATED = "TERMINATED"


class PriceListStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"


class SurchargeType(str, enum.Enum):
    FUEL = "FUEL"
    TOLL = "TOLL"
    WAITING = "WAITING"
    LIFT_ON_OFF = "LIFT_ON_OFF"
    OVERTIME = "OVERTIME"
    YARD_STORAGE = "YARD_STORAGE"
    OTHER = "OTHER"


class QuoteStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class ShipmentOrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    PLANNED = "PLANNED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    HELD = "HELD"


class StopType(str, enum.Enum):
    PICKUP = "PICKUP"
    DELIVERY = "DELIVERY"


class CarrierStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class TripStatus(str, enum.Enum):
    PLANNED = "PLANNED"
    DISPATCHED = "DISPATCHED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED_PENDING_DOCS = "COMPLETED_PENDING_DOCS"
    COMPLETED_VERIFIED = "COMPLETED_VERIFIED"
    CLOSED = "CLOSED"
    PAUSED = "PAUSED"
    CANCELLED = "CANCELLED"
    EXCEPTION = "EXCEPTION"


class TripCostCategory(str, enum.Enum):
    FUEL = "FUEL"
    TOLL = "TOLL"
    PARKING = "PARKING"
    LIFT_ON_OFF = "LIFT_ON_OFF"
    WAITING = "WAITING"
    REPAIR = "REPAIR"
    OTHER = "OTHER"


class TripCostActualStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AdvanceStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    APPROVED = "APPROVED"
    PAID = "PAID"
    SETTLED = "SETTLED"
    CANCELLED = "CANCELLED"


class AIJobType(str, enum.Enum):
    PHOTO_CHECK = "PHOTO_CHECK"
    INVOICE_OCR = "INVOICE_OCR"


class AIJobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    VERIFIED = "VERIFIED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    FAILED = "FAILED"


class DocumentEvidenceStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    LOCKED = "LOCKED"


class ReconciliationType(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    CARRIER = "CARRIER"


class ReconciliationStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    LOCKED = "LOCKED"
    REOPENED = "REOPENED"


class InvoiceStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    ISSUED = "ISSUED"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    DISPUTED = "DISPUTED"
    ADJUSTED = "ADJUSTED"
    REPLACED = "REPLACED"
    VOIDED = "VOIDED"


class ReceivableStatus(str, enum.Enum):
    OPEN = "OPEN"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"


class PayableStatus(str, enum.Enum):
    OPEN = "OPEN"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    passwordHash: Mapped[str] = mapped_column(Text)
    fullName: Mapped[str] = mapped_column(Text)
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)
    lastLoginAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    roles: Mapped[list["UserRole"]] = relationship(back_populates="user")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    permissions: Mapped[list["RolePermission"]] = relationship(back_populates="role")


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    code: Mapped[str] = mapped_column(Text, unique=True)
    module: Mapped[str] = mapped_column(Text)


class UserRole(Base):
    __tablename__ = "user_roles"

    userId: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    roleId: Mapped[str] = mapped_column(Text, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)

    user: Mapped["User"] = relationship(back_populates="roles")
    role: Mapped["Role"] = relationship()


class RolePermission(Base):
    __tablename__ = "role_permissions"

    roleId: Mapped[str] = mapped_column(Text, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permissionId: Mapped[str] = mapped_column(
        Text, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )

    role: Mapped["Role"] = relationship(back_populates="permissions")
    permission: Mapped["Permission"] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    entityType: Mapped[str] = mapped_column(Text)
    entityId: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    actorUserId: Mapped[str] = mapped_column(Text)
    actorRole: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurredAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    beforeState: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    afterState: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    legalName: Mapped[str] = mapped_column(Text)
    taxCode: Mapped[str] = mapped_column(Text)
    status: Mapped[CustomerStatus] = mapped_column(
        SAEnum(CustomerStatus, name="CustomerStatus", create_type=False),
        default=CustomerStatus.ACTIVE,
    )
    paymentTermDays: Mapped[int] = mapped_column(Integer, default=30)
    creditLimit: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contacts: Mapped[list["CustomerContact"]] = relationship(back_populates="customer")
    locations: Mapped[list["CustomerLocation"]] = relationship(back_populates="customer")


class CustomerContact(Base):
    __tablename__ = "customer_contacts"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    fullName: Mapped[str] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    isPrimary: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    customer: Mapped["Customer"] = relationship(back_populates="contacts")


class CustomerLocation(Base):
    __tablename__ = "customer_locations"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(Text)
    address: Mapped[str] = mapped_column(Text)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    isPickup: Mapped[bool] = mapped_column(Boolean, default=True)
    isDelivery: Mapped[bool] = mapped_column(Boolean, default=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    customer: Mapped["Customer"] = relationship(back_populates="locations")


# ─────────────────────────────────────────────────────────────────────────
# Module 3 — Hợp đồng, bảng giá và báo giá
# ─────────────────────────────────────────────────────────────────────────


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[ContractStatus] = mapped_column(
        SAEnum(ContractStatus, name="ContractStatus", create_type=False), default=ContractStatus.DRAFT
    )
    effectiveFrom: Mapped[datetime] = mapped_column(DateTime)
    effectiveTo: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    priceLists: Mapped[list["PriceList"]] = relationship(back_populates="contract")


class PriceList(Base):
    __tablename__ = "price_lists"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    contractId: Mapped[str] = mapped_column(Text, ForeignKey("contracts.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[PriceListStatus] = mapped_column(
        SAEnum(PriceListStatus, name="PriceListStatus", create_type=False), default=PriceListStatus.DRAFT
    )
    effectiveFrom: Mapped[datetime] = mapped_column(DateTime)
    effectiveTo: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    approvedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approvedByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)

    contract: Mapped["Contract"] = relationship(back_populates="priceLists")
    lines: Mapped[list["PriceListLine"]] = relationship(back_populates="priceList")
    surcharges: Mapped[list["Surcharge"]] = relationship(back_populates="priceList")


class PriceListLine(Base):
    __tablename__ = "price_list_lines"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    priceListId: Mapped[str] = mapped_column(Text, ForeignKey("price_lists.id", ondelete="CASCADE"), index=True)
    originLabel: Mapped[str] = mapped_column(Text)
    destLabel: Mapped[str] = mapped_column(Text)
    vehicleType: Mapped[str | None] = mapped_column(Text, nullable=True)
    unitPrice: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    unit: Mapped[str] = mapped_column(Text)

    priceList: Mapped["PriceList"] = relationship(back_populates="lines")


class Surcharge(Base):
    __tablename__ = "surcharges"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    priceListId: Mapped[str] = mapped_column(Text, ForeignKey("price_lists.id", ondelete="CASCADE"), index=True)
    type: Mapped[SurchargeType] = mapped_column(SAEnum(SurchargeType, name="SurchargeType", create_type=False))
    name: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    isPercent: Mapped[bool] = mapped_column(Boolean, default=False)

    priceList: Mapped["PriceList"] = relationship(back_populates="surcharges")


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, unique=True)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id"), index=True)
    contractId: Mapped[str | None] = mapped_column(Text, ForeignKey("contracts.id"), nullable=True)
    status: Mapped[QuoteStatus] = mapped_column(
        SAEnum(QuoteStatus, name="QuoteStatus", create_type=False), default=QuoteStatus.DRAFT
    )
    sellTotal: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    estimatedBuyTotal: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    marginAmount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    validUntil: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sentAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    respondedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines: Mapped[list["QuoteLine"]] = relationship(back_populates="quote")


class QuoteLine(Base):
    __tablename__ = "quote_lines"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    quoteId: Mapped[str] = mapped_column(Text, ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    unitPrice: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    lineTotal: Mapped[Decimal] = mapped_column(Numeric(18, 2))

    quote: Mapped["Quote"] = relationship(back_populates="lines")


# ─────────────────────────────────────────────────────────────────────────
# Module 4 — Tiếp nhận yêu cầu và đơn vận chuyển
# ─────────────────────────────────────────────────────────────────────────


class ShipmentOrder(Base):
    __tablename__ = "shipment_orders"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id"), index=True)
    quoteId: Mapped[str | None] = mapped_column(Text, ForeignKey("quotes.id"), nullable=True)
    customerRef: Mapped[str | None] = mapped_column(Text, nullable=True)
    sourceChannel: Mapped[str] = mapped_column(Text)
    status: Mapped[ShipmentOrderStatus] = mapped_column(
        SAEnum(ShipmentOrderStatus, name="ShipmentOrderStatus", create_type=False),
        default=ShipmentOrderStatus.DRAFT,
    )
    sellTotal: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    estimatedBuyTotal: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    cancelReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    points: Mapped[list["PickupDeliveryPoint"]] = relationship(back_populates="shipmentOrder")
    cargos: Mapped[list["Cargo"]] = relationship(back_populates="shipmentOrder")
    tripLinks: Mapped[list["TripOrderLink"]] = relationship(back_populates="shipmentOrder")


class PickupDeliveryPoint(Base):
    __tablename__ = "pickup_delivery_points"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    shipmentOrderId: Mapped[str] = mapped_column(
        Text, ForeignKey("shipment_orders.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    type: Mapped[StopType] = mapped_column(SAEnum(StopType, name="StopType", create_type=False))
    customerLocationId: Mapped[str | None] = mapped_column(Text, ForeignKey("customer_locations.id"), nullable=True)
    freeAddress: Mapped[str | None] = mapped_column(Text, nullable=True)
    windowFrom: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    windowTo: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    bookingNumber: Mapped[str | None] = mapped_column(Text, nullable=True)
    containerNumber: Mapped[str | None] = mapped_column(Text, nullable=True)
    sealNumber: Mapped[str | None] = mapped_column(Text, nullable=True)
    depotCode: Mapped[str | None] = mapped_column(Text, nullable=True)
    cutOffAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    shipmentOrder: Mapped["ShipmentOrder"] = relationship(back_populates="points")


class Cargo(Base):
    __tablename__ = "cargos"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    shipmentOrderId: Mapped[str] = mapped_column(
        Text, ForeignKey("shipment_orders.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(Text)
    packageCount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weightKg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    volumeCbm: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    requiresStorage: Mapped[str | None] = mapped_column(Text, nullable=True)

    shipmentOrder: Mapped["ShipmentOrder"] = relationship(back_populates="cargos")


# ─────────────────────────────────────────────────────────────────────────
# Module 10 — Nguồn lực và đối tác vận tải
# ─────────────────────────────────────────────────────────────────────────


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    plateNumber: Mapped[str] = mapped_column(Text, unique=True)
    vehicleType: Mapped[str] = mapped_column(Text)
    loadCapacityKg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    isMaintenance: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenanceUntil: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    carrierId: Mapped[str | None] = mapped_column(Text, ForeignKey("carriers.id"), nullable=True, index=True)
    fullName: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    licenseNumber: Mapped[str] = mapped_column(Text)
    userId: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    carrier: Mapped["Carrier"] = relationship(back_populates="drivers")


class Carrier(Base):
    __tablename__ = "carriers"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    legalName: Mapped[str] = mapped_column(Text)
    status: Mapped[CarrierStatus] = mapped_column(
        SAEnum(CarrierStatus, name="CarrierStatus", create_type=False), default=CarrierStatus.ACTIVE
    )
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    drivers: Mapped[list["Driver"]] = relationship(back_populates="carrier")


# ─────────────────────────────────────────────────────────────────────────
# Module 6 — Chuyến vận tải, theo dõi và ngoại lệ
# ─────────────────────────────────────────────────────────────────────────


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[TripStatus] = mapped_column(
        SAEnum(TripStatus, name="TripStatus", create_type=False), default=TripStatus.PLANNED
    )
    vehicleId: Mapped[str | None] = mapped_column(Text, ForeignKey("vehicles.id"), nullable=True)
    driverId: Mapped[str | None] = mapped_column(Text, ForeignKey("drivers.id"), nullable=True)
    carrierId: Mapped[str | None] = mapped_column(Text, ForeignKey("carriers.id"), nullable=True)
    isOutsourced: Mapped[bool] = mapped_column(Boolean, default=False)
    pauseReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    stops: Mapped[list["TripStop"]] = relationship(back_populates="trip")
    orderLinks: Mapped[list["TripOrderLink"]] = relationship(back_populates="trip")
    vehicle: Mapped["Vehicle | None"] = relationship()
    driver: Mapped["Driver | None"] = relationship()
    carrier: Mapped["Carrier | None"] = relationship()


class TripStop(Base):
    __tablename__ = "trip_stops"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    tripId: Mapped[str] = mapped_column(Text, ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    type: Mapped[StopType] = mapped_column(SAEnum(StopType, name="StopType", create_type=False))
    plannedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    arrivedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    departedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="stops")


class TripOrderLink(Base):
    __tablename__ = "trip_order_links"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    tripId: Mapped[str] = mapped_column(Text, ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    shipmentOrderId: Mapped[str] = mapped_column(Text, ForeignKey("shipment_orders.id"), index=True)
    splitReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trip: Mapped["Trip"] = relationship(back_populates="orderLinks")
    shipmentOrder: Mapped["ShipmentOrder"] = relationship(back_populates="tripLinks")


# ─────────────────────────────────────────────────────────────────────────
# Module 8 — Chi phí, tạm ứng và quyết toán chuyến
# ─────────────────────────────────────────────────────────────────────────


class TripCostPlan(Base):
    __tablename__ = "trip_cost_plans"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    tripId: Mapped[str] = mapped_column(Text, ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    category: Mapped[TripCostCategory] = mapped_column(
        SAEnum(TripCostCategory, name="TripCostCategory", create_type=False)
    )
    description: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TripCostActual(Base):
    __tablename__ = "trip_cost_actuals"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    tripId: Mapped[str] = mapped_column(Text, ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    category: Mapped[TripCostCategory] = mapped_column(
        SAEnum(TripCostCategory, name="TripCostCategory", create_type=False)
    )
    description: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    incurredAt: Mapped[datetime] = mapped_column(DateTime)
    evidenceId: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TripCostActualStatus] = mapped_column(
        SAEnum(TripCostActualStatus, name="TripCostActualStatus", create_type=False),
        default=TripCostActualStatus.DRAFT,
    )
    rejectionReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submittedByUserId: Mapped[str] = mapped_column(Text)
    approvedByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)
    approvedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Advance(Base):
    __tablename__ = "advances"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    tripId: Mapped[str] = mapped_column(Text, ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    recipientName: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    purpose: Mapped[str] = mapped_column(Text)
    status: Mapped[AdvanceStatus] = mapped_column(
        SAEnum(AdvanceStatus, name="AdvanceStatus", create_type=False), default=AdvanceStatus.REQUESTED
    )
    requestedByUserId: Mapped[str] = mapped_column(Text)
    approvedByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)
    paidByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)
    paidAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    settledAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────
# Module 7 — Chứng từ và bằng chứng giao nhận (+ AI)
# ─────────────────────────────────────────────────────────────────────────


class RequiredDocumentType(Base):
    __tablename__ = "required_document_types"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    aiJobType: Mapped[AIJobType | None] = mapped_column(
        SAEnum(AIJobType, name="AIJobType", create_type=False), nullable=True
    )
    isActive: Mapped[bool] = mapped_column(Boolean, default=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentEvidence(Base):
    __tablename__ = "document_evidences"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    tripId: Mapped[str] = mapped_column(Text, ForeignKey("trips.id"), index=True)
    requiredDocumentTypeId: Mapped[str] = mapped_column(Text, ForeignKey("required_document_types.id"))
    fileUrl: Mapped[str] = mapped_column(Text)
    fileHash: Mapped[str] = mapped_column(Text)
    status: Mapped[DocumentEvidenceStatus] = mapped_column(
        SAEnum(DocumentEvidenceStatus, name="DocumentEvidenceStatus", create_type=False),
        default=DocumentEvidenceStatus.PENDING_REVIEW,
    )
    rejectedReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploadedByUserId: Mapped[str] = mapped_column(Text)
    lockedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lockedByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)
    sharedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    aiJobs: Mapped[list["AIProcessingJob"]] = relationship(back_populates="documentEvidence")
    requiredDocumentType: Mapped["RequiredDocumentType"] = relationship()


class AIProcessingJob(Base):
    __tablename__ = "ai_processing_jobs"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    documentEvidenceId: Mapped[str] = mapped_column(Text, ForeignKey("document_evidences.id"), index=True)
    jobType: Mapped[AIJobType] = mapped_column(SAEnum(AIJobType, name="AIJobType", create_type=False))
    status: Mapped[AIJobStatus] = mapped_column(
        SAEnum(AIJobStatus, name="AIJobStatus", create_type=False), default=AIJobStatus.QUEUED
    )
    retryCount: Mapped[int] = mapped_column(Integer, default=0)
    errorMessage: Mapped[str | None] = mapped_column(Text, nullable=True)
    requestedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    documentEvidence: Mapped["DocumentEvidence"] = relationship(back_populates="aiJobs")
    extractionResult: Mapped["AIExtractionResult | None"] = relationship(back_populates="aiProcessingJob")


class AIExtractionResult(Base):
    __tablename__ = "ai_extraction_results"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    aiProcessingJobId: Mapped[str] = mapped_column(Text, ForeignKey("ai_processing_jobs.id"), unique=True)
    rawResult: Mapped[dict | list] = mapped_column(JSONB)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    validatedStatus: Mapped[AIJobStatus] = mapped_column(SAEnum(AIJobStatus, name="AIJobStatus", create_type=False))
    validationNotes: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoiceIssuer: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoiceNumber: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoiceDate: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    invoiceSubtotal: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    invoiceVatAmount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    invoiceTotal: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)

    containerNumber: Mapped[str | None] = mapped_column(Text, nullable=True)
    plateNumber: Mapped[str | None] = mapped_column(Text, nullable=True)

    correctedByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)
    finalResult: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    aiProcessingJob: Mapped["AIProcessingJob"] = relationship(back_populates="extractionResult")


# ─────────────────────────────────────────────────────────────────────────
# Module 9 — Đối soát, bảng kê, hóa đơn và công nợ vận tải
# ─────────────────────────────────────────────────────────────────────────


class ReconciliationStatement(Base):
    __tablename__ = "reconciliation_statements"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    type: Mapped[ReconciliationType] = mapped_column(
        SAEnum(ReconciliationType, name="ReconciliationType", create_type=False)
    )
    customerId: Mapped[str | None] = mapped_column(Text, ForeignKey("customers.id"), nullable=True, index=True)
    carrierId: Mapped[str | None] = mapped_column(Text, ForeignKey("carriers.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    periodFrom: Mapped[datetime] = mapped_column(DateTime)
    periodTo: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[ReconciliationStatus] = mapped_column(
        SAEnum(ReconciliationStatus, name="ReconciliationStatus", create_type=False),
        default=ReconciliationStatus.DRAFT,
    )
    totalAmount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    confirmedByUserId: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lockedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reopenReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines: Mapped[list["ReconciliationLine"]] = relationship(back_populates="statement")
    invoice: Mapped["Invoice | None"] = relationship(back_populates="reconciliationStatement")
    accountsPayable: Mapped["AccountsPayable | None"] = relationship(back_populates="reconciliationStatement")
    customer: Mapped["Customer | None"] = relationship()
    carrier: Mapped["Carrier | None"] = relationship()


class ReconciliationLine(Base):
    __tablename__ = "reconciliation_lines"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    statementId: Mapped[str] = mapped_column(
        Text, ForeignKey("reconciliation_statements.id", ondelete="CASCADE"), index=True
    )
    shipmentOrderId: Mapped[str | None] = mapped_column(
        Text, ForeignKey("shipment_orders.id"), nullable=True, index=True
    )
    tripId: Mapped[str | None] = mapped_column(Text, ForeignKey("trips.id"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    statement: Mapped["ReconciliationStatement"] = relationship(back_populates="lines")
    shipmentOrder: Mapped["ShipmentOrder | None"] = relationship()
    trip: Mapped["Trip | None"] = relationship()


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id"), index=True)
    reconciliationStatementId: Mapped[str] = mapped_column(
        Text, ForeignKey("reconciliation_statements.id"), unique=True
    )
    code: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus, name="InvoiceStatus", create_type=False), default=InvoiceStatus.DRAFT
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    vatAmount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    dueDate: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    issuedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voidReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    disputeReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    eInvoiceStatus: Mapped[str | None] = mapped_column(Text, nullable=True)
    eInvoiceError: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdByUserId: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reconciliationStatement: Mapped["ReconciliationStatement"] = relationship(back_populates="invoice")
    accountsReceivable: Mapped["AccountsReceivable | None"] = relationship(back_populates="invoice")
    customer: Mapped["Customer"] = relationship()


class AccountsReceivable(Base):
    __tablename__ = "accounts_receivable"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    customerId: Mapped[str] = mapped_column(Text, ForeignKey("customers.id"), index=True)
    invoiceId: Mapped[str] = mapped_column(Text, ForeignKey("invoices.id"), unique=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    paidAmount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    dueDate: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[ReceivableStatus] = mapped_column(
        SAEnum(ReceivableStatus, name="ReceivableStatus", create_type=False), default=ReceivableStatus.OPEN
    )
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    invoice: Mapped["Invoice"] = relationship(back_populates="accountsReceivable")
    payments: Mapped[list["ReceivablePayment"]] = relationship(back_populates="accountsReceivable")


class ReceivablePayment(Base):
    __tablename__ = "receivable_payments"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    accountsReceivableId: Mapped[str] = mapped_column(Text, ForeignKey("accounts_receivable.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    method: Mapped[str] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    recordedByUserId: Mapped[str] = mapped_column(Text)
    recordedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    accountsReceivable: Mapped["AccountsReceivable"] = relationship(back_populates="payments")


class AccountsPayable(Base):
    __tablename__ = "accounts_payable"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    branchId: Mapped[str] = mapped_column(Text, ForeignKey("branches.id"), index=True)
    carrierId: Mapped[str] = mapped_column(Text, ForeignKey("carriers.id"), index=True)
    reconciliationStatementId: Mapped[str] = mapped_column(
        Text, ForeignKey("reconciliation_statements.id"), unique=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    paidAmount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    dueDate: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[PayableStatus] = mapped_column(
        SAEnum(PayableStatus, name="PayableStatus", create_type=False), default=PayableStatus.OPEN
    )
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reconciliationStatement: Mapped["ReconciliationStatement"] = relationship(back_populates="accountsPayable")
    payments: Mapped[list["PayablePayment"]] = relationship(back_populates="accountsPayable")
    carrier: Mapped["Carrier"] = relationship()


class PayablePayment(Base):
    __tablename__ = "payable_payments"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    accountsPayableId: Mapped[str] = mapped_column(Text, ForeignKey("accounts_payable.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    method: Mapped[str] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    recordedByUserId: Mapped[str] = mapped_column(Text)
    recordedAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    accountsPayable: Mapped["AccountsPayable"] = relationship(back_populates="payments")


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("idempotencyKey", "endpoint"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=gen_id)
    idempotencyKey: Mapped[str] = mapped_column(Text)
    endpoint: Mapped[str] = mapped_column(Text)
    responseBody: Mapped[dict | list] = mapped_column(JSONB)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
