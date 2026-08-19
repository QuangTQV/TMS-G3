import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class FailAiJobDto {
  @IsString()
  errorMessage!: string;
}

// Payload mà worker AI (chưa xây dựng thật — xem docs/ai-processing.md) hoặc công cụ
// vận hành gửi về sau khi gọi LLM xong. Endpoint chỉ nhận kết quả đã có sẵn, không tự
// gọi LLM (ràng buộc "chưa chốt nhà cung cấp LLM", docs/open-questions.md).
class InvoiceExtractionDto {
  @IsString()
  issuer!: string;

  @IsString()
  invoiceNumber!: string;

  @IsDateString()
  invoiceDate!: string;

  @IsNumber()
  subtotal!: number;

  @IsNumber()
  vatAmount!: number;

  @IsNumber()
  total!: number;
}

export class SubmitAiResultDto {
  @IsObject()
  rawResult!: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceExtractionDto)
  invoice?: InvoiceExtractionDto;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  plateNumber?: string;
}
