import {
  Body,
  Controller,
  Delete,
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
import { AssignResourceDto } from './dto/assign-resource.dto';
import { ChangeTripStatusReasonDto } from './dto/change-trip-status.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { LinkOrderDto } from './dto/link-order.dto';
import { UnlinkOrderDto } from './dto/unlink-order.dto';
import { TripService } from './trip.service';

@Controller('v1/trips')
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  @RequirePermission('trip:create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    return this.tripService.create(user, dto);
  }

  @Get()
  @RequirePermission('trip:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.tripService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('trip:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripService.findOne(user, id);
  }

  @Post(':id/orders')
  @RequirePermission('trip:update')
  linkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkOrderDto,
  ) {
    return this.tripService.linkOrder(user, id, dto);
  }

  @Delete(':id/orders/:shipmentOrderId')
  @RequirePermission('trip:update')
  unlinkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('shipmentOrderId') shipmentOrderId: string,
    @Body() dto: UnlinkOrderDto,
  ) {
    return this.tripService.unlinkOrder(user, id, shipmentOrderId, dto.reason);
  }

  @Get(':id/resource-suggestions')
  @RequirePermission('trip:read')
  suggestResources(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tripService.suggestResources(user, id);
  }

  @Patch(':id/resource')
  @RequirePermission('trip:update')
  assignResource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignResourceDto,
  ) {
    return this.tripService.assignResource(user, id, dto);
  }

  @Patch(':id/dispatch')
  @RequirePermission('trip:dispatch')
  dispatch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripService.dispatch(user, id);
  }

  @Patch(':id/start')
  @RequirePermission('trip:update')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripService.start(user, id);
  }

  @Patch(':id/complete')
  @RequirePermission('trip:update')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripService.complete(user, id);
  }

  @Patch(':id/pause')
  @RequirePermission('trip:update')
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeTripStatusReasonDto,
  ) {
    return this.tripService.pause(user, id, dto.reason);
  }

  @Patch(':id/resume')
  @RequirePermission('trip:update')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripService.resume(user, id);
  }

  @Patch(':id/cancel')
  @RequirePermission('trip:cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeTripStatusReasonDto,
  ) {
    return this.tripService.cancel(user, id, dto.reason);
  }
}
