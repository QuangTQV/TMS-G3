# TMS G3 API — bản Python (FastAPI + SQLAlchemy)

Backend gốc (`apps/api`, NestJS + Prisma) vẫn là **nguồn sự thật**, và frontend
(`apps/web`) vẫn trỏ vào đó. Thư mục này là bản chuyển đổi song song sang Python,
chạy cùng lúc với NestJS cho tới khi có quyết định cắt hẳn frontend/production sang
đây — xem CLAUDE.md mục "Trạng thái triển khai hiện tại".

- Framework: **FastAPI**
- ORM: **SQLAlchemy 2.0** (models ánh xạ thủ công theo đúng tên bảng/cột Prisma đã
  tạo — xem `app/models.py`, đủ cả 40 bảng khớp `apps/api/prisma/schema.prisma`)
- Migration: **chưa dùng Alembic để tạo schema.** Schema DB vẫn do Prisma sở hữu
  (`apps/api/prisma/migrations`) — service Python chỉ đọc/ghi qua cùng một Postgres,
  không tự chạy migration riêng. Alembic sẽ được kích hoạt để quản lý schema khi một
  module chính thức cắt hẳn sang Python.

## Đã chuyển toàn bộ 9 module nghiệp vụ + kernel

| Module | Router |
|---|---|
| Kernel (auth, RBAC, audit log, idempotency) | `app/routers/auth.py`, `app/deps.py`, `app/audit.py`, `app/idempotency.py` |
| 2. Khách hàng | `app/routers/customers.py` |
| 3. Hợp đồng/Bảng giá/Báo giá | `app/routers/contracts.py`, `price_lists.py`, `quotes.py` |
| 4. Đơn vận chuyển | `app/routers/shipment_orders.py` |
| 5/6. Chuyến (điều phối + vận tải) | `app/routers/trips.py` |
| 7. Chứng từ & AI processing | `app/routers/document_types.py`, `document_evidences.py`, `ai_jobs.py` + `app/image_extraction.py`, `app/validators.py` |
| 8. Chi phí/tạm ứng/quyết toán | `app/routers/trip_cost.py` |
| 9. Đối soát/Hóa đơn/Công nợ | `app/routers/reconciliation.py`, `invoices.py`, `accounts_payable.py` |
| 10. Nguồn lực | `app/routers/vehicles.py`, `drivers.py`, `carriers.py` |

Tất cả đã test end-to-end bằng curl với đúng dữ liệu seed (`apps/api/prisma/seed.ts`)
qua toàn bộ luồng nghiệp vụ chính: Khách hàng → Báo giá → Đơn vận chuyển → Chuyến →
Chứng từ (+ AI) → Chi phí → Đối soát → Hóa đơn/Công nợ, bao gồm các ràng buộc trạng
thái (chỉ duyệt/hủy/khóa đúng lúc), audit log, RBAC theo permission, và phạm vi chi
nhánh (`assertBranchScope`).

## Vì sao verify được mật khẩu đã hash bởi NestJS

Cả hai backend cùng dùng **argon2id**. `npm argon2` mã hoá tham số theo thứ tự
`m=...,p=...,t=...`; `argon2-cffi` (Python) yêu cầu đúng thứ tự PHC chuẩn
`m=...,t=...,p=...`. `app/security.py#_normalize_phc_param_order` sắp lại thứ tự
field trước khi verify — không tính lại hash, chỉ đổi cách đọc chuỗi đã có. Nhờ vậy
user tạo bởi `apps/api/prisma/seed.ts` đăng nhập được ngay trên service này.

## Một điểm cần cẩn thận khi thêm code mới: Enum vừa gán vừa serialize trong cùng transaction

SQLAlchemy không tự chuyển một giá trị `str` thô (vd. lấy trực tiếp từ request body
đã qua Pydantic `Literal`) thành instance Enum khi bạn gán nó vào một cột kiểu
`Enum` — giá trị đó chỉ được "nâng cấp" thành đúng Enum sau khi đi qua một vòng
đọc/ghi CSDL thật (flush + refresh, hoặc lazy-load một quan hệ). Nếu code serialize
đối tượng đó ngay sau khi gán (trước `commit()`/`refresh()`), gọi `row.field.value`
sẽ crash với `AttributeError: 'str' object has no attribute 'value'`. Luôn bọc giá
trị bằng đúng class Enum khi gán, vd. `category=TripCostCategory(dto.category)` —
xem ví dụ đã sửa ở `document_types.py`, `trip_cost.py`.

## Chạy

Quản lý dependency bằng **uv** (không dùng `pip`/`requirements.txt`) — khai báo ở
`pyproject.toml`, khoá phiên bản ở `uv.lock` (commit vào git để mọi máy cài đúng y
hệt). Thêm/gỡ package qua `uv add <tên>` / `uv remove <tên>`, không tự sửa tay
`pyproject.toml` rồi quên chạy lock lại.

```bash
cd apps/api-py
uv sync                # đọc pyproject.toml + uv.lock, tự tạo .venv, cài đúng phiên bản đã khoá
cp .env.example .env   # sửa DATABASE_URL nếu Postgres không ở cổng 5455
uv run uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload
```

Yêu cầu Postgres đã có schema (đã chạy `npx prisma migrate deploy` và
`npm run prisma:seed` phía `apps/api` — xem README gốc) vì service này không tự tạo
bảng. `uv run ...` tự dùng đúng `.venv` của thư mục này mà không cần `source
.venv/bin/activate` thủ công; `uv sync` không phụ thuộc gói hệ điều hành
`python3-venv` (hữu ích khi máy không có sudo).

### Chạy bằng Docker (thay cho `uv run` trực tiếp)

```bash
cd /path/to/TMS-G3   # thư mục gốc, nơi có docker-compose.yml
docker compose up -d --build api-py   # tự kéo theo postgres nếu chưa chạy
```

Container build bằng `apps/api-py/Dockerfile` (base `ghcr.io/astral-sh/uv`, cài đúng
`uv.lock`), nối vào cùng network Docker với `postgres` (hostname `postgres`, không
phải `localhost`) — `DATABASE_URL` cho container đã khai báo sẵn trong
`docker-compose.yml`, không đọc từ `.env` của thư mục này. Vẫn phải chạy
`npx prisma migrate deploy`/`npm run prisma:seed` từ `apps/api` **trên host** trước
(container không tự tạo bảng). Sửa code trong `app/` cần build lại image
(`docker compose up -d --build api-py`) — không có hot-reload như `uv run --reload`,
nên khi đang code nhanh, `uv run` (chạy trực tiếp trên host) vẫn tiện hơn; Docker phù
hợp khi muốn môi trường chạy đóng gói sẵn, không phụ thuộc máy đã cài Python/uv chưa.

```bash
curl -s http://localhost:8011/health
curl -s -X POST http://localhost:8011/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@g3.local","password":"ChangeMe123!"}'
```

## Quy ước khi sửa/mở rộng thêm

- Giữ đúng contract JSON hiện có của `apps/api` (khuôn `{data,meta}` /
  `{error:{code,message,details}}`, field camelCase, Decimal serialize thành string,
  DateTime serialize thành ISO có hậu tố `Z`) — xem `app/response.py`,
  `app/errors.py`, `app/serializers.py`. Đây là hợp đồng để frontend không phải sửa
  gì nếu một module cắt sang Python trong tương lai.
- Mọi endpoint ghi dữ liệu liên quan tiền vẫn phải ghi `AuditLog` qua
  `app/audit.py#record_audit_log` — không bỏ qua vì thấy "chỉ là bản test".
  RBAC dùng `app/deps.py#require_permission(...)`, phạm vi chi nhánh dùng
  `assert_branch_scope(...)` — cùng nguyên tắc với `PermissionsGuard`/
  `assertBranchScope` bên NestJS, không tự chế cơ chế phân quyền riêng.
- Trước khi trỏ frontend hoặc production sang endpoint Python của một module, và
  trước khi để Alembic quản lý các bảng của đúng module đó (cần tách schema
  ownership rõ ràng, chưa làm ở bước này) — đó là quyết định của người phụ trách dự
  án, không tự ý chuyển.
