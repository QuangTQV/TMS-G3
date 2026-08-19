# Quy ước code

## 1. Chung

- TypeScript `strict: true` trên toàn bộ backend/web/portal. Không dùng `any` để né
  lỗi type — nếu type thực sự chưa rõ, khai báo `unknown` và narrow tường minh.
- Lint + format bắt buộc pass trước khi commit (ESLint + Prettier hoặc tương đương).
  Không tắt rule để né lỗi mà không có lý do ghi rõ trong code review.
- Đặt tên biến/hàm/entity bằng tiếng Anh, theo đúng bảng đối chiếu ở
  [glossary.md](./glossary.md) — không lẫn tiếng Việt không dấu vào code.

## 2. Backend (NestJS hoặc tương đương)

- Mỗi module nghiệp vụ = một Nest module riêng trong `apps/api/src/modules/<module>`,
  đúng theo 12 module ở CLAUDE.md mục 3 — xem cấu trúc đầy đủ trong
  [architecture.md](./architecture.md).
- Cấu trúc trong mỗi module: `controller` (HTTP), `service` (business logic),
  `repository`/`entity` (data access), `dto` (input/output validation). Business logic
  không nằm trong controller.
- Validate input bằng DTO + class-validator (hoặc tương đương) ở tầng controller,
  validate quy tắc nghiệp vụ (VD: check digit container, tổng tiền hóa đơn) ở tầng
  service — không trộn hai lớp.
- Mọi thay đổi entity liên quan tiền đi qua service có ghi audit log — xem
  [security-audit.md](./security-audit.md). Không cho phép service khác `save()` thẳng
  vào repository của entity tiền mà bỏ qua bước ghi audit.
- Giao tiếp giữa module qua service interface được export, không import thẳng
  entity/repository của module khác.

## 3. Frontend (Web nội bộ, Cổng khách hàng, Cổng nhà vận tải — React)

- Tổ chức theo domain/feature (khớp module backend), không tổ chức phẳng theo loại
  file (`components/`, `hooks/` chung chung cho toàn app).
- Gọi API qua lớp client dùng chung (typed, dựa trên `packages/shared-types`), không
  gọi `fetch` rải rác trong component.
- Không suy luận quyền hiển thị từ dữ liệu nghiệp vụ — dùng thông tin quyền trả về từ
  backend (permission/data scope của user hiện tại).

## 4. App tài xế

- Tuân thủ nghiêm [offline-sync.md](./offline-sync.md) cho mọi thao tác ghi dữ liệu.
- Tách rõ lớp lưu trữ local (hàng đợi đồng bộ) khỏi lớp gọi API — không gọi API trực
  tiếp từ màn hình cho các thao tác bắt buộc offline-first.

## 5. Testing

- Unit test cho business logic (đặc biệt: tính giá, validate container/hóa đơn, state
  machine của `Trip`/`ShipmentOrder`/`Invoice`).
- Integration test cho luồng xuyên module quan trọng (VD: tạo `Quote` → duyệt → sinh
  `ShipmentOrder`), và cho audit log (đảm bảo mọi thay đổi entity tiền đều sinh
  `AuditLog`).
- Test riêng cho idempotency: gọi lại cùng `Idempotency-Key` không tạo bản ghi trùng.

## 6. Git & review

- Nhánh tính năng theo `feature/<module>-<mô-tả-ngắn>`, commit message mô tả rõ thay
  đổi thuộc module nào.
- PR mô tả: chức năng đang làm thuộc module nào (1-12), có thuộc phạm vi R1 không
  (theo mục 6, CLAUDE.md) — nếu không chắc, hỏi lại trước khi mở PR thay vì tự ý làm.
- Review bắt buộc kiểm tra: có đúng module/thư mục không, có audit log nếu chạm tiền
  không, có tuân thủ offline-first nếu chạm app tài xế không.
