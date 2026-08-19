import { IsString } from 'class-validator';

export class ChangeTripStatusReasonDto {
  @IsString()
  reason!: string;
}
