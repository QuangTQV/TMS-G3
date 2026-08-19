import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteLineDto {
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateQuoteDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  // Giá mua dự kiến do người lập báo giá nhập tham chiếu (tra module 10) để tính
  // biên lợi nhuận — không phải nguồn sự thật của giá mua thực tế.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedBuyTotal?: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];
}
