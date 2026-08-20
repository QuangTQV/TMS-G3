# CLAUDE.md — Dự án TMS G3

Tài liệu này cung cấp bối cảnh nghiệp vụ và kỹ thuật cho Claude Code khi làm việc trên
repo này. Nguồn gốc: `TMS_Danh_muc_module_tinh_nang.xlsx` (bản đặc tả phạm vi trước
báo giá, đợt v4).

## 1. Dự án là gì

TMS (Transportation Management System) là **hệ thống nội bộ của công ty G3**, một
công ty vận tải/logistics — KHÔNG phải sàn kết nối mở kiểu Grab. Người dùng chỉ gồm:
nhân viên G3, tài xế thuộc G3 hoặc thuộc nhà vận tải đối tác đã ký hợp tác, khách hàng
doanh nghiệp B2B của G3, và các nhà vận tải thuê ngoài.

Luồng nghiệp vụ chính (đây là xương sống toàn hệ thống, mọi module đều phục vụ luồng
này):

```
Khách hàng → Báo giá → Đơn vận chuyển → Kế hoạch/Điều phối → Chuyến vận tải
  → Chứng từ & bằng chứng giao nhận → Chi phí chuyến → Đối soát → Hóa đơn & công nợ
```

Quy mô: ~250 chức năng trên 12 module nghiệp vụ (+ 1 module "Kế toán tổng hợp" đang
chờ quyết định có làm hay không). Đây là dự án cỡ enterprise, triển khai theo nhiều
đợt (R1 / R2 / Later), KHÔNG làm một lần toàn bộ.

## 2. Nguyên tắc bất di bất dịch khi chia module (quan trọng cho việc tổ chức code)

- Module được chia theo **trách nhiệm/đối tượng nghiệp vụ**, không theo màn hình,
  không theo vai trò, không theo kênh sử dụng (web/app/AI không phải là module).
  → Khi tổ chức domain/service trong code, bám theo 12 module này, không bám theo
  UI hay client.
- **Kênh sử dụng** (Web nội bộ, App tài xế, Cổng khách hàng, Cổng nhà vận tải,
  Server/API, Ứng dụng thử nghiệm AI) là lớp giao diện/client, tách biệt khỏi logic
  nghiệp vụ ở backend.
- Ranh giới kế toán CHƯA CHỐT: kế toán vận tải (bảng kê, hóa đơn, công nợ với khách/
  nhà xe) chắc chắn nằm trong TMS; kế toán tổng hợp (sổ cái, thuế, TSCĐ) chỉ làm nếu
  G3 xác nhận. Không giả định module 13 sẽ được implement trừ khi có xác nhận.

## 3. Danh sách 12 module + phân hệ (dùng làm cấu trúc thư mục/domain gợi ý)

| # | Module | Phân hệ chính |
|---|---|---|
| 1 | Công việc và bảng điều hành | Việc cần xử lý theo vai trò; Chỉ số & cảnh báo; Thông báo/tìm kiếm |
| 2 | Khách hàng và chăm sóc quan hệ | Hồ sơ khách hàng; Đầu mối liên hệ & địa điểm; CSKH/cơ hội; Góc nhìn tổng hợp |
| 3 | Hợp đồng, bảng giá và báo giá | Hợp đồng; Bảng giá & phụ phí; Lập/duyệt/gửi báo giá |
| 4 | Tiếp nhận yêu cầu và đơn vận chuyển | Tiếp nhận đa kênh; Hồ sơ đơn; Điểm lấy/giao & hàng hóa; Kiểm tra sẵn sàng |
| 5 | Lập kế hoạch và điều phối | Hàng chờ theo ngày; Ghép/tách chuyến; Phân công nguồn lực; Duyệt & phát lệnh; Gợi ý tối ưu |
| 6 | Chuyến vận tải, theo dõi và ngoại lệ | Hồ sơ chuyến & điểm dừng; Vị trí/ETA; Sự cố & khiếu nại; Theo dõi cho khách hàng |
| 7 | Chứng từ và bằng chứng giao nhận | Danh mục chứng từ bắt buộc; Thu thập bằng chứng; Kiểm tra/khóa/chia sẻ; **AI kiểm tra ảnh**; **AI đọc hóa đơn** |
| 8 | Chi phí, tạm ứng và quyết toán chuyến | Chi phí kế hoạch/thực tế; Tạm ứng & hoàn ứng; Lương/công chuyến |
| 9 | Đối soát, bảng kê, hóa đơn và công nợ vận tải | Đối soát khách hàng; Đối soát nhà vận tải; Hóa đơn điện tử; Công nợ |
| 10 | Nguồn lực và đối tác vận tải | Xe/đầu kéo/rơ-moóc; Tài xế; Container/seal/depot; Nhà vận tải; Giấy tờ & bảo trì |
| 11 | Báo cáo và phân tích | Báo cáo vận hành; Doanh thu/chi phí/lợi nhuận; Báo cáo AI/chất lượng dữ liệu |
| 12 | Quản trị hệ thống và tích hợp | Tài khoản/phân quyền; Danh mục dùng chung; Phê duyệt & audit log; Tích hợp; Bảo mật/sao lưu |
| 13 | Kế toán tổng hợp (CHỜ QUYẾT ĐỊNH) | Tài khoản/bút toán; Thuế; TSCĐ; Sổ & báo cáo tài chính |

## 4. Kiến trúc & stack đề xuất (thảo luận, chưa phải quyết định cuối cùng — xác nhận với team trước khi implement)

- **Backend**: Node.js + TypeScript (NestJS) hoặc Java/Kotlin (Spring Boot). Ưu tiên
  vì tính chặt chẽ cho nghiệp vụ tài chính (module 8, 9, 13) và tích hợp nhiều hệ
  thống ngoài (module 12).
- **Database**: PostgreSQL — dữ liệu quan hệ chặt, phù hợp đối soát/công nợ.
- **Web nội bộ**: React + TypeScript.
- **App tài xế**: Flutter hoặc React Native, bắt buộc **offline-first** (xem mục 5).
- **AI (module 7)**: gọi LLM API đa phương thức (đọc hóa đơn, kiểm tra ảnh, đọc
  container/biển số/seal) từ backend, xử lý **bất đồng bộ sau khi đồng bộ ảnh có
  mạng** — không xử lý AI trên thiết bị tài xế, không tự host LLM ở client.

## 5. Các ràng buộc kỹ thuật bắt buộc phải tôn trọng khi code

1. **App tài xế phải hoạt động được khi mất mạng.** Chụp ảnh, khai chi phí, cập
   nhật điểm dừng phải lưu local trước, đưa vào hàng đợi đồng bộ, tự động gửi lên
   server khi có mạng lại, có cơ chế chống gửi trùng (idempotency key).
2. **Xử lý AI (module 7) chạy ở server, không chạy on-device**, và chạy sau khi ảnh
   đã đồng bộ — không được thiết kế theo hướng tài xế phải chờ AI trả kết quả ngay
   lúc chụp ảnh khi không có mạng.
3. **Không tin tuyệt đối kết quả AI/OCR.** Với dữ liệu có thể kiểm tra bằng logic
   (số container theo chuẩn ISO 6346 có check digit, tổng tiền hóa đơn = tiền trước
   thuế + VAT), luôn chạy một lớp validate bằng code thông thường sau khi LLM trả
   kết quả, không chỉ dựa vào độ tin cậy của model.
4. **Mọi thay đổi liên quan tiền bạc (báo giá, đối soát, hóa đơn, công nợ, chi phí,
   lương) phải có audit log không cho sửa/xóa**, phục vụ kiểm toán (module 12).
5. **Phân quyền theo vai trò + phạm vi dữ liệu** (theo chi nhánh/khách hàng) áp dụng
   xuyên suốt mọi module — không hardcode quyền theo module riêng lẻ, dùng cơ chế
   phân quyền tập trung ở module 12.
6. **Một đơn hàng/chuyến có thể được sửa, tách, gộp, hủy** ở nhiều bước khác nhau
   trong vòng đời — mọi thay đổi phải ghi lại lý do và không phá vỡ liên kết dữ liệu
   ngược về đơn gốc (traceability từ báo giá → đơn → chuyến → chứng từ → hóa đơn).
7. **Không giả định tích hợp bên ngoài luôn khả dụng** (GPS, VNPT hóa đơn điện tử,
   ERP/kế toán, ngân hàng) — mọi tích hợp cần retry, timeout, và fallback rõ ràng vì
   phụ thuộc tài liệu/API của bên thứ ba.

## 6. Độ ưu tiên & phạm vi triển khai

- Toàn bộ 250 chức năng được gắn nhãn **Bắt buộc / Nên có / Có thể có** và đợt triển
  khai **R1 / R2 / Later**. Khi implement, luôn kiểm tra chức năng đang làm có thuộc
  R1 hay không — không tự ý kéo chức năng R2/Later vào sớm nếu không có yêu cầu rõ.
- Các phần AI "nâng cao" (dự báo ETA nâng cao, phát hiện gian lận chi phí nâng cao,
  AI xếp hạng nhà vận tải trong đấu thầu, AI tìm sự cố tương tự) đều thuộc **Later**,
  không nằm trong scope hiện tại — chỉ 12 chức năng AI trong module 7 (kiểm tra ảnh +
  đọc hóa đơn) thuộc R1.
- Cổng nhà vận tải đầy đủ (đấu thầu, đối giá) — chưa chốt R1 hay R2, cần xác nhận
  trước khi implement phần này.

## 7. Những điểm CHƯA CHỐT — không tự ý giả định khi code

- Có làm module Kế toán tổng hợp (module 13) hay không.
- Cổng nhà vận tải vào R1 hay R2.
- Có hỗ trợ offline đầy đủ cho toàn bộ app tài xế hay chỉ một phần thao tác.
- Chi phí vận hành LLM API hàng tháng (số lượng ảnh/hóa đơn xử lý theo tháng) chưa
  được ước tính — cần theo dõi khi thiết kế hệ thống hàng đợi AI để tránh chi phí
  vượt kiểm soát.
- Chính sách bảo mật dữ liệu khi gửi ảnh/hóa đơn có MST, thông tin khách hàng ra
  LLM API bên thứ ba.

Nếu gặp yêu cầu chạm vào các điểm trên, dừng lại và hỏi lại người dùng thay vì tự
quyết định thay.

## 8. Trạng thái triển khai hiện tại (cập nhật khi có module mới xong)

Backend đã khởi tạo thật tại `apps/api` (NestJS + Prisma + PostgreSQL, theo đúng đề
xuất mục 4) — đây không còn chỉ là đề xuất, code đã chạy được. `docker-compose.yml`
dựng Postgres cục bộ ở cổng `5455`; API chạy ở cổng `3011` (`apps/api/.env`); seed tạo
sẵn user `admin@g3.local` / `ChangeMe123!` với role ADMIN có toàn quyền.

**Backend đã chuyển hẳn sang Python** (theo quyết định của người phụ trách dự án,
không phải lựa chọn kỹ thuật của Claude Code): `apps/api-py` (FastAPI + SQLAlchemy
2.0) đã port đủ toàn bộ 9 module nghiệp vụ + kernel, và **frontend (`apps/web`) đã
trỏ sang đây** (`VITE_API_BASE_URL=http://localhost:8011` trong
`apps/web/.env.development`). Schema DB vẫn do Prisma sở hữu
(`apps/api/prisma/migrations`) — `apps/api-py` chỉ đọc/ghi qua cùng một Postgres,
chưa tự chạy migration riêng, chưa dùng Alembic. `apps/api` (NestJS) vẫn còn nguyên
trong repo (chưa xoá) nhưng không còn phục vụ frontend — coi như bản tham chiếu/dự
phòng cho tới khi có quyết định khác.

Khi đối chiếu API contract giữa 2 backend để cắt frontend, phát hiện 2 chỗ NestJS
trả **JS number thường** thay vì Decimal-as-string như quy ước chung — vì NestJS tự
tính tổng qua `.toNumber()` rồi cộng bằng JS `+`, không giữ instance Prisma Decimal:
`TripCostService.summary().totals` (`apps/api/src/modules/trip-cost/trip-cost.service.ts`)
và `TripService.suggestResources().requiredWeightKg/excessCapacityKg`
(`apps/api/src/modules/trip/trip.service.ts`). `apps/api-py` đã khớp đúng 2 ngoại lệ
này (`float(...)` thay vì `str(...)`) sau khi đối chiếu type ở
`apps/web/src/features/trips/api.ts` — nếu thêm chỗ tính tổng tương tự sau này, kiểm
tra NestJS gốc có `.toNumber()` hay không trước khi quyết định serialize kiểu gì.

Đã port và test end-to-end (curl, cùng dữ liệu seed thật) toàn bộ: kernel (auth JWT,
RBAC, audit log, idempotency), Module 2 (Khách hàng), Module 3 (Hợp đồng/Bảng giá/Báo
giá, kể cả convert-to-order gọi chéo sang module 4), Module 4 (Đơn vận chuyển), Module
10 (Xe/Tài xế/Nhà vận tải), Module 5/6 (Chuyến — state machine đầy đủ, gợi ý nguồn lực,
ghép/tách đơn), Module 7 (Chứng từ + AI processing job, kể cả pipeline VLM/OCR tắt mặc
định), Module 8 (Chi phí/tạm ứng, kể cả tạo nháp từ kết quả OCR), Module 9 (Đối soát/
Hóa đơn/Công nợ phải thu-trả, kể cả các ràng buộc khóa/mở lại/thanh toán một phần).

Một lỗi tương thích quan trọng đã phát hiện và sửa: hash mật khẩu argon2id do `npm
argon2` sinh có thứ tự tham số PHC khác `argon2-cffi` (Python) — đã chuẩn hoá lại
trong `security.py` nên user cũ đăng nhập được ngay, không cần đổi mật khẩu. Chi tiết
quy ước khi chuyển tiếp (giữ nguyên contract JSON, RBAC, audit log, ai sở hữu schema
migration, cách serialize Decimal/DateTime) nằm ở `apps/api-py/README.md` — đọc trước
khi sửa/thêm gì ở đây, không tự suy đoán lại từ đầu.

Web nội bộ đã khởi tạo tại `apps/web` (Vite + React + TypeScript + React Router +
TanStack Query, dev server ở cổng `5173`, `vite.config.ts` bind `0.0.0.0` để truy cập
được từ máy khác qua port-forward/firewall; `.env.development` trỏ `VITE_API_BASE_URL`
về API — đổi giá trị này nếu chạy trên máy/host khác, không hardcode theo máy hiện
tại). Lớp API client dùng chung ở `src/lib/api-client.ts` (bọc khuôn dạng
`{data,meta}`/`{error}` của api-conventions.md, tự đăng xuất khi 401 hết phiên). Đăng
nhập lưu JWT + `user.permissions` vào `localStorage` (`src/lib/auth-context.tsx`); mọi
nút hành động trong UI đều gate qua `hasPermission()` lấy từ quyền backend trả về —
không tự suy luận quyền. Đã có trang cho toàn bộ module đã xong ở backend: Khách hàng,
Hợp đồng + Bảng giá (lồng trong chi tiết hợp đồng vì API không có endpoint list bảng
giá), Báo giá, Đơn vận chuyển, Chuyến (kèm gán nguồn lực, ghép đơn, chuyển trạng thái,
luồng Chứng từ module 7: upload — bắt buộc `Idempotency-Key`, xác thực, từ chối, khóa,
chia sẻ, và luồng Chi phí/tạm ứng module 8 ngay trong chi tiết chuyến), Xe/Tài
xế/Nhà vận tải, Loại chứng từ, Hàng đợi AI, và module 9 (Đối soát, Hóa đơn, Công nợ
phải trả — trang riêng). Chưa có: app tài xế, cổng khách hàng/nhà vận tải, trang cho
module 1/11.

Đã implement (schema + service + controller + audit log + RBAC guard cho mọi
endpoint):

Cột "Python" đánh dấu module đã có bản chuyển đổi song song ở `apps/api-py` (cùng
contract JSON, cùng DB) — NestJS (`apps/api`) vẫn là bản chính, frontend vẫn trỏ vào
đó.

| Module | Trạng thái | Python |
|---|---|---|
| 2. Khách hàng | Hồ sơ khách hàng, liên hệ, địa điểm, credit terms, khóa/mở | ✅ |
| 3. Hợp đồng/giá/báo giá | Contract, PriceList + line + surcharge, Quote (tạo/duyệt/từ chối/chuyển thành đơn) | ✅ |
| 4. Đơn vận chuyển | ShipmentOrder + điểm lấy/giao + hàng hóa, state machine Draft→...→Cancelled | ✅ |
| 5. Kế hoạch/điều phối | Gộp vào TripService: ghép/tách đơn vào chuyến (`TripOrderLink`), gán xe/tài xế/NCC, phát lệnh, **gợi ý xe/tài xế/NCC theo tải trọng đơn + trạng thái bận/rảnh** (`GET /v1/trips/:id/resource-suggestions`) | ✅ |
| 6. Chuyến vận tải | Trip state machine đầy đủ (Planned→Dispatched→InProgress→CompletedPendingDocs→CompletedVerified/Closed, Paused/Cancelled/Exception) | ✅ |
| 7. Chứng từ & AI | Xem chi tiết bên dưới | ✅ |
| 8. Chi phí/tạm ứng/quyết toán | Chi phí kế hoạch và thực tế, luồng trình duyệt/duyệt/từ chối; tạm ứng đề nghị → duyệt → chi → quyết toán | ✅ |
| 9. Đối soát/hóa đơn/công nợ | Xem chi tiết bên dưới | ✅ |
| 10. Nguồn lực | Vehicle, Driver, Carrier (CRUD tối thiểu, chưa có Trailer/Container/Seal/Depot riêng) | ✅ |
| 12. Quản trị (kernel) | Auth JWT, RBAC (Role/Permission/UserRole), AuditLogService (append-only), IdempotencyService | ✅ |

**Chưa làm**: module 1 (bảng điều hành), module 11 (báo cáo), module 13 (kế toán tổng
hợp — chờ quyết định). Trailer/Container/Seal/Depot (module 10) chưa có model riêng.
Trong module 8: chưa có `DriverPay` (lương/công chuyến) dù data-model.md mục 1 có nêu.
Trong module 9: chưa có `adjust`/`replace` cho Invoice (chỉ có `void`/`mark-disputed`),
chưa tự động phát hiện `OVERDUE` (cần cron, chưa có hạ tầng job định kỳ).

### Module 9 — Đối soát, bảng kê, hóa đơn và công nợ vận tải
(`apps/api/src/modules/reconciliation-billing`)

- `ReconciliationStatement`: 2 loại `CUSTOMER`/`CARRIER`, state machine
  `Draft/Reopened → Confirmed → Locked → (Reopened, cần reason)`. Không tự tổng hợp
  dòng — nhân viên đối soát thêm `ReconciliationLine` thủ công, mỗi dòng tham chiếu
  đúng 1 `ShipmentOrder` (đối soát khách) hoặc 1 `Trip` (đối soát nhà vận tải) đã
  validate cùng khách hàng/nhà vận tải với bảng; `totalAmount` tự tính lại từ tổng
  dòng mỗi lần thêm/xóa.
- `Invoice`: chỉ tạo từ 1 statement `CUSTOMER` đã `LOCKED` (1-1, có unique constraint);
  `total = subtotal + vatAmount` luôn tính lại bằng code, `vatAmount` do kế toán nhập
  tay (không hardcode %VAT — mức thuế áp dụng chưa được xác nhận). Vòng đời
  `Draft → PendingApproval → Issued → PartiallyPaid/Paid`, cộng `Voided`/`Disputed`.
  Khi `Issue` tự sinh `AccountsReceivable`.
- **CHƯA tích hợp VNPT hóa đơn điện tử thật** — nhà cung cấp/định dạng chưa chốt (mục
  7, CLAUDE.md). `Invoice.eInvoiceStatus` chỉ đánh dấu `PENDING_INTEGRATION` khi phát
  hành nội bộ, không chặn luồng nghiệp vụ chính (ràng buộc 7). Trước khi nối API VNPT
  thật, xác nhận lại với G3.
- `AccountsReceivable`/`AccountsPayable`: theo dõi công nợ 1-1 với Invoice/statement
  CARRIER tương ứng, có `ReceivablePayment`/`PayablePayment` ghi lịch sử thanh toán
  từng phần, tự cập nhật `status` (Open/PartiallyPaid/Paid) và phản ánh ngược lên
  `Invoice.status`.
- Web nội bộ: trang Đối soát (tạo bảng, thêm/xóa dòng, xác nhận/khóa/mở lại, tạo hóa
  đơn hoặc công nợ từ bảng đã khóa), trang Hóa đơn (submit/issue/void/dispute + ghi
  nhận thanh toán), trang Công nợ phải trả (ghi nhận thanh toán cho nhà vận tải).

### Module 5 — Gợi ý tối ưu nguồn lực (`TripService.suggestResources`, trong `apps/api/src/modules/trip`)

- `GET /v1/trips/:id/resource-suggestions` — xếp hạng xe/tài xế (chuyến nội bộ) hoặc
  nhà vận tải (chuyến `isOutsourced`) theo 2 tiêu chí có dữ liệu thật trong schema:
  tải trọng xe (`Vehicle.loadCapacityKg`) so với tổng `Cargo.weightKg` của các đơn đã
  ghép vào chuyến, và trạng thái bận/rảnh (đang giữ ở chuyến khác chưa đóng — trạng
  thái `Planned/Dispatched/InProgress/Paused`). Ưu tiên: rảnh trước bận, đủ tải trước
  thiếu tải, trong nhóm đủ tải thì dư tải ít nhất trước (tránh dùng xe quá khổ cho
  đơn nhỏ). Không loại hẳn lựa chọn không phù hợp khỏi danh sách — chỉ xếp sau và gắn
  `warnings[]`, người điều phối vẫn tự quyết được.
- **Là gợi ý theo quy tắc thông thường, không phải AI** — không thuộc phạm vi "AI
  nâng cao" bị hoãn ở mục 6. Chưa lọc theo thể tích/loại thùng lạnh vì schema hiện
  tại chưa có các trường đó trên `Vehicle`/`Cargo` — nếu cần, phải thêm field trước
  khi mở rộng thuật toán, không tự suy đoán từ dữ liệu không có.
- Web nội bộ: `ResourcePanel` trong trang chi tiết chuyến hiển thị select xe/tài
  xế/NCC đã sắp theo gợi ý kèm nhãn cảnh báo, thay vì danh sách đầy đủ không phân
  biệt như trước.

### Module 8 — Chi phí, tạm ứng và quyết toán chuyến (`apps/api/src/modules/trip-cost`)

- `TripCostPlan`: ghi nhận chi phí kế hoạch theo chuyến và nhóm chi phí.
- `TripCostActual`: chỉ tạo sau khi chuyến đã xác thực chứng từ; đi qua vòng đời
  `Draft → Submitted → Approved/Rejected`. Có thể tham chiếu bằng chứng thuộc chính
  chuyến đó từ module 7.
- `Advance`: đi qua `Requested → Approved → Paid → Settled`; chỉ hủy được trước khi
  đã chi. Mọi thay đổi tài chính đều ghi `AuditLog`, không có API xóa.
- Web nội bộ hiển thị ngay trong chi tiết chuyến; thao tác bị giới hạn bằng các quyền
  `trip-cost:*` và `advance:*`.

### Module 7 — Chứng từ và bằng chứng giao nhận (`apps/api/src/modules/document-evidence`)

- `RequiredDocumentType`: danh mục chứng từ bắt buộc — R1 dùng chung cho mọi chuyến
  (chưa lọc theo khách hàng/loại chuyến như data-model.md mục 1 mô tả — mở rộng khi
  có yêu cầu cụ thể).
- `DocumentEvidence`: thu thập bằng chứng theo chuyến, state machine
  `PendingReview → Verified/NeedsReview/Rejected → Locked` (+ `sharedAt`). Chứng từ
  `LOCKED` không cho sửa.
- `AIProcessingJob` + `AIExtractionResult`: vòng đời job đã dựng đầy đủ (QUEUED →
  VERIFIED/NEEDS_REVIEW) cùng lớp validate bắt buộc bằng code thường sau AI (ràng
  buộc 3, mục 5) — check digit ISO 6346 (`validators/container-number.util.ts`), đối
  chiếu `total = subtotal + vatAmount` và ngày hóa đơn không ở tương lai
  (`validators/invoice-fields.util.ts`), phát hiện trùng hóa đơn qua
  `(issuer, invoiceNumber, invoiceDate)`.
- Hàng đợi vận hành có danh sách theo trạng thái, `QUEUED → PROCESSING`, đánh dấu
  lỗi và chạy lại `FAILED → QUEUED` (tăng `retryCount`); mọi chuyển trạng thái có
  audit log. OCR hóa đơn `VERIFIED` có thể tạo `TripCostActual` nháp qua Module 8,
  không tự duyệt và không tự thay đổi số tiền.
- **CHƯA gọi LLM thật.** Nhà cung cấp LLM và chính sách bảo mật dữ liệu gửi ra ngoài
  chưa chốt (mục 7 ở trên) — endpoint `POST /v1/ai-jobs/:id/result` chỉ nhận kết quả
  AI *đã có sẵn* (từ worker tương lai dùng Redis/BullMQ theo architecture.md, hoặc
  công cụ vận hành) rồi chạy validate, không tự thực hiện lời gọi ra ngoài. Trước khi
  nối luồng gọi LLM thật với dữ liệu production, xác nhận lại chính sách bảo mật.
- Khi đủ mọi `RequiredDocumentType` đang active có bằng chứng Verified/Locked cho một
  chuyến, `DocumentEvidenceService` tự gọi `TripService.completeDocumentVerification()`
  để chuyển `Trip` sang `CompletedVerified` — đúng gate condition bước 7 trong luồng
  10 bước (data-model.md mục 2).

### Kernel mới: Idempotency (`apps/api/src/common/idempotency`)

`IdempotencyService.withIdempotency(key, endpoint, fn)` — dùng cho mọi endpoint ghi dữ
liệu gọi từ app tài xế (ràng buộc 1, mục 5; docs/api-conventions.md mục 4). Đã áp dụng
cho `POST /v1/trips/:tripId/documents`. Khi thêm endpoint ghi dữ liệu khác từ app tài
xế (chi phí, cập nhật điểm dừng...), bọc qua service này thay vì tự viết cơ chế riêng.

## 9. Quy ước khi Claude Code làm việc trên repo này

- Luôn xác định chức năng đang implement thuộc **module nào trong 12 module** ở
  mục 3 trước khi viết code, để đặt đúng domain/service/thư mục.
- Với bất kỳ logic liên quan tiền (giá, phụ phí, đối soát, hóa đơn, công nợ, lương,
  tạm ứng) — ưu tiên độ chính xác và có thể audit hơn là tốc độ code nhanh.
- Với bất kỳ tính năng chạm tới app tài xế — luôn hỏi/thiết kế theo hướng
  offline-first, không giả định luôn có mạng.
- Với tính năng AI — chỉ gọi LLM API từ backend, xử lý bất đồng bộ, luôn có lớp
  validate logic sau khi nhận kết quả AI.
- Khi không chắc một chức năng có thuộc phạm vi R1 hay chưa chốt, hỏi lại thay vì
  tự triển khai.
