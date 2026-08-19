# TMS G3

Hệ thống quản lý vận tải (Transportation Management System) nội bộ cho công ty G3.
Monorepo gồm backend API (NestJS + Prisma + PostgreSQL) và web nội bộ (React +
Vite). Bối cảnh nghiệp vụ, phạm vi và các ràng buộc kỹ thuật bắt buộc nằm ở
[CLAUDE.md](./CLAUDE.md) — đọc trước khi chỉnh sửa code, đặc biệt mục "Trạng thái
triển khai hiện tại" để biết module nào đã xong, module nào chưa. Tài liệu kỹ thuật
chi tiết hơn theo từng chủ đề nằm ở [docs/](./docs/README.md).

## Cấu trúc thư mục

```
TMS-G3/
├── apps/
│   ├── api/    # Backend NestJS — nguồn sự thật của business logic (cổng 3011)
│   └── web/    # Web nội bộ React + Vite (cổng 5173)
├── docs/       # Tài liệu nghiệp vụ/kỹ thuật (data model, API convention, ...)
├── docker-compose.yml   # PostgreSQL cục bộ (cổng 5455)
└── CLAUDE.md   # Nguồn sự thật về phạm vi nghiệp vụ + trạng thái triển khai
```

## Yêu cầu môi trường

- Node.js 20+ và npm
- Docker (chạy PostgreSQL cục bộ) — hoặc tự trỏ `DATABASE_URL` sang một PostgreSQL có sẵn

## Chạy lần đầu

**1. Cài dependency cho toàn bộ workspace** (từ thư mục gốc):

```bash
npm install
```

**2. Khởi động PostgreSQL:**

```bash
docker compose up -d
```

**3. Cấu hình và khởi tạo database cho API** (toàn bộ bước này chạy trong
`apps/api` — nhớ `cd` vào đó trước, các lệnh dưới không tự lặp lại `cd`):

```bash
cd apps/api
cp .env.example .env
```

`.env.example` đã khớp sẵn với `docker-compose.yml` (`DATABASE_URL` trỏ về
`localhost:5455`). Sửa lại nếu bạn dùng PostgreSQL khác, hoặc muốn đổi `PORT`
(mặc định `3011`).

```bash
npx prisma migrate deploy   # áp toàn bộ migration vào DB — vẫn đang trong apps/api
npm run prisma:seed         # tạo chi nhánh mẫu + role ADMIN + user admin@g3.local
```

Seed tạo sẵn tài khoản đăng nhập:

```
email:    admin@g3.local
password: ChangeMe123!
```

**4. Chạy API (giữ terminal này chạy):**

```bash
npm run start:dev
```

API chạy ở `http://localhost:3011` (hoặc `PORT` bạn đặt trong `.env`), tự
restart khi sửa code.

**5. Cấu hình và chạy web nội bộ (terminal khác):**

```bash
cd apps/web
```

Tạo/sửa `.env.development`, trỏ đúng nơi API đang chạy:

```
VITE_API_BASE_URL=http://localhost:3011
```

> Nếu chạy trên máy chủ remote/VPS và mở từ trình duyệt trên máy khác, đổi giá
> trị này sang địa chỉ IP/tên miền thật của máy chủ (không phải `localhost`), và
> đảm bảo firewall cho phép cổng `5173`/`3011` (xem mục Troubleshooting bên dưới).

```bash
npm run dev
```

Web chạy ở `http://localhost:5173`. Mở trình duyệt, đăng nhập bằng tài khoản seed
ở bước 3.

## Chạy lại (sau lần đầu)

```bash
docker compose up -d          # nếu Postgres chưa chạy
cd apps/api && npm run start:dev     # terminal 1
cd apps/web && npm run dev           # terminal 2
```

## Lệnh hữu ích

Từ thư mục gốc (dùng npm workspaces):

```bash
npm run api:dev              # = apps/api: npm run start:dev
npm run api:build            # = apps/api: npm run build
npm run api:test             # = apps/api: npm run test
npm run api:prisma:migrate   # = apps/api: npx prisma migrate dev (tạo migration mới)
npm run api:prisma:generate  # = apps/api: npx prisma generate
```

Trong `apps/api`:

```bash
npm run lint            # eslint --fix
npm run build           # type-check + build ra dist/
npm run test            # unit test (jest)
npm run prisma:studio   # mở Prisma Studio để xem/sửa dữ liệu trực quan
```

Trong `apps/web`:

```bash
npm run lint     # oxlint
npm run build    # type-check + build production ra dist/
npm run preview  # chạy thử bản build production
```

## Kiểm tra nhanh mọi thứ đã chạy đúng

```bash
curl -s http://localhost:3011/v1/customers -H "Authorization: Bearer x"
# mong đợi: {"error":{"code":"UNAUTHENTICATED", ...}} — nghĩa là API đã lên, chỉ là token giả

curl -s -X POST http://localhost:3011/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@g3.local","password":"ChangeMe123!"}'
# mong đợi: {"data":{"accessToken":"...","user":{...}}}
```

## Troubleshooting

- **`localhost:5173` không vào được dù server đã chạy (log báo "ready")**: kiểm
  tra `vite.config.ts` có `server.host: '0.0.0.0'` chưa (bind cả IPv4 lẫn
  loopback, không chỉ `::1`). Nếu bạn đang ở máy khác với máy chạy server (SSH,
  VPS, remote container), phải dùng địa chỉ của máy chủ thay vì `localhost`.
- **Vào được bằng IP máy chủ nhưng trình duyệt không gọi được API (network
  error trong console)**: `apps/web/.env.development` đang trỏ
  `VITE_API_BASE_URL` về `localhost` — với máy khác, `localhost` là chính máy
  đó, không phải máy chủ. Đổi sang IP/tên miền thật của máy chủ rồi khởi động
  lại `npm run dev` (Vite tự restart khi `.env.development` đổi).
- **Không vào được dù đã đúng IP**: máy chủ có thể đang bật firewall (`ufw`).
  Mở cổng cần dùng:
  ```bash
  sudo ufw allow 5173/tcp
  sudo ufw allow 3011/tcp
  ```
  Nếu máy chủ là VPS/cloud, có thể còn một lớp firewall khác ở phía nhà cung
  cấp (security group) cần mở riêng qua control panel.
- **Lỗi kết nối database khi chạy `prisma migrate`**: kiểm tra
  `docker compose ps` xem container Postgres đã `Up` chưa, và `DATABASE_URL`
  trong `apps/api/.env` có khớp cổng trong `docker-compose.yml` (mặc định
  `5455`) không.
- **Đăng nhập báo sai quyền (403) sau khi thêm permission mới vào
  `prisma/seed.ts`**: chạy lại `npm run prisma:seed`, sau đó đăng nhập lại để
  lấy JWT mới — quyền được đóng gói trong token lúc đăng nhập, sửa seed không
  tự cập nhật token cũ.
