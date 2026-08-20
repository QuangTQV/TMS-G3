from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .errors import ApiError
from .models import IdempotencyRecord


def with_idempotency(db: Session, idempotency_key: str | None, endpoint: str, fn: Callable[[], Any]) -> Any:
    """Khớp IdempotencyService.withIdempotency bên NestJS — dùng cho mọi endpoint
    ghi dữ liệu gọi từ app tài xế (ràng buộc 1, CLAUDE.md mục 5). `fn` chỉ được
    add()/flush() vào session, KHÔNG tự commit — hàm này commit một lần duy nhất để
    thay đổi nghiệp vụ và bản ghi idempotency cùng vào chung 1 transaction."""
    if not idempotency_key:
        result = fn()
        db.commit()
        return result

    existing = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.idempotencyKey == idempotency_key,
            IdempotencyRecord.endpoint == endpoint,
        )
    )
    if existing is not None:
        return existing.responseBody

    result = fn()
    db.add(IdempotencyRecord(idempotencyKey=idempotency_key, endpoint=endpoint, responseBody=result))
    try:
        db.commit()
    except IntegrityError:
        # Race: 2 request cùng key chạy song song — request thua unique constraint
        # phải coi là trùng, không phá luồng chính.
        db.rollback()
        raise ApiError(409, "Yêu cầu với Idempotency-Key này đang được xử lý") from None
    return result
