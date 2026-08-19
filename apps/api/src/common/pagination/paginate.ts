export interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean };
}

/**
 * Chuyển kết quả query (lấy dư 1 bản ghi so với limit) thành trang cursor chuẩn.
 * Dùng chung cho mọi endpoint danh sách — xem docs/api-conventions.md mục 3.
 */
export function toCursorPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  return { data, meta: { nextCursor, hasMore } };
}
