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
import { ReconciliationType } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import {
  AddReconciliationLineDto,
  CreateReconciliationStatementDto,
  ReopenReconciliationStatementDto,
} from './dto/reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';

@Controller('v1/reconciliation-statements')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Post()
  @RequirePermission('reconciliation:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReconciliationStatementDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  @RequirePermission('reconciliation:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
    @Query('type') type?: ReconciliationType,
  ) {
    return this.service.findMany(user, query.cursor, query.limit, type);
  }

  @Get(':id')
  @RequirePermission('reconciliation:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post(':id/lines')
  @RequirePermission('reconciliation:manage')
  addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddReconciliationLineDto,
  ) {
    return this.service.addLine(user, id, dto);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermission('reconciliation:manage')
  removeLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.service.removeLine(user, id, lineId);
  }

  @Patch(':id/confirm')
  @RequirePermission('reconciliation:confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.confirm(user, id);
  }

  @Patch(':id/lock')
  @RequirePermission('reconciliation:confirm')
  lock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.lock(user, id);
  }

  @Patch(':id/reopen')
  @RequirePermission('reconciliation:reopen')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReopenReconciliationStatementDto,
  ) {
    return this.service.reopen(user, id, dto.reason);
  }
}
