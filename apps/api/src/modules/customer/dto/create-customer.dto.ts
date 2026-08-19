import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  code!: string;

  @IsString()
  legalName!: string;

  @IsString()
  taxCode!: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  paymentTermDays?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  creditLimit?: number;
}
