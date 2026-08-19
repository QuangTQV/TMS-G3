import { IsString } from 'class-validator';

export class RejectDocumentEvidenceDto {
  @IsString()
  reason!: string;
}
