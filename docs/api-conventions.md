# Quy ước API

## 1. Nguyên tắc chung

- REST qua JSON. Base path theo module: `/api/v1/<module-kebab-case>/...`
  (VD: `/api/v1/shipment-orders`, `/api/v1/reconciliation`).
- Versioning qua path (`/v1`), không phá vỡ contract cũ khi thêm field — chỉ thêm,
  không đổi kiểu/xoá field đang dùng mà không tăng version.
- Tất cả timestamp: ISO 8601, UTC. Tiền tệ: lưu số nguyên (đơn vị nhỏ nhất, VD đồng)
  hoặc `decimal` chính xác — không dùng `float`.

## 2. Xác thực & phân quyền

- Bearer token (JWT) trong header `Authorization`. Token mang `userId`, `roleIds`,
  `dataScope` (chi nhánh/khách hàng được phép truy cập).
- Mọi endpoint đọc/ghi dữ liệu nghiệp vụ phải qua guard kiểm tra quyền tập trung ở
  module 12 — không tự viết `if (user.role === 'admin')` rải rác trong từng module
  (ràng buộc 5, CLAUDE.md). Xem chi tiết [security-audit.md](./security-audit.md).
- Kênh riêng cho client ngoài (app tài xế, cổng khách hàng, cổng nhà vận tải) dùng
  cùng cơ chế auth, khác `audience`/scope token để giới hạn API được gọi.

## 3. Khuôn dạng response

Thành công:
```json
{ "data": { ... }, "meta": { "requestId": "..." } }
```

Danh sách (phân trang kiểu cursor, ưu tiên cho dữ liệu lớn/thay đổi liên tục):
```json
{ "data": [ ... ], "meta": { "nextCursor": "...", "hasMore": true } }
```

Lỗi (đồng nhất mọi module):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Mô tả lỗi cho người đọc",
    "details": [ { "field": "vatAmount", "issue": "must equal total - subtotal" } ]
  }
}
```

- `code` là chuỗi ổn định (client dựa vào để xử lý logic), `message` có thể đổi ngôn
  ngữ hiển thị.
- Trả đúng HTTP status: `400` lỗi input, `401` chưa auth, `403` không đủ quyền/sai
  data scope, `404` không tìm thấy hoặc không thuộc scope của user, `409` xung đột
  trạng thái (VD: đóng chuyến đã đóng), `422` vi phạm quy tắc nghiệp vụ.

## 4. Idempotency (bắt buộc cho luồng đồng bộ app tài xế)

- Mọi endpoint ghi dữ liệu được gọi từ app tài xế (ảnh, chi phí, cập nhật điểm dừng)
  **phải** nhận header `Idempotency-Key` (client sinh UUID khi tạo bản ghi local).
- Backend lưu `(idempotencyKey, endpoint) → kết quả xử lý` trong khoảng thời gian đủ
  dài (VD: 7 ngày); gọi lại cùng key trả về đúng kết quả trước đó, không tạo bản ghi
  trùng (ràng buộc 1, CLAUDE.md).
- Endpoint không có tác dụng phụ tài chính có thể bỏ qua yêu cầu này, nhưng nên áp
  dụng nhất quán cho mọi endpoint được gọi từ hàng đợi đồng bộ offline.

## 5. Job bất đồng bộ (AI, tích hợp ngoài)

- Endpoint kích hoạt xử lý AI hoặc tích hợp ngoài trả `202 Accepted` + `jobId` ngay,
  không block chờ kết quả (ràng buộc 2, CLAUDE.md).
- Client poll `GET /api/v1/jobs/{jobId}` hoặc nhận qua webhook/notification nội bộ để
  biết kết quả — không thiết kế theo hướng tài xế phải chờ AI trả kết quả lúc chụp ảnh.

## 6. Tích hợp bên thứ ba (GPS, VNPT hóa đơn, ERP, ngân hàng)

- Mọi lời gọi ra ngoài phải có `timeout` tường minh, `retry` có backoff, và
  `fallback`/trạng thái `PendingIntegration` rõ ràng khi bên thứ ba không phản hồi
  (ràng buộc 7, CLAUDE.md) — không để luồng nghiệp vụ chính bị treo vì bên ngoài lỗi.
- Log đầy đủ request/response (ẩn dữ liệu nhạy cảm) để phục vụ debug tích hợp.
