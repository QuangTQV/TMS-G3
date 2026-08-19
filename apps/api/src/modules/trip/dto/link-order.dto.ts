import { IsOptional, IsString } from 'class-validator';

export class LinkOrderDto {
  @IsString()
  shipmentOrderId!: string;

  @IsOptional()
  @IsString()
  splitReason?: string;
}
