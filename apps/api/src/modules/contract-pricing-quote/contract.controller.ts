import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';

@Controller('v1/contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post()
  @RequirePermission('contract:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContractDto,
  ) {
    return this.contractService.create(user, dto);
  }

  @Get()
  @RequirePermission('contract:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ) {
    return this.contractService.findMany(user, query.cursor, query.limit);
  }

  @Get(':id')
  @RequirePermission('contract:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contractService.findOne(user, id);
  }
}
