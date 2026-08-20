from dataclasses import dataclass

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .errors import ApiError
from .security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthenticatedUser:
    user_id: str
    branch_id: str
    roles: list[str]
    permissions: list[str]


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedUser:
    if credentials is None:
        raise ApiError(401, "Chưa xác thực")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise ApiError(401, "Token không hợp lệ hoặc đã hết hạn") from None
    return AuthenticatedUser(
        user_id=payload["sub"],
        branch_id=payload["branchId"],
        roles=payload["roles"],
        permissions=payload["permissions"],
    )


def require_permission(*codes: str):
    def _checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        missing = [c for c in codes if c not in user.permissions]
        if missing:
            raise ApiError(403, f"Thiếu quyền: {', '.join(codes)}")
        return user

    return _checker


def assert_branch_scope(user: AuthenticatedUser, resource_branch_id: str) -> None:
    if user.branch_id != resource_branch_id:
        raise ApiError(403, "Dữ liệu không thuộc phạm vi chi nhánh của bạn")
