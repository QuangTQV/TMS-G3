import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import {
  CreateAccountsPayableFromStatementDto,
  RecordPaymentDto,
} from './dto/invoice.dto';
import { AccountsPayableService } from './accounts-payable.service';

@Controller('v1/reconciliation-statements/:statementId/accounts-payable')
export class StatementAccountsPayableController {
  constructor(private readonly service: AccountsPayableService) {}

  @Post()
  @RequirePermission('accounts-payable:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('statementId') statementId: string,
    @Body() dto: CreateAccountsPayableFromStatementDto,
  ) {
    return this.service.createFromStatement(user, statementId, dto);
  }
}

@Controller('v1/accounts-payable')
export class AccountsPayableController {
  constructor(private readonly service: AccountsPayableService) {}

  @Get()
  @RequirePermission('accounts-payable:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.service.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('accounts-payable:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post(':id/payments')
  @RequirePermission('accounts-payable:record-payment')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.service.recordPayment(user, id, dto);
  }
}
