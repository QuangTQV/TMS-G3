import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { CarrierService } from './carrier.service';
import { CreateCarrierDto } from './dto/create-carrier.dto';

@Controller('v1/carriers')
export class CarrierController {
  constructor(private readonly carrierService: CarrierService) {}

  @Post()
  @RequirePermission('resource:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCarrierDto,
  ) {
    return this.carrierService.create(user, dto);
  }

  @Get()
  @RequirePermission('resource:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.carrierService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('resource:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.carrierService.findOne(user, id);
  }
}
