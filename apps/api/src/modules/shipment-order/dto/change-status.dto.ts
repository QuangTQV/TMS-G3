import { IsString } from 'class-validator';

/** Dùng cho hủy/tạm giữ — luôn bắt buộc lý do (ràng buộc 6, CLAUDE.md). */
export class ChangeStatusReasonDto {
  @IsString()
  reason!: string;
}
