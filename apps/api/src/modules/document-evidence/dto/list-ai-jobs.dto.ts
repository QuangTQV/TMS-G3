import { AIJobStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class ListAiJobsDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(AIJobStatus)
  status?: AIJobStatus;
}
