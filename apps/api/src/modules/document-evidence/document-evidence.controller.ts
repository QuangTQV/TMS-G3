import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { DocumentEvidenceService } from './document-evidence.service';
import { RejectDocumentEvidenceDto } from './dto/reject-document-evidence.dto';
import { UploadDocumentEvidenceDto } from './dto/upload-document-evidence.dto';

@Controller('v1/trips/:tripId/documents')
export class TripDocumentEvidenceController {
  constructor(
    private readonly documentEvidenceService: DocumentEvidenceService,
  ) {}

  @Post()
  @RequirePermission('document-evidence:upload')
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Body() dto: UploadDocumentEvidenceDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.documentEvidenceService.upload(
      user,
      tripId,
      dto,
      idempotencyKey,
    );
  }

  @Get()
  @RequirePermission('document-evidence:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId') tripId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.documentEvidenceService.findManyByTrip(
      user,
      tripId,
      query.cursor,
      query.limit,
    );
  }
}

@Controller('v1/document-evidences')
export class DocumentEvidenceController {
  constructor(
    private readonly documentEvidenceService: DocumentEvidenceService,
  ) {}

  @Get(':id')
  @RequirePermission('document-evidence:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentEvidenceService.findOne(user, id);
  }

  @Patch(':id/verify')
  @RequirePermission('document-evidence:verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentEvidenceService.verify(user, id);
  }

  @Patch(':id/reject')
  @RequirePermission('document-evidence:verify')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDocumentEvidenceDto,
  ) {
    return this.documentEvidenceService.reject(user, id, dto.reason);
  }

  @Patch(':id/lock')
  @RequirePermission('document-evidence:lock')
  lock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentEvidenceService.lock(user, id);
  }

  @Patch(':id/share')
  @RequirePermission('document-evidence:share')
  share(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentEvidenceService.share(user, id);
  }
}
