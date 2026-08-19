import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function isPreShapedEnvelope(
  value: unknown,
): value is { data: unknown; meta: Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value
  );
}

/**
 * Bọc mọi response thành công theo khuôn dạng docs/api-conventions.md mục 3.
 * Endpoint phân trang tự trả về { data, meta: { nextCursor, hasMore } } — interceptor
 * chỉ thêm requestId vào meta thay vì bọc lồng thêm một lớp data nữa.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const requestId = randomUUID();
    return next.handle().pipe(
      map((result: unknown) => {
        if (isPreShapedEnvelope(result)) {
          return { ...result, meta: { ...result.meta, requestId } };
        }
        return { data: result ?? null, meta: { requestId } };
      }),
    );
  }
}
