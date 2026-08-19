import { IsString } from 'class-validator';

export class CreateCarrierDto {
  @IsString()
  code!: string;

  @IsString()
  legalName!: string;
}
