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
import {
  CreateInvoiceFromStatementDto,
  MarkInvoiceDisputedDto,
  RecordPaymentDto,
  VoidInvoiceDto,
} from './dto/invoice.dto';
import { InvoiceService } from './invoice.service';

@Controller('v1/reconciliation-statements/:statementId/invoice')
export class StatementInvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Post()
  @RequirePermission('invoice:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('statementId') statementId: string,
    @Body() dto: CreateInvoiceFromStatementDto,
  ) {
    return this.service.createFromStatement(user, statementId, dto);
  }
}

@Controller('v1/invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  @RequirePermission('invoice:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.service.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('invoice:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Patch(':id/submit')
  @RequirePermission('invoice:manage')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.submitForApproval(user, id);
  }

  @Patch(':id/issue')
  @RequirePermission('invoice:issue')
  issue(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.issue(user, id);
  }

  @Patch(':id/void')
  @RequirePermission('invoice:void')
  voidInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    return this.service.voidInvoice(user, id, dto.reason);
  }

  @Patch(':id/mark-disputed')
  @RequirePermission('invoice:manage')
  markDisputed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkInvoiceDisputedDto,
  ) {
    return this.service.markDisputed(user, id, dto.reason);
  }

  @Post(':id/payments')
  @RequirePermission('invoice:record-payment')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.service.recordPayment(user, id, dto);
  }
}
