# Các điểm chưa chốt — theo dõi, không tự giả định

Danh sách này hợp nhất [CLAUDE.md](../CLAUDE.md) mục 7 với sheet `03_Chi_tiet_chuc_nang`
(các dòng có Phạm vi = "Cần quyết định" / Đợt triển khai = "TBD") và sheet
`09_Noi_dung_can_chot` của `TMS_Danh_muc_module_tinh_nang.xlsx`. Thêm cột trạng thái để
theo dõi qua thời gian. Khi một điểm được team G3 xác nhận, cập nhật cột **Trạng thái**
và ghi lại quyết định + ngày xác nhận — không xoá dòng, giữ lịch sử quyết định.

> Lưu ý về nguồn: sheet `09_Noi_dung_can_chot` trong file gốc là **bảng theo dõi quyết
> định chính thức** phía doanh nghiệp (có cột Người quyết định/Thời hạn/Kết luận) nhưng
> hiện đang **để trống** — G3 chưa điền. Khi file đó được cập nhật, đối chiếu lại và ưu
> tiên nó hơn bảng dưới đây.

## Điểm chưa chốt ảnh hưởng trực tiếp tới việc code

| # | Điểm chưa chốt | Nguồn | Ảnh hưởng tới code | Trạng thái | Quyết định (khi có) |
|---|---|---|---|---|---|
| 1 | Có làm module Kế toán tổng hợp (module 13) hay không | CLAUDE.md mục 7; sheet 01 dòng module 13 | Không tạo thư mục/domain cho module 13 cho tới khi xác nhận | Chưa chốt | — |
| 2 | Cổng nhà vận tải: bản tối giản R1 hay R2 chính xác (bản đầy đủ đấu thầu/đối giá đã rõ là **Later**, không cần hỏi lại) | Sheet 03, ghi chú "mặc định dự kiến R2" cho bản tối giản dù cột Phạm vi = "Trong phạm vi" | Có thể thiết kế bản tối giản (xem chuyến, khai nguồn lực, tải chứng từ, xem bảng kê) nhưng chưa xếp vào sprint R1 cho tới khi có xác nhận đợt — xem [roles-channels.md](./roles-channels.md) mục 3 | Chưa chốt (thu hẹp hơn trước) | — |
| 3 | Hỗ trợ offline đầy đủ cho toàn bộ app tài xế hay chỉ một phần thao tác | CLAUDE.md mục 7; sheet 05 (mọi dòng có cột "Cần ngoại tuyến" = "Cần xác nhận") | [offline-sync.md](./offline-sync.md) hiện chỉ áp dụng chắc chắn cho ảnh/chi phí/điểm dừng; **toàn bộ 33 chức năng liệt kê trong sheet `05_Ung_dung_tai_xe` đều đang ở trạng thái "Cần xác nhận" ngoại tuyến**, không chỉ 3 nhóm đã nêu — rà lại từng chức năng khi implement app tài xế | Chưa chốt | — |
| 4 | Nghiệp vụ đặt chỗ vận tải biển đầy đủ (parties, POL/POD, vessel/voyage, sailing schedule, SI/VGM, cut-off đầy đủ) | Sheet 03, module 4, Phạm vi = "Cần quyết định", Đợt = TBD | Không code phần đặt chỗ hãng tàu đầy đủ — module 4 R1 chỉ có "hãng tàu khi nghiệp vụ vận tải container yêu cầu" ở mức thông tin cơ bản (booking number, DO, container dự kiến, seal, depot, cut-off cần thiết) | Chưa chốt | — |
| 5 | MFA/SSO/sinh trắc học cho đăng nhập | Sheet 03, module 12, Phạm vi = "Cần quyết định", mức ưu tiên "Nên có", Đợt = TBD | Thiết kế auth cơ bản (tài khoản/mật khẩu) trước, để chỗ mở rộng MFA/SSO sau, không giả định có ngay từ R1 | Chưa chốt | — |
| 6 | Tích hợp ngân hàng/cổng thanh toán | Sheet 03, module 12, Phạm vi = "Cần quyết định", Đợt = TBD | Không code tích hợp thanh toán tự động — công nợ/thanh toán R1 chỉ ghi nhận thủ công (phiếu thu/chi) | Chưa chốt | — |
| 7 | Tích hợp ERP/kế toán cho module 13 (ánh xạ tài khoản/trung tâm chi phí, gửi lô dữ liệu, nhận trạng thái) | Sheet 03, module 12, Phạm vi = "Cần quyết định", Đợt = TBD | Phụ thuộc trực tiếp vào điểm #1 (có làm module 13 hay không) — không thiết kế integration này trước khi #1 được chốt | Chưa chốt | — |
| 8 | Chi phí vận hành LLM API hàng tháng (số ảnh/hóa đơn xử lý theo tháng) | CLAUDE.md mục 7 | Ảnh hưởng thiết kế giới hạn/quota hàng đợi AI ([ai-processing.md](./ai-processing.md) mục 4) — cần theo dõi số liệu thực tế khi hệ thống chạy | Chưa chốt | — |
| 9 | Chính sách bảo mật dữ liệu khi gửi ảnh/hóa đơn có MST, thông tin khách hàng ra LLM API bên thứ ba | CLAUDE.md mục 7 | Không đẩy dữ liệu production thật qua LLM API cho tới khi có chính sách rõ ([ai-processing.md](./ai-processing.md) mục 5) | Chưa chốt | — |
| 10 | Stack kỹ thuật cụ thể (Node/NestJS vs Java/Kotlin Spring Boot) | CLAUDE.md mục 4 | [architecture.md](./architecture.md) đang đề xuất Node/NestJS — cần xác nhận trước khi khởi tạo project thật | Đề xuất, chưa xác nhận | — |

## Ngoài phạm vi TMS cốt lõi — không code trừ khi có yêu cầu riêng

Nguồn: sheet `10_Pham_vi_mo_rong`. Đây là các hạng mục doanh nghiệp **chủ động tách
khỏi** phạm vi báo giá TMS hiện tại, khác với "chưa chốt" — không cần hỏi lại trừ khi
người dùng chủ động yêu cầu mở rộng sang các hạng mục này.

| Hạng mục | Nội dung | Lý do tách | Ghi chú kiến trúc |
|---|---|---|---|
| Kế toán tổng hợp | Sổ cái, bút toán, thuế, kỳ kế toán, tài sản cố định, báo cáo tài chính | Không phải mọi TMS đều sở hữu sổ kế toán; phụ thuộc quyết định tích hợp ERP | Đây chính là module 13 — xem điểm #1 ở bảng trên |
| Mạng lưới G3 | Kết nối nhiều bên, tìm nguồn lực, ghép nhu cầu, giao dịch trên mạng lưới | Là mô hình nền tảng nhiều bên (platform), khác kiến trúc TMS nội bộ một công ty | Đề xuất triển khai sau PoC TMS cốt lõi — **không thiết kế schema/module hiện tại theo hướng multi-tenant platform** trừ khi được yêu cầu, tránh over-engineering sớm |
| Quản lý xe điện và carbon | Trạm sạc, pin, kế hoạch sạc, phát thải, chứng chỉ | Là sản phẩm chuyên biệt, cần dữ liệu thiết bị riêng | File gốc yêu cầu "chừa điểm tích hợp trong kiến trúc" — khi thiết kế `Vehicle`/`Trailer` (module 10), tránh hardcode giả định chỉ có nhiên liệu hóa thạch (VD: đặt tên field trung tính thay vì `fuelLiters` cứng), nhưng không code tính năng EV/carbon ngay |
| Bảo trì đội xe nâng cao | Lệnh sửa chữa, xưởng, phụ tùng, kỹ thuật viên, bảo trì dự báo | TMS cốt lõi chỉ cần trạng thái bảo trì và khóa nguồn lực | Khớp với chức năng "Lệnh sửa chữa, xưởng, phụ tùng, kỹ thuật viên, nghiệm thu và bảo trì dự báo" đã gắn nhãn Later trong sheet 03 (module 10) — module 10 R1 chỉ cần "Ghi nhận trạng thái đang bảo trì và ngày dự kiến khả dụng" |

## Quy trình xử lý khi gặp yêu cầu chạm vào các điểm trên

Theo CLAUDE.md mục 7: **dừng lại và hỏi lại người dùng/team G3 thay vì tự quyết định
thay.** Khi nhận được câu trả lời, cập nhật bảng trên và phản ánh vào tài liệu tương
ứng (`architecture.md`, `ai-processing.md`, `offline-sync.md`, `roles-channels.md`...)
trong cùng lần thay đổi.
