import uuid
from typing import Any


def envelope(result: Any) -> dict[str, Any]:
    """Bọc response thành công theo docs/api-conventions.md mục 3 — khớp
    ResponseInterceptor phía apps/api (NestJS). Kết quả đã có sẵn {data, meta}
    (vd. trang cursor từ to_cursor_page) chỉ được gộp thêm requestId, không bọc
    lồng thêm lớp data nữa."""
    request_id = str(uuid.uuid4())
    if isinstance(result, dict) and "data" in result and "meta" in result:
        return {**result, "meta": {**result["meta"], "requestId": request_id}}
    return {"data": result, "meta": {"requestId": request_id}}
