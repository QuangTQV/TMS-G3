from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Khớp STATUS_TO_CODE trong apps/api/src/common/http/http-exception.filter.ts —
# giữ đồng nhất khuôn dạng lỗi {error:{code,message,details}} giữa 2 backend.
STATUS_TO_CODE = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "BUSINESS_RULE_VIOLATION",
}


class ApiError(Exception):
    def __init__(self, status_code: int, message: str, details: Any = None, code: str | None = None):
        self.status_code = status_code
        self.message = message
        self.details = details
        self.code = code or STATUS_TO_CODE.get(status_code, "ERROR")


def _error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content={"error": body})


async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return _error_response(exc.status_code, exc.code, exc.message, exc.details)


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Chuẩn hoá về 400 + VALIDATION_ERROR thay vì mặc định 422 của FastAPI, khớp
    # docs/api-conventions.md mục 3 (dùng chung với NestJS ValidationPipe).
    return _error_response(
        status.HTTP_400_BAD_REQUEST,
        "VALIDATION_ERROR",
        "Dữ liệu đầu vào không hợp lệ",
        details=exc.errors(),
    )


async def unhandled_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Có lỗi hệ thống xảy ra")
