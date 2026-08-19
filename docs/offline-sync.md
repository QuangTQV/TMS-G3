# Offline-first cho app tài xế

> Ràng buộc bắt buộc (CLAUDE.md mục 5.1): app tài xế phải hoạt động được khi mất mạng.
> Điểm CHƯA CHỐT: hỗ trợ offline toàn bộ hay chỉ một phần thao tác — xem
> [open-questions.md](./open-questions.md). Tài liệu này áp dụng chắc chắn cho các thao
> tác nêu ở mục 1: chụp ảnh chứng từ, khai chi phí, cập nhật điểm dừng.
>
> **Quan trọng**: theo sheet `05_Ung_dung_tai_xe` của file gốc, **toàn bộ 33 chức năng**
> thuộc app tài xế (không chỉ 3 nhóm trên) đang có cột "Cần ngoại tuyến" = **"Cần xác
> nhận"** — bao gồm cả thông báo đẩy, chấp nhận/từ chối chuyến, chữ ký/OTP/QR, xem kết
> quả AI kiểm tra ảnh, tạm ứng/hoàn ứng, đăng nhập/chọn vai trò. Khi implement từng
> chức năng trong danh sách đó, xác nhận cụ thể có bắt buộc offline hay không thay vì
> mặc định áp dụng nguyên tắc ở tài liệu này cho toàn bộ ứng dụng.

## 1. Nguyên tắc

1. Ghi **local trước**, đồng bộ **sau**. Không thao tác nào bắt buộc phải có mạng mới
   thực hiện được ở các luồng trên.
2. Mỗi thao tác local sinh một `Idempotency-Key` (UUID) tại thời điểm tạo — dùng lại
   đúng key này khi gửi lên server, kể cả khi gửi lại nhiều lần.
3. AI không xử lý on-device và không chặn thao tác của tài xế chờ mạng
   (ràng buộc 2, CLAUDE.md) — xử lý AI chỉ bắt đầu sau khi server nhận được ảnh.

## 2. Cấu trúc hàng đợi đồng bộ (client)

```
LocalRecord {
  id: uuid                # = idempotencyKey, sinh trên client
  type: "PHOTO" | "COST_ENTRY" | "STOP_UPDATE"
  payload: {...}
  createdAtLocal: ISO8601
  syncStatus: "PENDING" | "SYNCING" | "SYNCED" | "FAILED"
  retryCount: number
  lastError?: string
}
```

- Lưu trong DB local trên thiết bị (VD: SQLite/Hive tuỳ stack app tài xế), không lưu
  trong memory/state tạm — mất app không được mất dữ liệu chưa đồng bộ.
- File ảnh lưu trên local storage của thiết bị, `LocalRecord` chỉ giữ path/reference,
  không nhúng ảnh base64 vào bản ghi.

## 3. Vòng đồng bộ

1. Khi có mạng (network listener), lấy các `LocalRecord` có `syncStatus = PENDING`
   hoặc `FAILED` (chưa vượt ngưỡng retry), gửi tuần tự hoặc theo lô nhỏ lên server kèm
   header `Idempotency-Key: {record.id}`.
2. Server xử lý idempotent (xem [api-conventions.md](./api-conventions.md) mục 4):
   - Lần đầu thấy key → xử lý và lưu kết quả.
   - Thấy lại key đã xử lý → trả kết quả cũ, không tạo bản ghi trùng.
3. Server trả `200/201` → client set `syncStatus = SYNCED`, có thể xoá file local sau
   một khoảng thời gian giữ an toàn (VD: 3 ngày) để tránh mất dữ liệu nếu response bị
   rớt giữa đường.
4. Server lỗi mạng/timeout → giữ `PENDING`, tăng `retryCount`, backoff (VD: exponential,
   tối đa một mức trần) rồi thử lại ở vòng đồng bộ tiếp theo.
5. Server trả lỗi nghiệp vụ rõ ràng (`4xx` không phải do trùng key) → set `FAILED`,
   hiển thị cho tài xế để xử lý thủ công (VD: chuyến đã bị hủy trên server).

## 4. Xử lý xung đột (conflict)

- Ưu tiên **server là nguồn sự thật cuối cùng** cho trạng thái nghiệp vụ (VD: trạng
  thái `Trip`, `ShipmentOrder`). Nếu tài xế cập nhật điểm dừng cho một chuyến đã bị
  hủy/thay đổi trên server trong lúc offline, server trả lỗi nghiệp vụ rõ ràng kèm
  trạng thái mới nhất, client hiển thị cho tài xế thay vì âm thầm ghi đè.
- Dữ liệu tài xế tạo mới (ảnh, chi phí) hầu như không xung đột (append-only) — rủi ro
  xung đột chính nằm ở cập nhật trạng thái chuyến/điểm dừng.

## 5. Những gì cần cache sẵn local để hoạt động offline

- Thông tin chuyến đang được giao (điểm dừng, hàng hóa, chứng từ yêu cầu) tải về ngay
  khi có mạng và tài xế nhận chuyến, không chờ tới lúc cần mới gọi API.
- Danh mục dùng chung cần cho form (loại chứng từ, loại chi phí) — đồng bộ định kỳ,
  có fallback dùng bản cache cũ nếu không tải được bản mới.

## 6. Việc KHÔNG làm

- Không tự implement AI/OCR trên thiết bị để "xử lý nhanh khi offline" — vi phạm ràng
  buộc 2 (CLAUDE.md). Nếu cần phản hồi tức thời cho tài xế (VD: ảnh có bị mờ không),
  dùng kiểm tra kỹ thuật đơn giản trên thiết bị (kích thước, độ sáng) — không phải AI.
- Không dùng timestamp client để quyết định thứ tự ghi đè dữ liệu nghiệp vụ quan trọng
  (đồng hồ thiết bị không đáng tin) — dùng logic nghiệp vụ + idempotency key.
