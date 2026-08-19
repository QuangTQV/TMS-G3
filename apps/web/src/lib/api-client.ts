// Lớp client API dùng chung — theo docs/coding-standards.md mục 3: không gọi
// fetch rải rác trong component. Bọc khuôn dạng response/error của
// docs/api-conventions.md mục 3.

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:3011';

const TOKEN_KEY = 'tms_access_token';
const USER_KEY = 'tms_user';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: unknown): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser<T>(): T | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function requestEnvelope<T>(
  path: string,
  options: RequestInit = {},
): Promise<Envelope<T>> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    // Phiên hết hạn (có token nhưng bị 401) — về trang đăng nhập. Không áp dụng
    // cho lần đăng nhập thất bại đầu tiên (chưa có token).
    if (res.status === 401 && token) {
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    const errorBody = (body as { error?: ApiErrorBody } | null)?.error ?? {
      code: 'ERROR',
      message: 'Có lỗi xảy ra',
    };
    throw new ApiError(res.status, errorBody);
  }

  return body as Envelope<T>;
}

export const api = {
  get: async <T>(path: string): Promise<T> =>
    (await requestEnvelope<T>(path)).data,

  getPage: async <T>(path: string): Promise<CursorPage<T>> => {
    const envelope = await requestEnvelope<T[]>(path);
    return {
      items: envelope.data,
      nextCursor: (envelope.meta.nextCursor as string | null) ?? null,
      hasMore: Boolean(envelope.meta.hasMore),
    };
  },

  post: async <T>(
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> =>
    (
      await requestEnvelope<T>(path, {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
        headers: extraHeaders,
      })
    ).data,

  patch: async <T>(path: string, body?: unknown): Promise<T> =>
    (
      await requestEnvelope<T>(path, {
        method: 'PATCH',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    ).data,
};
