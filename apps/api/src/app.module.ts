import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerModule } from './modules/customer/customer.module';
import { ContractPricingQuoteModule } from './modules/contract-pricing-quote/contract-pricing-quote.module';
import { ShipmentOrderModule } from './modules/shipment-order/shipment-order.module';
import { ResourceModule } from './modules/resource/resource.module';
import { TripModule } from './modules/trip/trip.module';
import { DocumentEvidenceModule } from './modules/document-evidence/document-evidence.module';
import { TripCostModule } from './modules/trip-cost/trip-cost.module';
import { ReconciliationBillingModule } from './modules/reconciliation-billing/reconciliation-billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    IdempotencyModule,
    AuthModule,
    CustomerModule,
    ContractPricingQuoteModule,
    ShipmentOrderModule,
    ResourceModule,
    TripModule,
    DocumentEvidenceModule,
    TripCostModule,
    ReconciliationBillingModule,
  ],
  providers: [
    // Thứ tự guard toàn cục: xác thực JWT trước, rồi mới kiểm tra quyền — theo
    // docs/api-conventions.md mục 2 và docs/security-audit.md mục 2.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
