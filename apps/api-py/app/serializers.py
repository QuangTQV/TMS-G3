from datetime import datetime
from decimal import Decimal
from typing import Any

from .models import (
    AccountsPayable,
    AccountsReceivable,
    Advance,
    AIExtractionResult,
    AIProcessingJob,
    Cargo,
    Carrier,
    Contract,
    Customer,
    CustomerContact,
    CustomerLocation,
    DocumentEvidence,
    Driver,
    Invoice,
    PayablePayment,
    PickupDeliveryPoint,
    PriceList,
    PriceListLine,
    Quote,
    QuoteLine,
    ReceivablePayment,
    ReconciliationLine,
    ReconciliationStatement,
    RequiredDocumentType,
    ShipmentOrder,
    Surcharge,
    Trip,
    TripCostActual,
    TripCostPlan,
    TripOrderLink,
    TripStop,
    Vehicle,
)


def _dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    # Khớp Date.prototype.toJSON() phía Node (dùng bởi Prisma khi serialize).
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _decimal(value: Decimal | None) -> str | None:
    # Prisma Decimal.toJSON() trả về string, không phải number — giữ đồng nhất
    # để tránh mất độ chính xác số tiền khi frontend parse.
    if value is None:
        return None
    return str(value)


def serialize_customer_contact(row: CustomerContact) -> dict[str, Any]:
    return {
        "id": row.id,
        "customerId": row.customerId,
        "fullName": row.fullName,
        "phone": row.phone,
        "email": row.email,
        "isPrimary": row.isPrimary,
        "createdAt": _dt(row.createdAt),
    }


def serialize_customer_location(row: CustomerLocation) -> dict[str, Any]:
    return {
        "id": row.id,
        "customerId": row.customerId,
        "name": row.name,
        "address": row.address,
        "lat": _decimal(row.lat),
        "lng": _decimal(row.lng),
        "isPickup": row.isPickup,
        "isDelivery": row.isDelivery,
        "createdAt": _dt(row.createdAt),
    }


def serialize_customer(row: Customer, *, with_relations: bool = False) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "code": row.code,
        "legalName": row.legalName,
        "taxCode": row.taxCode,
        "status": row.status.value if hasattr(row.status, "value") else row.status,
        "paymentTermDays": row.paymentTermDays,
        "creditLimit": _decimal(row.creditLimit),
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["contacts"] = [serialize_customer_contact(c) for c in row.contacts]
        body["locations"] = [serialize_customer_location(loc) for loc in row.locations]
    return body


def serialize_vehicle(row: Vehicle) -> dict[str, Any]:
    return {
        "id": row.id,
        "branchId": row.branchId,
        "plateNumber": row.plateNumber,
        "vehicleType": row.vehicleType,
        "loadCapacityKg": _decimal(row.loadCapacityKg),
        "isMaintenance": row.isMaintenance,
        "maintenanceUntil": _dt(row.maintenanceUntil),
        "createdAt": _dt(row.createdAt),
    }


def serialize_driver(row: Driver) -> dict[str, Any]:
    return {
        "id": row.id,
        "branchId": row.branchId,
        "carrierId": row.carrierId,
        "fullName": row.fullName,
        "phone": row.phone,
        "licenseNumber": row.licenseNumber,
        "userId": row.userId,
        "isActive": row.isActive,
        "createdAt": _dt(row.createdAt),
    }


def serialize_carrier(row: Carrier) -> dict[str, Any]:
    return {
        "id": row.id,
        "branchId": row.branchId,
        "code": row.code,
        "legalName": row.legalName,
        "status": row.status.value,
        "createdAt": _dt(row.createdAt),
    }


def serialize_price_list_line(row: PriceListLine) -> dict[str, Any]:
    return {
        "id": row.id,
        "priceListId": row.priceListId,
        "originLabel": row.originLabel,
        "destLabel": row.destLabel,
        "vehicleType": row.vehicleType,
        "unitPrice": _decimal(row.unitPrice),
        "unit": row.unit,
    }


def serialize_surcharge(row: Surcharge) -> dict[str, Any]:
    return {
        "id": row.id,
        "priceListId": row.priceListId,
        "type": row.type.value,
        "name": row.name,
        "amount": _decimal(row.amount),
        "isPercent": row.isPercent,
    }


def serialize_price_list(row: PriceList, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "contractId": row.contractId,
        "version": row.version,
        "status": row.status.value,
        "effectiveFrom": _dt(row.effectiveFrom),
        "effectiveTo": _dt(row.effectiveTo),
        "createdAt": _dt(row.createdAt),
        "approvedAt": _dt(row.approvedAt),
        "approvedByUserId": row.approvedByUserId,
    }
    if with_relations:
        body["lines"] = [serialize_price_list_line(l) for l in row.lines]
        body["surcharges"] = [serialize_surcharge(s) for s in row.surcharges]
    return body


def serialize_contract(row: Contract, *, with_relations: bool = False) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "customerId": row.customerId,
        "code": row.code,
        "status": row.status.value,
        "effectiveFrom": _dt(row.effectiveFrom),
        "effectiveTo": _dt(row.effectiveTo),
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["priceLists"] = [serialize_price_list(pl, with_relations=False) for pl in row.priceLists]
    return body


def serialize_quote_line(row: QuoteLine) -> dict[str, Any]:
    return {
        "id": row.id,
        "quoteId": row.quoteId,
        "description": row.description,
        "quantity": _decimal(row.quantity),
        "unitPrice": _decimal(row.unitPrice),
        "lineTotal": _decimal(row.lineTotal),
    }


def serialize_quote(row: Quote, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "code": row.code,
        "customerId": row.customerId,
        "contractId": row.contractId,
        "status": row.status.value,
        "sellTotal": _decimal(row.sellTotal),
        "estimatedBuyTotal": _decimal(row.estimatedBuyTotal),
        "marginAmount": _decimal(row.marginAmount),
        "validUntil": _dt(row.validUntil),
        "sentAt": _dt(row.sentAt),
        "respondedAt": _dt(row.respondedAt),
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["lines"] = [serialize_quote_line(l) for l in row.lines]
    return body


def serialize_pickup_delivery_point(row: PickupDeliveryPoint) -> dict[str, Any]:
    return {
        "id": row.id,
        "shipmentOrderId": row.shipmentOrderId,
        "sequence": row.sequence,
        "type": row.type.value,
        "customerLocationId": row.customerLocationId,
        "freeAddress": row.freeAddress,
        "windowFrom": _dt(row.windowFrom),
        "windowTo": _dt(row.windowTo),
        "bookingNumber": row.bookingNumber,
        "containerNumber": row.containerNumber,
        "sealNumber": row.sealNumber,
        "depotCode": row.depotCode,
        "cutOffAt": _dt(row.cutOffAt),
    }


def serialize_cargo(row: Cargo) -> dict[str, Any]:
    return {
        "id": row.id,
        "shipmentOrderId": row.shipmentOrderId,
        "description": row.description,
        "packageCount": row.packageCount,
        "weightKg": _decimal(row.weightKg),
        "volumeCbm": _decimal(row.volumeCbm),
        "requiresStorage": row.requiresStorage,
    }


def serialize_shipment_order(row: ShipmentOrder, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "code": row.code,
        "customerId": row.customerId,
        "quoteId": row.quoteId,
        "customerRef": row.customerRef,
        "sourceChannel": row.sourceChannel,
        "status": row.status.value,
        "sellTotal": _decimal(row.sellTotal),
        "estimatedBuyTotal": _decimal(row.estimatedBuyTotal),
        "cancelReason": row.cancelReason,
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["points"] = [serialize_pickup_delivery_point(p) for p in sorted(row.points, key=lambda p: p.sequence)]
        body["cargos"] = [serialize_cargo(c) for c in row.cargos]
    return body


def serialize_trip_stop(row: TripStop) -> dict[str, Any]:
    return {
        "id": row.id,
        "tripId": row.tripId,
        "sequence": row.sequence,
        "type": row.type.value,
        "plannedAt": _dt(row.plannedAt),
        "arrivedAt": _dt(row.arrivedAt),
        "departedAt": _dt(row.departedAt),
    }


def serialize_trip_order_link(row: TripOrderLink) -> dict[str, Any]:
    return {
        "id": row.id,
        "tripId": row.tripId,
        "shipmentOrderId": row.shipmentOrderId,
        "splitReason": row.splitReason,
        "createdAt": _dt(row.createdAt),
        "shipmentOrder": serialize_shipment_order(row.shipmentOrder, with_relations=False)
        if row.shipmentOrder is not None
        else None,
    }


def serialize_trip(row: Trip, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "code": row.code,
        "status": row.status.value,
        "vehicleId": row.vehicleId,
        "driverId": row.driverId,
        "carrierId": row.carrierId,
        "isOutsourced": row.isOutsourced,
        "pauseReason": row.pauseReason,
        "cancelReason": row.cancelReason,
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["vehicle"] = serialize_vehicle(row.vehicle) if row.vehicle is not None else None
        body["driver"] = serialize_driver(row.driver) if row.driver is not None else None
        body["carrier"] = serialize_carrier(row.carrier) if row.carrier is not None else None
        body["stops"] = [serialize_trip_stop(s) for s in sorted(row.stops, key=lambda s: s.sequence)]
        body["orderLinks"] = [serialize_trip_order_link(link) for link in row.orderLinks]
    return body


def serialize_required_document_type(row: RequiredDocumentType) -> dict[str, Any]:
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "aiJobType": row.aiJobType.value if row.aiJobType is not None else None,
        "isActive": row.isActive,
        "createdAt": _dt(row.createdAt),
    }


def serialize_ai_extraction_result(row: AIExtractionResult) -> dict[str, Any]:
    return {
        "id": row.id,
        "aiProcessingJobId": row.aiProcessingJobId,
        "rawResult": row.rawResult,
        "confidence": row.confidence,
        "validatedStatus": row.validatedStatus.value,
        "validationNotes": row.validationNotes,
        "invoiceIssuer": row.invoiceIssuer,
        "invoiceNumber": row.invoiceNumber,
        "invoiceDate": _dt(row.invoiceDate),
        "invoiceSubtotal": _decimal(row.invoiceSubtotal),
        "invoiceVatAmount": _decimal(row.invoiceVatAmount),
        "invoiceTotal": _decimal(row.invoiceTotal),
        "containerNumber": row.containerNumber,
        "plateNumber": row.plateNumber,
        "correctedByUserId": row.correctedByUserId,
        "finalResult": row.finalResult,
        "createdAt": _dt(row.createdAt),
    }


def serialize_ai_processing_job(row: AIProcessingJob, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "documentEvidenceId": row.documentEvidenceId,
        "jobType": row.jobType.value,
        "status": row.status.value,
        "retryCount": row.retryCount,
        "errorMessage": row.errorMessage,
        "requestedAt": _dt(row.requestedAt),
        "completedAt": _dt(row.completedAt),
    }
    if with_relations:
        body["extractionResult"] = (
            serialize_ai_extraction_result(row.extractionResult) if row.extractionResult is not None else None
        )
    return body


def serialize_document_evidence(row: DocumentEvidence, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "tripId": row.tripId,
        "requiredDocumentTypeId": row.requiredDocumentTypeId,
        "fileUrl": row.fileUrl,
        "fileHash": row.fileHash,
        "status": row.status.value,
        "rejectedReason": row.rejectedReason,
        "uploadedByUserId": row.uploadedByUserId,
        "lockedAt": _dt(row.lockedAt),
        "lockedByUserId": row.lockedByUserId,
        "sharedAt": _dt(row.sharedAt),
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["requiredDocumentType"] = serialize_required_document_type(row.requiredDocumentType)
        body["aiJobs"] = [serialize_ai_processing_job(j) for j in row.aiJobs]
    return body


def serialize_trip_cost_plan(row: TripCostPlan) -> dict[str, Any]:
    return {
        "id": row.id,
        "branchId": row.branchId,
        "tripId": row.tripId,
        "category": row.category.value,
        "description": row.description,
        "amount": _decimal(row.amount),
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
    }


def serialize_trip_cost_actual(row: TripCostActual) -> dict[str, Any]:
    return {
        "id": row.id,
        "branchId": row.branchId,
        "tripId": row.tripId,
        "category": row.category.value,
        "description": row.description,
        "amount": _decimal(row.amount),
        "incurredAt": _dt(row.incurredAt),
        "evidenceId": row.evidenceId,
        "status": row.status.value,
        "rejectionReason": row.rejectionReason,
        "submittedByUserId": row.submittedByUserId,
        "approvedByUserId": row.approvedByUserId,
        "approvedAt": _dt(row.approvedAt),
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }


def serialize_advance(row: Advance) -> dict[str, Any]:
    return {
        "id": row.id,
        "branchId": row.branchId,
        "tripId": row.tripId,
        "recipientName": row.recipientName,
        "amount": _decimal(row.amount),
        "purpose": row.purpose,
        "status": row.status.value,
        "requestedByUserId": row.requestedByUserId,
        "approvedByUserId": row.approvedByUserId,
        "paidByUserId": row.paidByUserId,
        "paidAt": _dt(row.paidAt),
        "settledAt": _dt(row.settledAt),
        "cancelReason": row.cancelReason,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }


def serialize_reconciliation_line(row: ReconciliationLine) -> dict[str, Any]:
    return {
        "id": row.id,
        "statementId": row.statementId,
        "shipmentOrderId": row.shipmentOrderId,
        "tripId": row.tripId,
        "description": row.description,
        "amount": _decimal(row.amount),
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
        "shipmentOrder": serialize_shipment_order(row.shipmentOrder, with_relations=False)
        if row.shipmentOrder is not None
        else None,
        "trip": serialize_trip(row.trip, with_relations=False) if row.trip is not None else None,
    }


def serialize_reconciliation_statement(row: ReconciliationStatement, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "type": row.type.value,
        "customerId": row.customerId,
        "carrierId": row.carrierId,
        "code": row.code,
        "periodFrom": _dt(row.periodFrom),
        "periodTo": _dt(row.periodTo),
        "status": row.status.value,
        "totalAmount": _decimal(row.totalAmount),
        "confirmedByUserId": row.confirmedByUserId,
        "confirmedAt": _dt(row.confirmedAt),
        "lockedAt": _dt(row.lockedAt),
        "reopenReason": row.reopenReason,
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["lines"] = [
            serialize_reconciliation_line(l) for l in sorted(row.lines, key=lambda l: l.createdAt)
        ]
        body["invoice"] = serialize_invoice(row.invoice, with_relations=False) if row.invoice is not None else None
        body["accountsPayable"] = (
            serialize_accounts_payable(row.accountsPayable, with_relations=False)
            if row.accountsPayable is not None
            else None
        )
        body["customer"] = serialize_customer(row.customer) if row.customer is not None else None
        body["carrier"] = serialize_carrier(row.carrier) if row.carrier is not None else None
    return body


def serialize_receivable_payment(row: ReceivablePayment) -> dict[str, Any]:
    return {
        "id": row.id,
        "accountsReceivableId": row.accountsReceivableId,
        "amount": _decimal(row.amount),
        "method": row.method,
        "reference": row.reference,
        "recordedByUserId": row.recordedByUserId,
        "recordedAt": _dt(row.recordedAt),
    }


def serialize_accounts_receivable(row: AccountsReceivable, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "customerId": row.customerId,
        "invoiceId": row.invoiceId,
        "amount": _decimal(row.amount),
        "paidAmount": _decimal(row.paidAmount),
        "dueDate": _dt(row.dueDate),
        "status": row.status.value,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["payments"] = [serialize_receivable_payment(p) for p in row.payments]
    return body


def serialize_invoice(row: Invoice, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "customerId": row.customerId,
        "reconciliationStatementId": row.reconciliationStatementId,
        "code": row.code,
        "status": row.status.value,
        "subtotal": _decimal(row.subtotal),
        "vatAmount": _decimal(row.vatAmount),
        "total": _decimal(row.total),
        "dueDate": _dt(row.dueDate),
        "issuedAt": _dt(row.issuedAt),
        "voidReason": row.voidReason,
        "disputeReason": row.disputeReason,
        "eInvoiceStatus": row.eInvoiceStatus,
        "eInvoiceError": row.eInvoiceError,
        "createdByUserId": row.createdByUserId,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["accountsReceivable"] = (
            serialize_accounts_receivable(row.accountsReceivable) if row.accountsReceivable is not None else None
        )
        body["customer"] = serialize_customer(row.customer) if row.customer is not None else None
        body["reconciliationStatement"] = (
            serialize_reconciliation_statement(row.reconciliationStatement, with_relations=False)
            if row.reconciliationStatement is not None
            else None
        )
    return body


def serialize_payable_payment(row: PayablePayment) -> dict[str, Any]:
    return {
        "id": row.id,
        "accountsPayableId": row.accountsPayableId,
        "amount": _decimal(row.amount),
        "method": row.method,
        "reference": row.reference,
        "recordedByUserId": row.recordedByUserId,
        "recordedAt": _dt(row.recordedAt),
    }


def serialize_accounts_payable(row: AccountsPayable, *, with_relations: bool = True) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": row.id,
        "branchId": row.branchId,
        "carrierId": row.carrierId,
        "reconciliationStatementId": row.reconciliationStatementId,
        "amount": _decimal(row.amount),
        "paidAmount": _decimal(row.paidAmount),
        "dueDate": _dt(row.dueDate),
        "status": row.status.value,
        "createdAt": _dt(row.createdAt),
        "updatedAt": _dt(row.updatedAt),
    }
    if with_relations:
        body["payments"] = [serialize_payable_payment(p) for p in row.payments]
        body["carrier"] = serialize_carrier(row.carrier) if row.carrier is not None else None
        body["reconciliationStatement"] = (
            serialize_reconciliation_statement(row.reconciliationStatement, with_relations=False)
            if row.reconciliationStatement is not None
            else None
        )
    return body
