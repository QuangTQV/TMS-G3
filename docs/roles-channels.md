# Vai trò và kênh sử dụng

> Nguồn: `TMS_Danh_muc_module_tinh_nang.xlsx`, sheet `06_Vai_tro` và `04_Kenh_su_dung`.
> Đây là danh sách có thẩm quyền cho RBAC (module 12) và cho việc xác định client nào
> gọi API nào — xem thêm [security-audit.md](./security-audit.md).

## 1. Vai trò (12 vai trò nghiệp vụ)

| Vai trò | Trách nhiệm chính | Module chính sử dụng |
|---|---|---|
| Ban điều hành | Theo dõi chỉ số, phê duyệt, xem báo cáo | Bảng điều hành; Báo cáo; Tài chính vận tải |
| Kinh doanh | Khách hàng, cơ hội, hợp đồng, bảng giá, báo giá, chuyển đơn | Khách hàng; Hợp đồng và báo giá; Đơn vận chuyển |
| Chăm sóc khách hàng | Tiếp nhận yêu cầu, theo dõi thực hiện, hỗ trợ khách hàng | Khách hàng; Đơn; Chuyến; Chứng từ |
| Nhân viên kế hoạch | Tổng hợp nhu cầu, tạo phương án, xếp lịch | Kế hoạch và điều phối; Nguồn lực |
| Điều phối viên | Gán nguồn lực, phát lệnh, theo dõi chuyến, xử lý ngoại lệ | Điều phối; Chuyến; Chứng từ; Nguồn lực |
| Tài xế | Nhận chuyến, thực hiện điểm dừng, chụp bằng chứng, khai chi phí/sự cố | Chuyến; Chứng từ; Chi phí |
| Nhân viên chứng từ | Kiểm tra hồ sơ đơn/chuyến, duyệt bằng chứng, yêu cầu bổ sung | Chứng từ; Chuyến; Đối soát |
| Kế toán và đối soát | Chi phí, tạm ứng, bảng kê, hóa đơn, công nợ | Chi phí; Đối soát và công nợ; Kế toán tổng hợp (nếu có) |
| Quản lý đội xe | Quản lý xe, tài xế, giấy tờ, tình trạng sử dụng | Nguồn lực; Báo cáo |
| Nhân viên mua tải | Quản lý nhà vận tải, giá mua, nguồn lực thuê ngoài | Nguồn lực; Điều phối; Đối soát |
| Khách hàng | Theo dõi đơn/chuyến, nhận thông báo, xem hồ sơ được chia sẻ | Chuyến; Chứng từ; Công nợ theo quyền |
| Quản trị hệ thống | Người dùng, quyền, danh mục, tích hợp, sao lưu, giám sát | Quản trị hệ thống và tích hợp |

Ghi chú: mỗi vai trò cần một **người xác nhận phía G3** trước khi chốt ma trận quyền
chi tiết (cột này còn để trống trong file gốc) — không tự gán quyền chi tiết theo suy
đoán, hỏi lại khi thiết kế permission matrix thật.

## 2. Kênh sử dụng (6 kênh)

| Kênh | Người dùng | Mục đích | Ghi chú triển khai |
|---|---|---|---|
| Web nội bộ | Nhân viên và quản lý G3 | Điều hành toàn bộ nghiệp vụ | Kênh cốt lõi — hầu hết business logic được thao tác qua đây |
| Ứng dụng tài xế | Tài xế nội bộ và tài xế nhà vận tải | Nhận chuyến, thực hiện điểm dừng, chụp bằng chứng, khai chi phí/sự cố | **Bắt buộc hỗ trợ ngoại tuyến** — xem [offline-sync.md](./offline-sync.md). Tài xế nhà vận tải dùng chung app nhưng **phạm vi dữ liệu riêng** (chỉ thấy chuyến/dữ liệu của mình) |
| Cổng khách hàng | Khách hàng | Theo dõi đơn/chuyến, xem bằng chứng, bảng kê, hóa đơn, công nợ theo quyền | Không thay thế CRM nội bộ; chỉ xem dữ liệu trong phạm vi được chia sẻ |
| Cổng nhà vận tải | Nhà vận tải | Nhận chuyến, khai xe/tài xế, tải chứng từ, xem bảng kê | **Hai mức phạm vi khác nhau** — xem mục 3 bên dưới |
| Dịch vụ máy chủ và API | Hệ thống bên ngoài | Kết nối GPS, VNPT, phần mềm kế toán, hệ thống khách hàng, email, Zalo | Phụ thuộc tài liệu/môi trường thử nghiệm của bên thứ ba — luôn có retry/timeout/fallback (ràng buộc 7, CLAUDE.md) |
| **Ứng dụng kiểm thử AI** | Đội AI và kiểm thử nội bộ | Kiểm tra mô hình đọc container/hóa đơn | **Không sở hữu nghiệp vụ, tách biệt khỏi ứng dụng vận hành production.** Chỉ dùng cho PoC/kiểm thử mô hình — không deploy cùng hạ tầng production, không cho phép truy cập dữ liệu khách hàng thật trừ khi có quy trình ẩn danh hóa riêng |

Nguyên tắc chung: kênh là **lớp giao diện**, dữ liệu và quy tắc nghiệp vụ luôn do
module sở hữu (mục 2, CLAUDE.md) — không viết business logic riêng trong bất kỳ client
nào, kể cả app kiểm thử AI.

## 3. Cổng nhà vận tải — làm rõ 2 mức phạm vi (điểm dễ nhầm)

Trước đây CLAUDE.md ghi "cổng nhà vận tải đầy đủ — chưa chốt R1 hay R2". File gốc làm
rõ hơn: có **hai phạm vi tách biệt**, không phải một khối "cổng nhà vận tải" duy nhất.

| Phạm vi | Nội dung | Đợt |
|---|---|---|
| **Bản tối giản** | Xem chuyến được giao, khai nguồn lực (xe/tài xế) cho chuyến, tải chứng từ, xem bảng kê | Trong phạm vi, mức ưu tiên "Nên có", dự kiến R1 (ghi chú gốc: "mặc định dự kiến R2" — **vẫn cần G3 xác nhận R1 hay R2 chính xác**, xem [open-questions.md](./open-questions.md)) |
| **Bản đầy đủ** | Tender inbox, đối giá (counter-offer), đấu thầu nhiều nhà vận tải, AI xếp hạng nhà vận tải | **Tương lai/Later — không code trong đợt hiện tại** |

Kết luận cho việc code: có thể bắt đầu thiết kế bản tối giản (đọc chuyến, khai nguồn
lực, upload chứng từ, xem bảng kê) vì đã có nhãn "Trong phạm vi", nhưng **xác nhận lại
đợt triển khai chính xác (R1/R2) với G3 trước khi lên lịch**, và không được lấn sang
phần đấu thầu/đối giá.
