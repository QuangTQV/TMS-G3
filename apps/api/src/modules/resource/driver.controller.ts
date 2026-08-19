import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverService } from './driver.service';

@Controller('v1/drivers')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post()
  @RequirePermission('resource:manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDriverDto) {
    return this.driverService.create(user, dto);
  }

  @Get()
  @RequirePermission('resource:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.driverService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('resource:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.driverService.findOne(user, id);
  }
}
