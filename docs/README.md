# Tài liệu kỹ thuật TMS G3

Thư mục này chứa các tài liệu nền tảng để bắt đầu code hệ thống TMS, cụ thể hoá các
nguyên tắc đã nêu trong [CLAUDE.md](../CLAUDE.md) (nguồn gốc:
`TMS_Danh_muc_module_tinh_nang.xlsx`, đợt v4). Đọc CLAUDE.md trước — đây là nguồn sự
thật về phạm vi nghiệp vụ, các ràng buộc bắt buộc, và các điểm chưa chốt.

## Danh mục tài liệu

| Tài liệu | Nội dung | Đọc khi nào |
|---|---|---|
| [architecture.md](./architecture.md) | Kiến trúc tổng thể, stack đề xuất, cấu trúc thư mục/monorepo | Trước khi khởi tạo project, khi quyết định đặt code ở đâu |
| [data-model.md](./data-model.md) | Thực thể nghiệp vụ cốt lõi, quan hệ, luồng nghiệp vụ 10 bước, ranh giới sở hữu dữ liệu | Trước khi thiết kế schema DB hoặc DTO |
| [roles-channels.md](./roles-channels.md) | 12 vai trò nghiệp vụ, 6 kênh sử dụng, phạm vi 2 mức của cổng nhà vận tải | Khi thiết kế RBAC hoặc quyết định client nào gọi API nào |
| [api-conventions.md](./api-conventions.md) | Quy ước REST API, auth, lỗi, phân trang, idempotency | Trước khi viết endpoint mới |
| [offline-sync.md](./offline-sync.md) | Cơ chế offline-first cho app tài xế | Khi code bất kỳ tính năng nào chạm app tài xế |
| [ai-processing.md](./ai-processing.md) | Luồng xử lý AI (module 7): OCR hóa đơn, kiểm tra ảnh | Khi code module 7 hoặc hàng đợi xử lý AI |
| [security-audit.md](./security-audit.md) | Phân quyền (RBAC + phạm vi dữ liệu), audit log | Khi code logic liên quan tiền hoặc phân quyền |
| [coding-standards.md](./coding-standards.md) | Quy ước code backend/frontend, testing, review | Trước khi mở PR đầu tiên |
| [glossary.md](./glossary.md) | Đối chiếu thuật ngữ nghiệp vụ VN ↔ tên field/entity tiếng Anh trong code | Khi đặt tên entity/field/API |
| [open-questions.md](./open-questions.md) | Theo dõi các điểm chưa chốt, không tự giả định | Trước khi implement phần chạm tới điểm chưa chốt |

## Nguyên tắc chung khi dùng bộ tài liệu này

- Các tài liệu này **cụ thể hoá** CLAUDE.md, không thay thế nó. Khi có mâu thuẫn,
  CLAUDE.md là nguồn ưu tiên.
- Phần kiến trúc/stack trong `architecture.md` là **đề xuất**, kế thừa từ CLAUDE.md
  mục 4 — chưa phải quyết định cuối cùng, cần xác nhận với team trước khi khởi tạo
  project thật.
- Danh sách 250+ chức năng chi tiết cùng nhãn R1/R2/Later/TBD và Bắt buộc/Nên có/Có
  thể có nằm trong [TMS_Danh_muc_module_tinh_nang.xlsx](./TMS_Danh_muc_module_tinh_nang.xlsx)
  (đã có trong `docs/`, do doanh nghiệp gửi) — các tài liệu ở đây mô tả theo
  module/nhóm chức năng, không liệt kê lại toàn bộ danh sách. Khi cần biết một chức
  năng cụ thể có thuộc R1 hay không, tra sheet `03_Chi_tiet_chuc_nang` trong file gốc.
  Các tài liệu trong `docs/` (đặc biệt `data-model.md`, `roles-channels.md`,
  `ai-processing.md`, `open-questions.md`) đã được đối chiếu và tinh chỉnh theo đúng
  nội dung file này — coi các sheet `07_Luong_nghiep_vu`, `03_Chi_tiet_chuc_nang`, và
  `09_Noi_dung_can_chot` (hiện còn trống, sẽ do G3 điền) là nguồn có thẩm quyền cao
  nhất khi có mâu thuẫn với suy luận thêm trong tài liệu này.
