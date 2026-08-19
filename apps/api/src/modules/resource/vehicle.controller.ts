import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { SetVehicleMaintenanceDto } from './dto/set-vehicle-maintenance.dto';
import { VehicleService } from './vehicle.service';

@Controller('v1/vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @RequirePermission('resource:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehicleService.create(user, dto);
  }

  @Get()
  @RequirePermission('resource:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.vehicleService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('resource:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vehicleService.findOne(user, id);
  }

  @Patch(':id/maintenance')
  @RequirePermission('resource:manage')
  setMaintenance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetVehicleMaintenanceDto,
  ) {
    return this.vehicleService.setMaintenance(user, id, dto);
  }
}
