import { Module } from '@nestjs/common';
import { CarrierController } from './carrier.controller';
import { CarrierService } from './carrier.service';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { VehicleController } from './vehicle.controller';
import { VehicleService } from './vehicle.service';

@Module({
  controllers: [VehicleController, DriverController, CarrierController],
  providers: [VehicleService, DriverService, CarrierService],
  exports: [VehicleService, DriverService, CarrierService],
})
export class ResourceModule {}
