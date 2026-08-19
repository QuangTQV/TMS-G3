import { IsBoolean, IsOptional } from 'class-validator';

export class CreateTripDto {
  @IsOptional()
  @IsBoolean()
  isOutsourced?: boolean;
}
