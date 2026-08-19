import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import {
  CancelAdvanceDto,
  CreateAdvanceDto,
  CreateTripCostActualDto,
  CreateTripCostPlanDto,
  RejectTripCostActualDto,
} from './dto/trip-cost.dto';
import { TripCostService } from './trip-cost.service';

@Controller('v1/trips/:tripId/financials')
export class TripCostController {
  constructor(private readonly service: TripCostService) {}

  @Get()
  @RequirePermission('trip-cost:read')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
  ) {
    return this.service.summary(user, tripId);
  }

  @Post('plans')
  @RequirePermission('trip-cost:manage')
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateTripCostPlanDto,
  ) {
    return this.service.createPlan(user, tripId, dto);
  }

  @Post('actuals')
  @RequirePermission('trip-cost:manage')
  createActual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateTripCostActualDto,
  ) {
    return this.service.createActual(user, tripId, dto);
  }

  @Post('advances')
  @RequirePermission('advance:manage')
  createAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: CreateAdvanceDto,
  ) {
    return this.service.createAdvance(user, tripId, dto);
  }
}

@Controller('v1/financials')
export class TripFinancialActionController {
  constructor(private readonly service: TripCostService) {}

  @Post('actuals/:id/submit')
  @RequirePermission('trip-cost:manage')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.submitActual(user, id);
  }

  @Post('actuals/:id/approve')
  @RequirePermission('trip-cost:approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.approveActual(user, id);
  }

  @Post('actuals/:id/reject')
  @RequirePermission('trip-cost:approve')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectTripCostActualDto,
  ) {
    return this.service.rejectActual(user, id, dto.reason);
  }

  @Post('advances/:id/approve')
  @RequirePermission('advance:approve')
  approveAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.approveAdvance(user, id);
  }

  @Post('advances/:id/pay')
  @RequirePermission('advance:pay')
  payAdvance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.markAdvancePaid(user, id);
  }

  @Post('advances/:id/settle')
  @RequirePermission('advance:manage')
  settleAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.settleAdvance(user, id);
  }

  @Post('advances/:id/cancel')
  @RequirePermission('advance:manage')
  cancelAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelAdvanceDto,
  ) {
    return this.service.cancelAdvance(user, id, dto.reason);
  }
}
