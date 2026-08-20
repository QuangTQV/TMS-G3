from typing import Any, Protocol


class HasId(Protocol):
    id: str


def to_cursor_page(rows: list[Any], limit: int) -> dict[str, Any]:
    has_more = len(rows) > limit
    data = rows[:limit] if has_more else rows
    next_cursor = data[-1].id if has_more and data else None
    return {"data": data, "meta": {"nextCursor": next_cursor, "hasMore": has_more}}
