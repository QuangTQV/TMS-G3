import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  plateNumber!: string;

  @IsString()
  vehicleType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  loadCapacityKg?: number;
}
