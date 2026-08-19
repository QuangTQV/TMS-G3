export interface JwtPayload {
  sub: string; // userId
  branchId: string;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedUser {
  userId: string;
  branchId: string;
  roles: string[];
  permissions: string[];
}
