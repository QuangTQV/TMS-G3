from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .errors import ApiError, api_error_handler, unhandled_error_handler, validation_error_handler
from .routers import (
    accounts_payable,
    ai_jobs,
    auth,
    carriers,
    contracts,
    customers,
    document_evidences,
    document_types,
    drivers,
    invoices,
    price_lists,
    quotes,
    reconciliation,
    shipment_orders,
    trip_cost,
    trips,
    vehicles,
)

app = FastAPI(title="TMS G3 API (Python)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(vehicles.router)
app.include_router(drivers.router)
app.include_router(carriers.router)
app.include_router(contracts.router)
app.include_router(price_lists.router)
app.include_router(quotes.router)
app.include_router(shipment_orders.router)
app.include_router(trips.router)
app.include_router(document_types.router)
app.include_router(document_evidences.trip_documents_router)
app.include_router(document_evidences.document_evidences_router)
app.include_router(ai_jobs.router)
app.include_router(trip_cost.trip_financials_router)
app.include_router(trip_cost.financials_router)
app.include_router(reconciliation.router)
app.include_router(invoices.statement_invoice_router)
app.include_router(invoices.router)
app.include_router(accounts_payable.statement_router)
app.include_router(accounts_payable.router)


@app.get("/health")
def health():
    return {"data": {"status": "ok"}, "meta": {}}
