import { Module } from '@nestjs/common';
import {
  TripCostController,
  TripFinancialActionController,
} from './trip-cost.controller';
import { TripCostService } from './trip-cost.service';

@Module({
  controllers: [TripCostController, TripFinancialActionController],
  providers: [TripCostService],
  exports: [TripCostService],
})
export class TripCostModule {}
