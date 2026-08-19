import { Module } from '@nestjs/common';
import { ShipmentOrderController } from './shipment-order.controller';
import { ShipmentOrderService } from './shipment-order.service';

@Module({
  controllers: [ShipmentOrderController],
  providers: [ShipmentOrderService],
  exports: [ShipmentOrderService],
})
export class ShipmentOrderModule {}
