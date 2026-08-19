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
import { ChangeStatusReasonDto } from './dto/change-status.dto';
import { CreateShipmentOrderDto } from './dto/create-shipment-order.dto';
import { ShipmentOrderService } from './shipment-order.service';

@Controller('v1/shipment-orders')
export class ShipmentOrderController {
  constructor(private readonly shipmentOrderService: ShipmentOrderService) {}

  @Post()
  @RequirePermission('shipment-order:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShipmentOrderDto,
  ) {
    return this.shipmentOrderService.create(user, dto);
  }

  @Get()
  @RequirePermission('shipment-order:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.shipmentOrderService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('shipment-order:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shipmentOrderService.findOne(user, id);
  }

  @Patch(':id/confirm')
  @RequirePermission('shipment-order:update')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shipmentOrderService.confirm(user, id);
  }

  @Patch(':id/hold')
  @RequirePermission('shipment-order:update')
  hold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusReasonDto,
  ) {
    return this.shipmentOrderService.hold(user, id, dto.reason);
  }

  @Patch(':id/cancel')
  @RequirePermission('shipment-order:cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusReasonDto,
  ) {
    return this.shipmentOrderService.cancel(user, id, dto.reason);
  }
}
