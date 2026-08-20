from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import User
from ..response import envelope
from ..schemas import LoginRequest
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/login")
def login(dto: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == dto.email))

    # Không phân biệt "email không tồn tại" và "sai mật khẩu" trong message trả
    # về — tránh lộ thông tin tài khoản nào tồn tại (khớp AuthService bên NestJS).
    if user is None or not user.isActive:
        raise ApiError(401, "Sai email hoặc mật khẩu")

    if not verify_password(user.passwordHash, dto.password):
        raise ApiError(401, "Sai email hoặc mật khẩu")

    roles = [ur.role.code for ur in user.roles]
    permissions = sorted({rp.permission.code for ur in user.roles for rp in ur.role.permissions})

    access_token = create_access_token(
        {"sub": user.id, "branchId": user.branchId, "roles": roles, "permissions": permissions}
    )

    user.lastLoginAt = datetime.utcnow()
    db.commit()

    return envelope(
        {
            "accessToken": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "fullName": user.fullName,
                "branchId": user.branchId,
                "roles": roles,
                "permissions": permissions,
            },
        }
    )
