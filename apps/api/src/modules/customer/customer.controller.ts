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
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCreditTermsDto } from './dto/update-credit-terms.dto';
import { SetCustomerStatusDto } from './dto/set-customer-status.dto';

@Controller('v1/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @RequirePermission('customer:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.create(user, dto);
  }

  @Get()
  @RequirePermission('customer:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.customerService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('customer:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.customerService.findOne(user, id);
  }

  @Patch(':id/credit-terms')
  @RequirePermission('customer:manage-credit')
  updateCreditTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCreditTermsDto,
  ) {
    return this.customerService.updateCreditTerms(user, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('customer:manage-credit')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetCustomerStatusDto,
  ) {
    return this.customerService.setStatus(user, id, dto);
  }
}
