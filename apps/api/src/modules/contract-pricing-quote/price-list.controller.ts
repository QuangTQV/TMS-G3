import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { PriceListService } from './price-list.service';

@Controller('v1/price-lists')
export class PriceListController {
  constructor(private readonly priceListService: PriceListService) {}

  @Post()
  @RequirePermission('price-list:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePriceListDto,
  ) {
    return this.priceListService.create(user, dto);
  }

  @Get(':id')
  @RequirePermission('price-list:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.priceListService.findOne(user, id);
  }

  @Patch(':id/approve')
  @RequirePermission('price-list:approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.priceListService.approve(user, id);
  }
}
