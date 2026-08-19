CREATE TYPE "TripCostCategory" AS ENUM ('FUEL', 'TOLL', 'PARKING', 'LIFT_ON_OFF', 'WAITING', 'REPAIR', 'OTHER');
CREATE TYPE "TripCostActualStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "AdvanceStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'SETTLED', 'CANCELLED');

CREATE TABLE "trip_cost_plans" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "category" "TripCostCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trip_cost_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trip_cost_actuals" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "category" "TripCostCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "incurredAt" TIMESTAMP(3) NOT NULL,
  "evidenceId" TEXT,
  "status" "TripCostActualStatus" NOT NULL DEFAULT 'DRAFT',
  "rejectionReason" TEXT,
  "submittedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trip_cost_actuals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advances" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" "AdvanceStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "paidByUserId" TEXT,
  "paidAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_cost_plans_branchId_idx" ON "trip_cost_plans"("branchId");
CREATE INDEX "trip_cost_plans_tripId_idx" ON "trip_cost_plans"("tripId");
CREATE INDEX "trip_cost_actuals_branchId_idx" ON "trip_cost_actuals"("branchId");
CREATE INDEX "trip_cost_actuals_tripId_idx" ON "trip_cost_actuals"("tripId");
CREATE INDEX "trip_cost_actuals_status_idx" ON "trip_cost_actuals"("status");
CREATE INDEX "advances_branchId_idx" ON "advances"("branchId");
CREATE INDEX "advances_tripId_idx" ON "advances"("tripId");
CREATE INDEX "advances_status_idx" ON "advances"("status");

ALTER TABLE "trip_cost_plans" ADD CONSTRAINT "trip_cost_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_cost_plans" ADD CONSTRAINT "trip_cost_plans_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_cost_actuals" ADD CONSTRAINT "trip_cost_actuals_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_cost_actuals" ADD CONSTRAINT "trip_cost_actuals_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
