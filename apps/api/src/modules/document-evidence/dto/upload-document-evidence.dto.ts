import { IsString } from 'class-validator';

// Client (chủ yếu app tài xế) tự upload file lên storage trước rồi gửi URL + hash
// về đây — API không nhận multipart trực tiếp (chưa chốt nhà cung cấp storage, xem
// docs/open-questions.md); giữ endpoint đơn giản, không giả định hạ tầng cụ thể.
export class UploadDocumentEvidenceDto {
  @IsString()
  requiredDocumentTypeId!: string;

  @IsString()
  fileUrl!: string;

  @IsString()
  fileHash!: string;
}
