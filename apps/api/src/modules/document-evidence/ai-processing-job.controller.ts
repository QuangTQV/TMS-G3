import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { AIProcessingJobService } from './ai-processing-job.service';
import { ListAiJobsDto } from './dto/list-ai-jobs.dto';
import { FailAiJobDto, SubmitAiResultDto } from './dto/submit-ai-result.dto';

@Controller('v1/ai-jobs')
export class AIProcessingJobController {
  constructor(
    private readonly aiProcessingJobService: AIProcessingJobService,
  ) {}

  @Get()
  @RequirePermission('ai-job:read')
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAiJobsDto,
  ) {
    return this.aiProcessingJobService.findMany(
      user,
      query.cursor,
      query.limit,
      query.status,
    );
  }

  @Get(':id')
  @RequirePermission('ai-job:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.aiProcessingJobService.findOne(user, id);
  }

  @Post(':id/result')
  @RequirePermission('ai-job:submit-result')
  submitResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitAiResultDto,
  ) {
    return this.aiProcessingJobService.submitResult(user, id, dto);
  }

  @Post(':id/start')
  @RequirePermission('ai-job:manage')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.aiProcessingJobService.markProcessing(user, id);
  }

  @Post(':id/process')
  @RequirePermission('ai-job:manage')
  process(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.aiProcessingJobService.process(user, id);
  }

  @Post(':id/fail')
  @RequirePermission('ai-job:manage')
  fail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FailAiJobDto,
  ) {
    return this.aiProcessingJobService.fail(user, id, dto.errorMessage);
  }

  @Post(':id/retry')
  @RequirePermission('ai-job:manage')
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.aiProcessingJobService.retry(user, id);
  }

  @Post(':id/create-cost-draft')
  @RequirePermission('trip-cost:manage')
  createCostDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiProcessingJobService.createCostDraft(user, id);
  }
}
