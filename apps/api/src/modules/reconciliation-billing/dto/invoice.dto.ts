import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// vatAmount do kế toán nhập theo đúng quy định thuế hiện hành — không hardcode %VAT
// trong code vì mức thuế/áp dụng cụ thể chưa được xác nhận (mục 7, CLAUDE.md).
export class CreateInvoiceFromStatementDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vatAmount!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class VoidInvoiceDto {
  @IsString()
  reason!: string;
}

export class MarkInvoiceDisputedDto {
  @IsString()
  reason!: string;
}

export class CreateAccountsPayableFromStatementDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  method!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
