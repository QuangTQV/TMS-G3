import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearSession, getStoredUser, setSession } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  branchId: string;
  roles: string[];
  permissions: string[];
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Không suy luận quyền hiển thị từ dữ liệu nghiệp vụ — luôn dựa vào
  // user.permissions do backend trả về lúc đăng nhập (coding-standards.md mục 3).
  hasPermission: (code: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    getStoredUser<AuthUser>(),
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email, password) => {
        const result = await api.post<LoginResponse>('/v1/auth/login', {
          email,
          password,
        });
        setSession(result.accessToken, result.user);
        setUser(result.user);
      },
      logout: () => {
        clearSession();
        setUser(null);
      },
      hasPermission: (code) => user?.permissions.includes(code) ?? false,
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng trong AuthProvider');
  return ctx;
}
