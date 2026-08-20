import re
from datetime import datetime, timedelta, timezone
from typing import Any, TypedDict

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

from .config import settings

_hasher = PasswordHasher()

_PHC_RE = re.compile(r"^\$argon2(?P<variant>i|d|id)\$v=(?P<v>\d+)\$(?P<params>[^$]+)\$(?P<salt>[^$]+)\$(?P<hash>[^$]+)$")


def _normalize_phc_param_order(encoded: str) -> str:
    # Node's `argon2` npm package encodes params như "m=...,p=...,t=...";
    # argon2-cffi (dùng bindings C chuẩn) chỉ chấp nhận đúng thứ tự PHC
    # "m=...,t=...,p=...". Cả 2 hash cùng thuật toán argon2id — chỉ khác thứ tự
    # field trong chuỗi, nên sắp lại field trước khi verify là đủ, không phải
    # tính toán lại hash.
    match = _PHC_RE.match(encoded)
    if not match:
        return encoded
    params = dict(pair.split("=", 1) for pair in match.group("params").split(","))
    if not {"m", "t", "p"}.issubset(params):
        return encoded
    ordered_params = f"m={params['m']},t={params['t']},p={params['p']}"
    return (
        f"$argon2{match.group('variant')}$v={match.group('v')}"
        f"${ordered_params}${match.group('salt')}${match.group('hash')}"
    )

_DURATION_RE = re.compile(r"^(\d+)\s*(s|m|h|d)$")
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_duration_seconds(value: str) -> int:
    match = _DURATION_RE.match(value.strip().lower())
    if not match:
        raise ValueError(f"Không đọc được JWT_EXPIRES_IN: {value}")
    amount, unit = match.groups()
    return int(amount) * _UNIT_SECONDS[unit]


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(hashed: str, plain: str) -> bool:
    # argon2-cffi và npm `argon2` đều theo chuẩn PHC string — hash sinh bởi bên
    # kia vẫn verify được ở đây (sau khi chuẩn hoá thứ tự param, xem trên).
    try:
        return _hasher.verify(_normalize_phc_param_order(hashed), plain)
    except VerificationError:
        return False


class JwtPayload(TypedDict):
    sub: str
    branchId: str
    roles: list[str]
    permissions: list[str]


def create_access_token(payload: JwtPayload) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=parse_duration_seconds(settings.jwt_expires_in))
    to_encode: dict[str, Any] = {**payload, "iat": int(now.timestamp()), "exp": expires_at}
    return jwt.encode(to_encode, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> JwtPayload:
    decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    return JwtPayload(
        sub=decoded["sub"],
        branchId=decoded["branchId"],
        roles=decoded.get("roles", []),
        permissions=decoded.get("permissions", []),
    )
