import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateContractDto {
  @IsString()
  code!: string;

  @IsString()
  customerId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
