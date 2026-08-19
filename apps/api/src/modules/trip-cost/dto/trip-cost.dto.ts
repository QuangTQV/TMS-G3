import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const CATEGORIES = [
  'FUEL',
  'TOLL',
  'PARKING',
  'LIFT_ON_OFF',
  'WAITING',
  'REPAIR',
  'OTHER',
] as const;

export class CreateTripCostPlanDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class CreateTripCostActualDto extends CreateTripCostPlanDto {
  @IsDateString()
  incurredAt!: string;

  // Tham chiếu chứng từ module 7; storage vẫn do module chứng từ sở hữu.
  @IsOptional()
  @IsString()
  evidenceId?: string;
}

export class RejectTripCostActualDto {
  @IsString()
  reason!: string;
}

export class CreateAdvanceDto {
  @IsString()
  recipientName!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  purpose!: string;
}

export class CancelAdvanceDto {
  @IsString()
  reason!: string;
}
