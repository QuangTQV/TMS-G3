# Xử lý AI (Module 7 — chứng từ và bằng chứng giao nhận)

> Phạm vi R1 hiện tại: chỉ 12 chức năng AI trong module 7 (kiểm tra ảnh + đọc hóa đơn).
> Các AI "nâng cao" khác (dự báo ETA, phát hiện gian lận, xếp hạng nhà vận tải, tìm
> sự cố tương tự) thuộc Later — không code trước khi có yêu cầu rõ (mục 6, CLAUDE.md).

## 1. Nguyên tắc bắt buộc

1. **Chạy ở server, không on-device.** Client không gọi thẳng LLM API.
2. **Chạy bất đồng bộ, sau khi ảnh đã đồng bộ lên server** — không thiết kế theo hướng
   tài xế chờ AI trả kết quả ngay lúc chụp ảnh khi không có mạng (ràng buộc 2).
3. **Không tin tuyệt đối kết quả AI/OCR** — luôn có lớp validate bằng code thường sau
   khi model trả kết quả (ràng buộc 3).

## 2. Luồng xử lý

```
Ảnh/hóa đơn đồng bộ lên server
        │
        ▼
Tạo AIProcessingJob (status = QUEUED)  ── ghi vào hàng đợi (Redis/BullMQ)
        │
        ▼
Worker lấy job → gọi LLM API (đa phương thức: ảnh + text)
        │
        ▼
Nhận kết quả thô từ LLM → lưu AIExtractionResult (raw)
        │
        ▼
Lớp VALIDATE bằng code thường (bắt buộc, xem mục 3)
        │
        ├─ Hợp lệ ──▶ status = VERIFIED, gắn vào DocumentEvidence/Cargo/...
        └─ Không hợp lệ / nghi ngờ ──▶ status = NEEDS_REVIEW, đẩy vào hàng chờ
           duyệt thủ công cho nhân viên vận hành (không tự động chấp nhận)
```

- `AIProcessingJob` có `retryCount`, timeout riêng cho lời gọi LLM (ràng buộc 7 —
  không giả định LLM API luôn khả dụng).
- Khi LLM API lỗi/timeout vượt số lần retry → job chuyển `FAILED`, tạo task cho nhân
  viên xử lý thủ công, không để chứng từ bị kẹt vô thời hạn.

## 3. Danh sách chính xác 12 chức năng AI thuộc R1 (nguồn: sheet `03_Chi_tiet_chuc_nang`, cột `Có AI = Có`)

### Nhóm A — AI kiểm tra xe, container và seal (phân hệ 27, module 7)

| # | Chức năng AI | Validate bằng code sau khi AI trả kết quả |
|---|---|---|
| 1 | Kiểm tra ảnh mờ, tối, chói, thiếu góc hoặc bị che | Ngưỡng kỹ thuật (độ phân giải, độ sáng) kiểm tra lại độc lập với điểm tin cậy AI trả về |
| 2 | Kiểm tra ảnh đúng loại phương tiện/container/bằng chứng yêu cầu | Đối chiếu với `RequiredDocumentType` đã cấu hình theo khách hàng/loại chuyến — danh mục bắt buộc do hệ thống quản lý, AI chỉ hỗ trợ phân loại, không tự quyết loại nào là bắt buộc |
| 3 | Kết quả đạt/cần kiểm tra/chụp lại theo độ tin cậy | Ngưỡng độ tin cậy (confidence threshold) cấu hình được — dưới ngưỡng bắt buộc `NEEDS_REVIEW`, không tự động "đạt" |
| 4 | Nhận diện biển số và đối chiếu xe được phân công | So khớp chuỗi với `Vehicle.plateNumber` của xe đã gán cho chuyến (module 10) — lệch thì cảnh báo, không tự sửa hồ sơ chuyến |
| 5 | Nhận diện số container và kiểm tra ISO 6346/chữ số kiểm tra | Check digit ISO 6346 chạy độc lập bằng code thường, không dựa vào AI tự báo "hợp lệ" |
| 6 | Đọc seal, kích thước/loại, tổng trọng lượng tối đa, trọng lượng vỏ, tải trọng và dung tích khi ảnh đủ dữ liệu | Đối chiếu khoảng giá trị hợp lý theo `ContainerType` trong danh mục (module 12) — giá trị ngoài khoảng hợp lý → `NEEDS_REVIEW` |
| 7 | Đối chiếu container/seal với chuyến | So khớp với `Container`/`Seal` đã gán cho `Trip` — lệch thì chặn xác nhận nhận/trả, không tự động ghi đè |

### Nhóm B — AI đọc hóa đơn và tạo phiếu chi phí nháp (phân hệ 28, module 7)

| # | Chức năng AI | Validate bằng code sau khi AI trả kết quả |
|---|---|---|
| 8 | Phát hiện trùng tệp/số hóa đơn | So khớp hash tệp + `(issuer, invoiceNumber, invoiceDate)` trong DB, không chỉ dựa vào AI báo trùng |
| 9 | Phân loại hóa đơn và kiểm tra chất lượng ảnh | Cùng cơ chế ngưỡng kỹ thuật như nhóm A mục 1 |
| 10 | Đọc QR/link, tải hóa đơn và gắn với chi phí | Kiểm tra định dạng QR/link hợp lệ trước khi tải, timeout + retry khi tải lỗi (ràng buộc 7) |
| 11 | Đọc nhà phát hành, MST, số/ngày hóa đơn, trước thuế, VAT và tổng tiền | `total = subtotal + vatAmount` (bắt buộc, ràng buộc 3); định dạng MST hợp lệ; ngày hóa đơn không ở tương lai |
| 12 | Gợi ý chuyến/chi phí liên quan và chỉ ra chênh lệch (phân hệ "Kiểm tra, phiên bản, khóa và chia sẻ") | So sánh số tiền AI đọc được với số tiền chi phí tài xế đã khai báo ở module 8 — chỉ ra chênh lệch, không tự động sửa phiếu chi phí |

Nếu validate thất bại ở bất kỳ chức năng nào trên → không tự sửa dữ liệu, đánh dấu
`NEEDS_REVIEW` kèm lý do cụ thể để người duyệt biết chỗ sai. Lưu cả kết quả gốc từ AI
và kết quả sau hiệu chỉnh của người dùng — khớp với chức năng "Lưu kết quả gốc, độ tin
cậy, người sửa và kết quả cuối" và "Nhật ký kiểm toán AI" (module 12).

## 3b. Bàn giao dữ liệu sang module 8 (Chi phí)

Module 7 sở hữu toàn bộ xử lý AI/OCR; module 8 (Chi phí, tạm ứng và quyết toán chuyến)
**chỉ tiêu thụ** kết quả đã trích xuất, theo đúng 2 chức năng đã khai trong sheet gốc:

- "Nhận dữ liệu hóa đơn do module Chứng từ và bằng chứng giao nhận trích xuất để tạo
  phiếu chi phí nháp" — module 8 tạo `TripCostActual` ở trạng thái nháp từ
  `AIExtractionResult`, không tự OCR.
- "Nhận kết quả OCR/kiểm tra trùng từ module Chứng từ và bằng chứng giao nhận và so
  sánh với số tiền chi phí khai báo" — module 8 chạy so sánh chéo số tiền AI đọc được
  với số tiền tài xế khai, đánh dấu chênh lệch cho kế toán xử lý, không tự động sửa.

Không implement lại logic OCR/gọi LLM trong module 8 — mọi lời gọi AI đi qua module 7.

## 3c. Không thuộc phạm vi R1 (Later — không code)

Theo sheet gốc, các chức năng sau ở module 7 gắn nhãn **Tương lai/Later**, không nằm
trong 12 chức năng AI ở trên: "AI nhận diện hàng hóa, hư hỏng và gian lận nâng cao" và
"OCR toàn bộ B/L, phiếu đóng gói, hải quan và chứng từ hậu cần phức tạp". Không mở
rộng phạm vi AI sang các nghiệp vụ này khi chưa có yêu cầu rõ.

## 4. Chi phí & giám sát

- Mỗi `AIProcessingJob` ghi lại: loại request, số token/ảnh xử lý, chi phí ước tính
  (nếu API cung cấp), thời gian xử lý — phục vụ theo dõi chi phí vận hành LLM hàng
  tháng (điểm CHƯA CHỐT trong [open-questions.md](./open-questions.md), cần dữ liệu
  này để ước tính khi có số liệu thực tế).
- Cân nhắc giới hạn (rate limit/quota) theo chi nhánh hoặc theo ngày ngay từ thiết kế
  hàng đợi, để có chỗ chặn khi cần, dù ngưỡng cụ thể chưa xác định.

## 5. Bảo mật dữ liệu gửi ra ngoài

- Ảnh/hóa đơn gửi tới LLM API bên thứ ba có thể chứa MST, thông tin khách hàng — chính
  sách bảo mật cụ thể (có che/ẩn field nào không, nhà cung cấp LLM nào được duyệt)
  **chưa chốt** (xem [open-questions.md](./open-questions.md)). Trước khi implement
  luồng gọi LLM thật với dữ liệu production, xác nhận lại chính sách này thay vì tự
  quyết định.
