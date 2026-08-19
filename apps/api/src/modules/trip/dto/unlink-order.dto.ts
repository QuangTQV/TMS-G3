import { IsString } from 'class-validator';

export class UnlinkOrderDto {
  @IsString()
  reason!: string;
}
