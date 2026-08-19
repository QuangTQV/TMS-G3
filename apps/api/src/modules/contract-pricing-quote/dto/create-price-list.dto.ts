import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const SURCHARGE_TYPES = [
  'FUEL',
  'TOLL',
  'WAITING',
  'LIFT_ON_OFF',
  'OVERTIME',
  'YARD_STORAGE',
  'OTHER',
] as const;

export class PriceListLineDto {
  @IsString()
  originLabel!: string;

  @IsString()
  destLabel!: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsString()
  unit!: string;
}

export class SurchargeDto {
  @IsIn(SURCHARGE_TYPES)
  type!: (typeof SURCHARGE_TYPES)[number];

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isPercent?: boolean;
}

export class CreatePriceListDto {
  @IsString()
  contractId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListLineDto)
  lines!: PriceListLineDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurchargeDto)
  surcharges!: SurchargeDto[];
}
