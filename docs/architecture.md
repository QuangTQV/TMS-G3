# Kiến trúc hệ thống

> Trạng thái: **đề xuất**, kế thừa từ [CLAUDE.md](../CLAUDE.md) mục 4. Chưa phải quyết
> định cuối cùng — xác nhận với team trước khi khởi tạo project thật hoặc chọn nhà
> cung cấp hạ tầng.

## 1. Bức tranh tổng thể

```
                        ┌───────────────────────────────────────┐
                        │              Backend / API              │
                        │   (Node.js + TypeScript, NestJS)         │
                        │                                          │
                        │  12 domain module (mục 3, CLAUDE.md)     │
                        │  + hàng đợi xử lý AI bất đồng bộ         │
                        └───────────────┬───────────────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 │                      │                      │
        ┌────────▼───────┐   ┌─────────▼────────┐   ┌─────────▼────────┐
        │  PostgreSQL     │   │  Hàng đợi job     │   │  Tích hợp ngoài   │
        │  (dữ liệu chính)│   │  (AI, đồng bộ,    │   │  GPS, VNPT hóa    │
        │                 │   │   thông báo)      │   │  đơn, ERP, ngân   │
        │                 │   │                   │   │  hàng, LLM API    │
        └─────────────────┘   └───────────────────┘   └───────────────────┘

  ── Client / kênh sử dụng (tách biệt khỏi logic nghiệp vụ) ──────────────
  Web nội bộ (React+TS) │ App tài xế (Flutter/RN, offline-first)
  Cổng khách hàng │ Cổng nhà vận tải │ Ứng dụng thử nghiệm AI
```

Điểm mấu chốt: **kênh sử dụng không phải là module**. Toàn bộ logic nghiệp vụ (giá,
điều phối, đối soát, phân quyền...) sống ở backend; client chỉ gọi API. Không viết
business logic riêng trong app tài xế hay web ngoài phần validate UI tối thiểu.

Danh sách đầy đủ 6 kênh, 12 vai trò nghiệp vụ và ma trận vai trò↔module xem
[roles-channels.md](./roles-channels.md). Hai điểm cần lưu ý khi dựng hạ tầng:

- **Ứng dụng kiểm thử AI** là kênh thứ 6, chỉ phục vụ đội AI/kiểm thử mô hình (PoC) —
  **không deploy chung hạ tầng với các ứng dụng production**, không có quyền truy cập
  dữ liệu khách hàng thật trừ khi có quy trình ẩn danh hóa riêng.
- **Cổng nhà vận tải** có 2 mức phạm vi tách biệt (bản tối giản trong phạm vi gần R1
  vs. bản đầy đủ đấu thầu/đối giá thuộc Later) — xem chi tiết mục 3 của
  [roles-channels.md](./roles-channels.md) trước khi lên kế hoạch code phần này.

## 2. Stack đề xuất

| Lớp | Lựa chọn đề xuất | Lý do |
|---|---|---|
| Backend | Node.js + TypeScript (NestJS) | Cấu trúc module rõ ràng, khớp với cách chia 12 domain module; team TS full-stack |
| DB chính | PostgreSQL | Quan hệ chặt, transaction mạnh — cần cho đối soát/công nợ/audit log |
| Hàng đợi job | Redis + BullMQ (hoặc tương đương) | Xử lý AI bất đồng bộ (mục 4, 5 CLAUDE.md), retry/backoff cho tích hợp ngoài |
| Web nội bộ | React + TypeScript | Theo CLAUDE.md mục 4 |
| App tài xế | Flutter hoặc React Native | Bắt buộc offline-first — xem [offline-sync.md](./offline-sync.md) |
| Cổng khách hàng / nhà vận tải | React + TypeScript (web) | Cùng công nghệ với web nội bộ để tái dùng component |
| AI/LLM | Gọi LLM API đa phương thức từ backend, không tự host, không chạy on-device | Mục 4, 5 CLAUDE.md — xem [ai-processing.md](./ai-processing.md) |

Backend Java/Kotlin (Spring Boot) là phương án thay thế được CLAUDE.md nêu — nếu team
chọn hướng này, các nguyên tắc chia module/domain trong tài liệu này vẫn áp dụng
nguyên vẹn, chỉ khác cú pháp triển khai.

## 3. Cấu trúc thư mục đề xuất (monorepo)

```
tms-g3/
├── apps/
│   ├── api/                 # Backend NestJS — nguồn sự thật của business logic
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── work-dashboard/          # Module 1
│   │       │   ├── customer/                # Module 2
│   │       │   ├── contract-pricing-quote/  # Module 3
│   │       │   ├── shipment-order/          # Module 4
│   │       │   ├── planning-dispatch/       # Module 5
│   │       │   ├── trip-tracking/           # Module 6
│   │       │   ├── document-evidence/       # Module 7 (+ AI)
│   │       │   ├── cost-advance-settlement/ # Module 8
│   │       │   ├── reconciliation-billing/  # Module 9
│   │       │   ├── resource-carrier/        # Module 10
│   │       │   ├── reporting-analytics/     # Module 11
│   │       │   └── admin-integration/       # Module 12 (auth, RBAC, audit, integration)
│   │       └── shared/                      # kernel dùng chung: audit log, RBAC guard, idempotency
│   ├── web/                 # Web nội bộ (React)
│   ├── driver-app/          # App tài xế (Flutter/RN, offline-first)
│   ├── customer-portal/     # Cổng khách hàng
│   └── carrier-portal/      # Cổng nhà vận tải (nếu vào scope — xem open-questions.md)
├── packages/
│   ├── shared-types/        # Type/DTO dùng chung giữa backend và các client TS
│   └── domain-constants/    # Enum trạng thái, mã module, quy tắc validate dùng chung (VD: ISO 6346)
└── docs/
```

Nguyên tắc: thư mục `modules/` trong `apps/api` **bám theo 12 module ở CLAUDE.md mục
3**, không bám theo màn hình hay client. Module 13 (Kế toán tổng hợp) không tạo thư
mục cho tới khi có xác nhận (xem [open-questions.md](./open-questions.md)).

## 4. Ranh giới giữa các module

- Mỗi module là một Nest module riêng, expose service qua interface rõ ràng; module
  khác không được query thẳng vào bảng của module khác — phải qua service/API nội bộ.
- Luồng nghiệp vụ chính (Khách hàng → Báo giá → Đơn → Kế hoạch → Chuyến → Chứng từ →
  Chi phí → Đối soát → Hóa đơn) là chuỗi tham chiếu ID xuyên module, không phải
  bảng dùng chung — xem traceability trong [data-model.md](./data-model.md).
- Module 12 (Quản trị hệ thống) cung cấp kernel dùng chung: xác thực, RBAC, audit log,
  danh mục dùng chung. Mọi module khác **dùng lại** kernel này, không tự implement
  phân quyền/audit riêng (ràng buộc 5 trong CLAUDE.md).

## 5. Môi trường & triển khai (khung, chưa chi tiết hạ tầng)

- Tối thiểu 2 môi trường: `staging`, `production`. Thêm `dev` cục bộ qua docker-compose
  (Postgres + Redis).
- Migration DB dùng công cụ có versioning (VD: Prisma Migrate hoặc TypeORM migration) —
  không sửa schema bằng tay trên production.
- CI tối thiểu: lint, type-check, test, build — chạy trước khi merge vào nhánh chính.
