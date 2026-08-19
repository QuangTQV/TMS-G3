import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Thay đổi điều khoản thanh toán/hạn mức tín dụng — thuộc nhóm "liên quan tiền",
 * bắt buộc có audit log và lý do (docs/security-audit.md).
 */
export class UpdateCreditTermsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  paymentTermDays?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  creditLimit?: number;

  @IsString()
  reason!: string;
}
