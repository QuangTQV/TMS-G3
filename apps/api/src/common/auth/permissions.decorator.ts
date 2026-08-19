import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Khai báo quyền cần có để gọi endpoint, vd @RequirePermission('quote:approve').
 * Theo docs/security-audit.md — đây là cách duy nhất để gate quyền; không tự viết
 * `if (user.role === 'admin')` trong controller/service của module nghiệp vụ.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
