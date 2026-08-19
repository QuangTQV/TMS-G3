import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePickupDeliveryPointDto {
  @IsIn(['PICKUP', 'DELIVERY'])
  type!: 'PICKUP' | 'DELIVERY';

  @Type(() => Number)
  @IsNumber()
  sequence!: number;

  @IsOptional()
  @IsString()
  customerLocationId?: string;

  @IsOptional()
  @IsString()
  freeAddress?: string;

  @IsOptional()
  @IsDateString()
  windowFrom?: string;

  @IsOptional()
  @IsDateString()
  windowTo?: string;

  @IsOptional()
  @IsString()
  bookingNumber?: string;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  sealNumber?: string;

  @IsOptional()
  @IsString()
  depotCode?: string;

  @IsOptional()
  @IsDateString()
  cutOffAt?: string;
}

export class CreateCargoDto {
  @IsString()
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  packageCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  volumeCbm?: number;

  @IsOptional()
  @IsString()
  requiresStorage?: string;
}

export class CreateShipmentOrderDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  quoteId?: string;

  @IsOptional()
  @IsString()
  customerRef?: string;

  @IsIn(['manual', 'excel', 'email', 'zalo', 'api', 'old_order'])
  sourceChannel!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellTotal!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedBuyTotal?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePickupDeliveryPointDto)
  points!: CreatePickupDeliveryPointDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCargoDto)
  cargos!: CreateCargoDto[];
}
