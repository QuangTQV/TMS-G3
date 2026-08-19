import { IsString } from 'class-validator';

export class RejectQuoteDto {
  @IsString()
  reason!: string;
}
