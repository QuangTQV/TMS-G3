import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './jwt-payload.interface';

/**
 * Kiểm tra phạm vi dữ liệu theo chi nhánh (docs/security-audit.md mục 1).
 * R1 hiện gán mỗi user vào đúng 1 branch qua User.branchId — mở rộng sang nhiều
 * branch/khách hàng khi có yêu cầu chi tiết hơn từ G3.
 */
export function assertBranchScope(
  user: AuthenticatedUser,
  resourceBranchId: string,
): void {
  if (user.branchId !== resourceBranchId) {
    throw new ForbiddenException(
      'Dữ liệu không thuộc phạm vi chi nhánh của bạn',
    );
  }
}
