import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { CustomerDetailPage } from "./features/customers/CustomerDetailPage";
import { CustomersPage } from "./features/customers/CustomersPage";
import { ContractDetailPage } from "./features/contracts/ContractDetailPage";
import { ContractsPage } from "./features/contracts/ContractsPage";
import { QuoteDetailPage } from "./features/contracts/QuoteDetailPage";
import { QuotesPage } from "./features/contracts/QuotesPage";
import { DocumentTypesPage } from "./features/document-evidence/DocumentTypesPage";
import { AIJobsPage } from "./features/document-evidence/AIJobsPage";
import { ReconciliationStatementsPage } from "./features/reconciliation-billing/ReconciliationStatementsPage";
import { ReconciliationStatementDetailPage } from "./features/reconciliation-billing/ReconciliationStatementDetailPage";
import { InvoicesPage } from "./features/reconciliation-billing/InvoicesPage";
import { InvoiceDetailPage } from "./features/reconciliation-billing/InvoiceDetailPage";
import { AccountsPayablePage } from "./features/reconciliation-billing/AccountsPayablePage";
import { AccountsPayableDetailPage } from "./features/reconciliation-billing/AccountsPayableDetailPage";
import { CarriersPage } from "./features/resources/CarriersPage";
import { DriversPage } from "./features/resources/DriversPage";
import { VehiclesPage } from "./features/resources/VehiclesPage";
import { ShipmentOrderDetailPage } from "./features/shipment-orders/ShipmentOrderDetailPage";
import { ShipmentOrdersPage } from "./features/shipment-orders/ShipmentOrdersPage";
import { TripDetailPage } from "./features/trips/TripDetailPage";
import { TripsPage } from "./features/trips/TripsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route index element={<Navigate to="/customers" replace />} />

        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />

        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/contracts/:id" element={<ContractDetailPage />} />

        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/quotes/:id" element={<QuoteDetailPage />} />

        <Route path="/shipment-orders" element={<ShipmentOrdersPage />} />
        <Route
          path="/shipment-orders/:id"
          element={<ShipmentOrderDetailPage />}
        />

        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />

        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/carriers" element={<CarriersPage />} />

        <Route path="/document-types" element={<DocumentTypesPage />} />
        <Route path="/ai-jobs" element={<AIJobsPage />} />

        <Route
          path="/reconciliation-statements"
          element={<ReconciliationStatementsPage />}
        />
        <Route
          path="/reconciliation-statements/:id"
          element={<ReconciliationStatementDetailPage />}
        />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/accounts-payable" element={<AccountsPayablePage />} />
        <Route
          path="/accounts-payable/:id"
          element={<AccountsPayableDetailPage />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
