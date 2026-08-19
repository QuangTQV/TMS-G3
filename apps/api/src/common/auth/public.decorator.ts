import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Đánh dấu endpoint không cần JWT — chỉ dùng cho login/health check. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
