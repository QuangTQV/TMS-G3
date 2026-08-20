import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx

from .config import settings
from .errors import ApiError
from .models import AIJobType


@dataclass
class ExtractImageInput:
    image_url: str
    job_type: AIJobType
    document_name: str


@dataclass
class ExtractedImageStructure:
    """Chuẩn duy nhất giữa các nhà cung cấp — các field này đi thẳng vào
    AIExtractionResult sau khi AIProcessingJobService chạy validate nghiệp vụ."""

    raw_result: dict[str, Any]
    confidence: float | None
    invoice: dict[str, Any] | None
    container_number: str | None
    plate_number: str | None
    provider: str
    method: str
    warnings: list[str] = field(default_factory=list)
    source_text: str | None = None


def _assert_external_processing_allowed(image_url: str) -> None:
    if not settings.ai_external_processing_enabled:
        raise ApiError(503, "Xử lý ảnh AI ngoài hệ thống chưa được bật")
    try:
        url = urlparse(image_url)
    except ValueError:
        raise ApiError(400, "URL ảnh không hợp lệ") from None
    if not url.scheme or not url.netloc:
        raise ApiError(400, "URL ảnh không hợp lệ")
    if url.scheme != "https":
        raise ApiError(400, "Chỉ cho phép URL ảnh HTTPS")
    allowed = [h.strip() for h in settings.ai_image_host_allowlist.split(",") if h.strip()]
    if not allowed or url.hostname not in allowed:
        raise ApiError(400, "Host ảnh chưa nằm trong allowlist AI_IMAGE_HOST_ALLOWLIST")


def _extraction_prompt(input_: ExtractImageInput) -> str:
    structure = (
        '{"confidence":0..1,"invoice":{"issuer":"string","invoiceNumber":"string",'
        '"invoiceDate":"ISO-8601","subtotal":number,"vatAmount":number,"total":number},'
        '"warnings":["string"]}'
        if input_.job_type == AIJobType.INVOICE_OCR
        else '{"confidence":0..1,"containerNumber":"string|null","plateNumber":"string|null","warnings":["string"]}'
    )
    return (
        f"Trích xuất có cấu trúc từ ảnh {input_.document_name}. Chỉ trả JSON hợp lệ theo "
        f"schema {structure}. Không đoán dữ liệu thiếu; đặt null hoặc thêm warnings."
    )


def _number_or_none(value: Any) -> float | None:
    return value if isinstance(value, (int, float)) else None


def _string_or_none(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _normalize_structured_result(value: dict[str, Any], provider: str, method: str) -> ExtractedImageStructure:
    invoice = value.get("invoice")
    normalized_invoice = None
    if isinstance(invoice, dict):
        normalized_invoice = {
            "issuer": _string_or_none(invoice.get("issuer")) or "",
            "invoiceNumber": _string_or_none(invoice.get("invoiceNumber")) or "",
            "invoiceDate": _string_or_none(invoice.get("invoiceDate")) or "",
            "subtotal": float(invoice.get("subtotal", 0) or 0),
            "vatAmount": float(invoice.get("vatAmount", 0) or 0),
            "total": float(invoice.get("total", 0) or 0),
        }
    warnings = value.get("warnings")
    return ExtractedImageStructure(
        raw_result={"provider": provider, "method": method, "extraction": value},
        confidence=_number_or_none(value.get("confidence")),
        invoice=normalized_invoice,
        container_number=_string_or_none(value.get("containerNumber")),
        plate_number=_string_or_none(value.get("plateNumber")),
        provider=provider,
        method=method,
        warnings=[str(w) for w in warnings] if isinstance(warnings, list) else [],
    )


_CONTAINER_RE = re.compile(r"[A-Z]{4}\d{7}", re.IGNORECASE)
_PLATE_RE = re.compile(r"\d{2}[A-Z]{1,2}[- ]?\d{3,5}", re.IGNORECASE)


def _parse_ocr_text(
    text: str, job_type: AIJobType, confidence: float | None, raw: Any
) -> ExtractedImageStructure:
    compact = re.sub(r"\s+", " ", text).strip()
    raw_result = {"provider": "ocr", "text": text, "providerRaw": raw}
    if job_type == AIJobType.PHOTO_CHECK:
        container_match = _CONTAINER_RE.search(compact)
        plate_match = _PLATE_RE.search(compact)
        return ExtractedImageStructure(
            raw_result=raw_result,
            confidence=confidence,
            invoice=None,
            container_number=container_match.group(0).upper() if container_match else None,
            plate_number=plate_match.group(0).upper() if plate_match else None,
            provider="ocr",
            method="ocr",
            warnings=[],
            source_text=text,
        )
    return ExtractedImageStructure(
        raw_result=raw_result,
        confidence=confidence,
        invoice=None,
        container_number=None,
        plate_number=None,
        provider="ocr",
        method="ocr",
        warnings=["OCR chỉ trích xuất văn bản; cần VLM hoặc mapping riêng để nhận diện đầy đủ trường hóa đơn"],
        source_text=text,
    )


def _extract_vlm(input_: ExtractImageInput) -> ExtractedImageStructure:
    if not settings.ai_vlm_endpoint or not settings.ai_vlm_api_key or not settings.ai_vlm_model:
        raise ApiError(503, "Thiếu cấu hình VLM")
    try:
        response = httpx.post(
            settings.ai_vlm_endpoint,
            headers={"Authorization": f"Bearer {settings.ai_vlm_api_key}", "Content-Type": "application/json"},
            json={
                "model": settings.ai_vlm_model,
                "response_format": {"type": "json_object"},
                "temperature": 0,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": _extraction_prompt(input_)},
                            {"type": "image_url", "image_url": {"url": input_.image_url, "detail": "high"}},
                        ],
                    }
                ],
            },
            timeout=settings.ai_request_timeout_ms / 1000,
        )
    except httpx.HTTPError as exc:
        raise ApiError(503, f"VLM không phản hồi: {exc}") from exc
    if response.status_code >= 400:
        raise ApiError(503, f"VLM trả lỗi HTTP {response.status_code}")
    body = response.json()
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        raise ApiError(503, "VLM không trả nội dung trích xuất")
    import json

    return _normalize_structured_result(json.loads(content), "vlm", "vlm")


def _extract_ocr(input_: ExtractImageInput) -> ExtractedImageStructure:
    if not settings.ai_ocr_endpoint:
        raise ApiError(503, "Thiếu cấu hình OCR")
    headers = {"Content-Type": "application/json"}
    if settings.ai_ocr_api_key:
        headers["Authorization"] = f"Bearer {settings.ai_ocr_api_key}"
    try:
        response = httpx.post(
            settings.ai_ocr_endpoint,
            headers=headers,
            json={"imageUrl": input_.image_url, "documentType": input_.document_name},
            timeout=settings.ai_request_timeout_ms / 1000,
        )
    except httpx.HTTPError as exc:
        raise ApiError(503, f"OCR không phản hồi: {exc}") from exc
    if response.status_code >= 400:
        raise ApiError(503, f"OCR trả lỗi HTTP {response.status_code}")
    body = response.json()
    text = body.get("text")
    if not text:
        raise ApiError(503, "OCR không trả văn bản")
    return _parse_ocr_text(text, input_.job_type, body.get("confidence"), body.get("raw"))


def extract(input_: ExtractImageInput) -> ExtractedImageStructure:
    """Pipeline có thể cấu hình (vlm / ocr / vlm_then_ocr) — tắt mặc định để không
    đưa chứng từ ra ngoài trước khi chính sách bảo mật được duyệt
    (AI_EXTERNAL_PROCESSING_ENABLED)."""
    _assert_external_processing_allowed(input_.image_url)
    mode = settings.ai_extraction_mode
    if mode == "vlm":
        return _extract_vlm(input_)
    if mode == "ocr":
        return _extract_ocr(input_)
    try:
        return _extract_vlm(input_)
    except ApiError as vlm_error:
        try:
            output = _extract_ocr(input_)
            output.method = "vlm_then_ocr"
            output.warnings = [*output.warnings, "VLM thất bại, dùng OCR fallback"]
            return output
        except ApiError:
            raise vlm_error from None
