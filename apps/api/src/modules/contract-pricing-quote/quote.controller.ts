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
import { CreateQuoteDto } from './dto/create-quote.dto';
import { RejectQuoteDto } from './dto/reject-quote.dto';
import { QuoteService } from './quote.service';

@Controller('v1/quotes')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Post()
  @RequirePermission('quote:create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuoteDto) {
    return this.quoteService.create(user, dto);
  }

  @Get()
  @RequirePermission('quote:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.quoteService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('quote:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quoteService.findOne(user, id);
  }

  @Patch(':id/approve-and-send')
  @RequirePermission('quote:approve')
  approveAndSend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.quoteService.approveAndSend(user, id);
  }

  @Patch(':id/accept')
  @RequirePermission('quote:update')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.quoteService.accept(user, id);
  }

  @Patch(':id/reject')
  @RequirePermission('quote:update')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectQuoteDto,
  ) {
    return this.quoteService.reject(user, id, dto.reason);
  }

  @Post(':id/convert-to-order')
  @RequirePermission('quote:convert')
  convertToOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.quoteService.convertToOrder(user, id);
  }
}
