import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

const TYPES = ['CUSTOMER', 'CARRIER'] as const;

export class CreateReconciliationStatementDto {
  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @ValidateIf(
    (dto: CreateReconciliationStatementDto) => dto.type === 'CUSTOMER',
  )
  @IsString()
  customerId?: string;

  @ValidateIf((dto: CreateReconciliationStatementDto) => dto.type === 'CARRIER')
  @IsString()
  carrierId?: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;
}

// Không tự tính amount — nhân viên đối soát nhập số tiền dòng, hệ thống chỉ validate
// dòng có thuộc đúng khách hàng/nhà vận tải/chi nhánh của statement hay không.
export class AddReconciliationLineDto {
  @IsOptional()
  @IsString()
  shipmentOrderId?: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class ReopenReconciliationStatementDto {
  @IsString()
  reason!: string;
}
