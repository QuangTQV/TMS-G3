import { IsIn, IsString } from 'class-validator';

export class SetCustomerStatusDto {
  @IsIn(['ACTIVE', 'LOCKED'])
  status!: 'ACTIVE' | 'LOCKED';

  @IsString()
  reason!: string;
}
