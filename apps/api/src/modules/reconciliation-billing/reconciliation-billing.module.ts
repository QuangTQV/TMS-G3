import { Module } from '@nestjs/common';
import {
  AccountsPayableController,
  StatementAccountsPayableController,
} from './accounts-payable.controller';
import { AccountsPayableService } from './accounts-payable.service';
import {
  InvoiceController,
  StatementInvoiceController,
} from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [
    ReconciliationController,
    StatementInvoiceController,
    InvoiceController,
    StatementAccountsPayableController,
    AccountsPayableController,
  ],
  providers: [ReconciliationService, InvoiceService, AccountsPayableService],
  exports: [ReconciliationService, InvoiceService, AccountsPayableService],
})
export class ReconciliationBillingModule {}
