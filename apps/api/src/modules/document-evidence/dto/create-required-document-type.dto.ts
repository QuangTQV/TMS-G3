import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AIJobType } from '@prisma/client';

export class CreateRequiredDocumentTypeDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(AIJobType)
  aiJobType?: AIJobType;
}
