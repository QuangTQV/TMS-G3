import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

/** Ghi nhận trạng thái đang bảo trì và ngày dự kiến khả dụng — module 10 R1. */
export class SetVehicleMaintenanceDto {
  @IsBoolean()
  isMaintenance!: boolean;

  @IsOptional()
  @IsDateString()
  maintenanceUntil?: string;
}
