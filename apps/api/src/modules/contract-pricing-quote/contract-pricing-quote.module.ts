import { Module } from '@nestjs/common';
import { ShipmentOrderModule } from '../shipment-order/shipment-order.module';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { PriceListController } from './price-list.controller';
import { PriceListService } from './price-list.service';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';

@Module({
  imports: [ShipmentOrderModule],
  controllers: [ContractController, PriceListController, QuoteController],
  providers: [ContractService, PriceListService, QuoteService],
  exports: [ContractService, PriceListService, QuoteService],
})
export class ContractPricingQuoteModule {}
