import json
from typing import Any

from sqlalchemy.orm import Session

from .models import AuditLog


def _to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    return json.loads(json.dumps(value, default=str))


def record_audit_log(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_user_id: str,
    actor_role: str | None = None,
    reason: str | None = None,
    before_state: Any = None,
    after_state: Any = None,
) -> AuditLog:
    entry = AuditLog(
        entityType=entity_type,
        entityId=entity_id,
        action=action,
        actorUserId=actor_user_id,
        actorRole=actor_role,
        reason=reason,
        beforeState=_to_jsonable(before_state),
        afterState=_to_jsonable(after_state),
    )
    db.add(entry)
    return entry
