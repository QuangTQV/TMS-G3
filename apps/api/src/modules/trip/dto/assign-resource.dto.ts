import { IsOptional, IsString } from 'class-validator';

/**
 * Gán/thay nguồn lực nội bộ (xe + tài xế) hoặc thuê ngoài (nhà vận tải) — module 5
 * "Gán/thay/thu hồi xe, tài xế, rơ-moóc, container hoặc nhà vận tải". Chỉ nên gửi
 * một trong hai cặp (vehicleId+driverId) hoặc carrierId tuỳ isOutsourced của chuyến.
 */
export class AssignResourceDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  carrierId?: string;
}
