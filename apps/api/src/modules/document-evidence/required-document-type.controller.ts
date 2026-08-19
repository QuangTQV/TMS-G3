import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { CreateRequiredDocumentTypeDto } from './dto/create-required-document-type.dto';
import { RequiredDocumentTypeService } from './required-document-type.service';

@Controller('v1/document-types')
export class RequiredDocumentTypeController {
  constructor(
    private readonly documentTypeService: RequiredDocumentTypeService,
  ) {}

  @Post()
  @RequirePermission('document-type:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRequiredDocumentTypeDto,
  ) {
    return this.documentTypeService.create(user, dto);
  }

  @Get()
  @RequirePermission('document-type:read')
  findMany() {
    return this.documentTypeService.findMany();
  }

  @Patch(':id/deactivate')
  @RequirePermission('document-type:manage')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentTypeService.deactivate(user, id);
  }
}
