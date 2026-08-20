import re
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# pydantic's EmailStr (qua email-validator) từ chối TLD nội bộ như ".local" vì
# coi đó là special-use domain theo RFC 6761 — dữ liệu seed thật của dự án dùng
# đúng domain này (admin@g3.local), nên dùng regex đơn giản khớp độ chặt của
# class-validator's IsEmail() bên NestJS thay vì EmailStr.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        if not _EMAIL_RE.match(value):
            raise ValueError("email không hợp lệ")
        return value


class CreateCustomerRequest(BaseModel):
    code: str
    legalName: str
    taxCode: str
    paymentTermDays: int | None = Field(default=None, ge=0)
    creditLimit: Decimal | None = Field(default=None, ge=0)


class UpdateCreditTermsRequest(BaseModel):
    paymentTermDays: int | None = Field(default=None, ge=0)
    creditLimit: Decimal | None = Field(default=None, ge=0)
    reason: str


class SetCustomerStatusRequest(BaseModel):
    status: Literal["ACTIVE", "LOCKED"]
    reason: str


class CreateVehicleRequest(BaseModel):
    plateNumber: str
    vehicleType: str
    loadCapacityKg: Decimal | None = Field(default=None, ge=0)


class SetVehicleMaintenanceRequest(BaseModel):
    isMaintenance: bool
    maintenanceUntil: str | None = None


class CreateDriverRequest(BaseModel):
    fullName: str
    phone: str
    licenseNumber: str
    carrierId: str | None = None


class CreateCarrierRequest(BaseModel):
    code: str
    legalName: str


class CreateContractRequest(BaseModel):
    code: str
    customerId: str
    effectiveFrom: str
    effectiveTo: str | None = None


class PriceListLineRequest(BaseModel):
    originLabel: str
    destLabel: str
    vehicleType: str | None = None
    unitPrice: Decimal = Field(ge=0)
    unit: str


class SurchargeRequest(BaseModel):
    type: Literal["FUEL", "TOLL", "WAITING", "LIFT_ON_OFF", "OVERTIME", "YARD_STORAGE", "OTHER"]
    name: str
    amount: Decimal = Field(ge=0)
    isPercent: bool = False


class CreatePriceListRequest(BaseModel):
    contractId: str
    effectiveFrom: str
    effectiveTo: str | None = None
    lines: list[PriceListLineRequest]
    surcharges: list[SurchargeRequest]


class QuoteLineRequest(BaseModel):
    description: str
    quantity: Decimal = Field(ge=0)
    unitPrice: Decimal = Field(ge=0)


class CreateQuoteRequest(BaseModel):
    customerId: str
    contractId: str | None = None
    estimatedBuyTotal: Decimal | None = Field(default=None, ge=0)
    validUntil: str | None = None
    lines: list[QuoteLineRequest]


class RejectQuoteRequest(BaseModel):
    reason: str


class PickupDeliveryPointRequest(BaseModel):
    type: Literal["PICKUP", "DELIVERY"]
    sequence: int
    customerLocationId: str | None = None
    freeAddress: str | None = None
    windowFrom: str | None = None
    windowTo: str | None = None
    bookingNumber: str | None = None
    containerNumber: str | None = None
    sealNumber: str | None = None
    depotCode: str | None = None
    cutOffAt: str | None = None


class CargoRequest(BaseModel):
    description: str
    packageCount: int | None = None
    weightKg: Decimal | None = None
    volumeCbm: Decimal | None = None
    requiresStorage: str | None = None


class CreateShipmentOrderRequest(BaseModel):
    customerId: str
    quoteId: str | None = None
    customerRef: str | None = None
    sourceChannel: Literal["manual", "excel", "email", "zalo", "api", "old_order"]
    sellTotal: Decimal = Field(ge=0)
    estimatedBuyTotal: Decimal | None = Field(default=None, ge=0)
    points: list[PickupDeliveryPointRequest]
    cargos: list[CargoRequest]


class ChangeStatusReasonRequest(BaseModel):
    reason: str


class CreateTripRequest(BaseModel):
    isOutsourced: bool = False


class LinkOrderRequest(BaseModel):
    shipmentOrderId: str
    splitReason: str | None = None


class UnlinkOrderRequest(BaseModel):
    reason: str


class AssignResourceRequest(BaseModel):
    vehicleId: str | None = None
    driverId: str | None = None
    carrierId: str | None = None


class CreateRequiredDocumentTypeRequest(BaseModel):
    code: str
    name: str
    aiJobType: Literal["PHOTO_CHECK", "INVOICE_OCR"] | None = None


class UploadDocumentEvidenceRequest(BaseModel):
    requiredDocumentTypeId: str
    fileUrl: str
    fileHash: str


class RejectDocumentEvidenceRequest(BaseModel):
    reason: str


class InvoiceExtractionRequest(BaseModel):
    issuer: str
    invoiceNumber: str
    invoiceDate: str
    subtotal: Decimal
    vatAmount: Decimal
    total: Decimal


class SubmitAiResultRequest(BaseModel):
    rawResult: dict
    confidence: Decimal | None = Field(default=None, ge=0, le=1)
    invoice: InvoiceExtractionRequest | None = None
    containerNumber: str | None = None
    plateNumber: str | None = None


class FailAiJobRequest(BaseModel):
    errorMessage: str


_TRIP_COST_CATEGORIES = Literal["FUEL", "TOLL", "PARKING", "LIFT_ON_OFF", "WAITING", "REPAIR", "OTHER"]


class CreateTripCostPlanRequest(BaseModel):
    category: _TRIP_COST_CATEGORIES
    description: str
    amount: Decimal = Field(ge=0)


class CreateTripCostActualRequest(BaseModel):
    category: _TRIP_COST_CATEGORIES
    description: str
    amount: Decimal = Field(ge=0)
    incurredAt: str
    evidenceId: str | None = None


class RejectTripCostActualRequest(BaseModel):
    reason: str


class CreateAdvanceRequest(BaseModel):
    recipientName: str
    amount: Decimal = Field(ge=Decimal("0.01"))
    purpose: str


class CancelAdvanceRequest(BaseModel):
    reason: str


class CreateReconciliationStatementRequest(BaseModel):
    type: Literal["CUSTOMER", "CARRIER"]
    customerId: str | None = None
    carrierId: str | None = None
    periodFrom: str
    periodTo: str


class AddReconciliationLineRequest(BaseModel):
    shipmentOrderId: str | None = None
    tripId: str | None = None
    description: str
    amount: Decimal = Field(ge=Decimal("0.01"))


class ReopenReconciliationStatementRequest(BaseModel):
    reason: str


class CreateInvoiceFromStatementRequest(BaseModel):
    vatAmount: Decimal = Field(ge=0)
    dueDate: str | None = None


class VoidInvoiceRequest(BaseModel):
    reason: str


class MarkInvoiceDisputedRequest(BaseModel):
    reason: str


class CreateAccountsPayableFromStatementRequest(BaseModel):
    dueDate: str | None = None


class RecordPaymentRequest(BaseModel):
    amount: Decimal = Field(ge=Decimal("0.01"))
    method: str
    reference: str | None = None
