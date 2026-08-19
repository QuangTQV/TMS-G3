# Mô hình dữ liệu cốt lõi

> Đây là mô hình khái niệm (conceptual model) để định hướng thiết kế schema, không
> phải DDL cuối cùng. Field chi tiết sẽ bổ sung khi implement từng module theo đúng
> phạm vi R1 (tra `TMS_Danh_muc_module_tinh_nang.xlsx`, sheet `03_Chi_tiet_chuc_nang`).
> Luồng nghiệp vụ và ranh giới sở hữu dữ liệu ở mục 2-3 lấy trực tiếp từ sheet
> `07_Luong_nghiep_vu` và `03_Chi_tiet_chuc_nang` của file gốc — đây là nguồn có thẩm
> quyền cao nhất, ưu tiên hơn suy luận thêm.

## 1. Thực thể cốt lõi theo module

| Module | Thực thể chính |
|---|---|
| 2. Khách hàng | `Customer`, `Contact`, `Location`, `Opportunity` |
| 3. Hợp đồng/giá | `Contract`, `PriceList`, `Surcharge`, `Quote`, `QuoteApproval` |
| 4. Đơn vận chuyển | `ShipmentOrder`, `PickupDeliveryPoint`, `Cargo` |
| 5. Kế hoạch/điều phối | `DispatchPlan`, `TripAssignment`, `ResourceAllocation` |
| 6. Chuyến vận tải | `Trip`, `TripStop`, `TripLocationPing`, `Incident`, `Complaint` |
| 7. Chứng từ | `RequiredDocumentType`, `DocumentEvidence`, `AIExtractionResult` |
| 8. Chi phí | `TripCostPlan`, `TripCostActual`, `Advance`, `AdvanceSettlement`, `DriverPay` |
| 9. Đối soát/hóa đơn | `ReconciliationStatement`, `Invoice`, `AccountsReceivable`, `AccountsPayable` |
| 10. Nguồn lực | `Vehicle`, `Trailer`, `Driver`, `Container`, `Seal`, `Depot`, `Carrier` |
| 11. Báo cáo | (đọc từ các module trên qua view/read-model, không có bảng nguồn riêng) |
| 12. Quản trị | `User`, `Role`, `Permission`, `DataScope`, `AuditLog`, `Category` (danh mục dùng chung) |

## 2. Luồng nghiệp vụ 10 bước (nguồn: sheet `07_Luong_nghiep_vu`)

Đây là luồng nghiệp vụ có thẩm quyền — mỗi bước có **module sở hữu**, **điều kiện qua
bước** (gate condition) và **ngoại lệ chính** đã được doanh nghiệp xác nhận. Dùng bảng
này làm cơ sở thiết kế state machine và validate logic ở tầng service, không tự suy
diễn thêm điều kiện.

| # | Giai đoạn | Module sở hữu | Vai trò | Điều kiện qua bước (gate) | Ngoại lệ chính |
|---|---|---|---|---|---|
| 1 | Tiếp nhận nhu cầu | Khách hàng; Tiếp nhận yêu cầu và đơn | Kinh doanh/CS | Có thông tin tối thiểu để báo giá hoặc tạo đơn nháp | Thiếu địa điểm, depot hoặc thời hạn |
| 2 | Báo giá | Hợp đồng, bảng giá và báo giá | Kinh doanh/Quản lý | Đúng hiệu lực giá và thẩm quyền duyệt | Giá ngoài khung hoặc thiếu giá mua |
| 3 | Hoàn thiện đơn | Tiếp nhận yêu cầu và đơn vận chuyển | CS/Điều hành | Không còn điều kiện chặn lập kế hoạch | Cho phép để trống dữ liệu chưa phát sinh |
| 4 | Lập kế hoạch | Lập kế hoạch và điều phối | Nhân viên kế hoạch | Không xung đột khung giờ, tải trọng và điều kiện nguồn lực | Đơn thay đổi hoặc nguồn lực không còn sẵn sàng |
| 5 | Phân công và phát lệnh | Lập kế hoạch và điều phối | Điều phối viên | Nguồn lực hợp lệ và người nhận xác nhận | Đổi xe, tài xế hoặc NCC |
| 6 | Thực hiện chuyến | Chuyến vận tải, theo dõi và ngoại lệ | Tài xế/Điều phối | Hoàn thành việc bắt buộc tại điểm | Mất mạng/GPS, sai container, giao thất bại |
| 7 | Kiểm soát chứng từ | Chứng từ và bằng chứng giao nhận | Chứng từ/Điều hành | Đủ loại bắt buộc và đúng đơn/chuyến | Ảnh mờ, trùng, sai chuyến hoặc sai seal |
| 8 | Chi phí và đóng vận hành | Chi phí, tạm ứng và quyết toán chuyến | Kế toán/Điều hành | Không thiếu bằng chứng hoặc chi phí chưa xử lý | Vượt định mức hoặc hóa đơn trùng |
| 9 | Đối soát và bảng kê | Đối soát, bảng kê, hóa đơn và công nợ vận tải | Đối soát/Kế toán | Các bên xác nhận số liệu | Tranh chấp cước/phụ phí/chứng từ |
| 10 | Hóa đơn và công nợ | Đối soát, bảng kê, hóa đơn và công nợ vận tải | Kế toán | Hóa đơn/tích hợp thành công | Lỗi VNPT/ERP, điều chỉnh hoặc hủy |

Nguyên tắc bố trí đối tượng (theo mô tả gốc của file spec): **đơn vận chuyển là hồ sơ
trung tâm; chuyến là đối tượng thực thi; bằng chứng phát sinh tại chuyến nhưng luôn
truy ngược về đơn.**

```
Quote ──▶ ShipmentOrder ──▶ DispatchPlan ──▶ Trip ──▶ DocumentEvidence
                                                  ├──▶ TripCostActual
                                                  └──▶ ReconciliationStatement ──▶ Invoice
```

Quy tắc bắt buộc:

- Mỗi bước giữ **tham chiếu ID** về bước trước (VD: `Trip.shipmentOrderId`,
  `Invoice.reconciliationStatementId`), không copy-and-forget dữ liệu.
- Khi một `ShipmentOrder` bị **tách** thành nhiều `Trip`, hoặc nhiều `ShipmentOrder`
  được **gộp** vào một `Trip`, dùng bảng liên kết nhiều-nhiều
  (`TripOrderLink { tripId, shipmentOrderId, splitReason }`) thay vì một FK 1-1 — vì
  quan hệ có thể là N-N tuỳ nghiệp vụ ghép/tách chuyến (phân hệ "Tạo, ghép, tách chuyến
  và xây dựng lộ trình", module 5).
- Mọi hành động sửa/tách/gộp/hủy phải ghi `reason` và tạo bản ghi `AuditLog` (xem
  [security-audit.md](./security-audit.md)), không update im lặng — khớp với chức năng
  "Ghi lý do và lịch sử mọi thay đổi sau phát hành" (module 5) và "Nhật ký kiểm toán...
  không cho sửa/xóa" (module 12).
- Mỗi ngoại lệ ở bảng trên cần một trạng thái/luồng xử lý rõ ràng trong code (không chỉ
  throw lỗi chung chung) — VD: "hóa đơn trùng" ở bước 8/10 phải map sang chức năng
  "Phát hiện trùng tệp/số hóa đơn" đã có sẵn ở module 7.

## 3. Vòng đời trạng thái (state machine) — khung tối thiểu

Suy ra từ điều kiện qua bước ở mục 2 và các chức năng "Hoàn thành, tạm dừng, hủy và mở
lại theo quyền" / "Xác nhận, khóa và mở lại kỳ có phê duyệt" trong sheet
`03_Chi_tiet_chuc_nang`. Tên trạng thái là đề xuất kỹ thuật, chưa phải thuật ngữ chính
thức từ doanh nghiệp — xác nhận lại khi thiết kế UI/API chi tiết cho từng module.

`ShipmentOrder.status`:
`Draft → Confirmed → Planned → InTransit → Delivered → Closed`
(nhánh phụ: `Cancelled` từ bất kỳ trạng thái nào trước `Delivered`; `Split`/`Merged`
là sự kiện, không phải trạng thái cuối; `Held` khi bị "tạm giữ" — chức năng "Lưu nháp,
sao chép, định kỳ, sửa, tạm giữ và hủy" module 4)

`Trip.status`:
`Planned → Dispatched → InProgress → CompletedPendingDocs → CompletedVerified → Closed`
(nhánh phụ: `Exception` khi có sự cố; `Paused`/`Cancelled`/`Reopened` theo chức năng
"Hoàn thành, tạm dừng, hủy và mở lại theo quyền" — module 6, luôn kèm audit log)

`ReconciliationStatement.status`:
`Draft → Confirmed → Locked → Reopened` (mở lại phải có phê duyệt — chức năng "Xác
nhận, khóa và mở lại kỳ có phê duyệt", module 9)

`Invoice.status`:
`Draft → PendingApproval → Issued → PartiallyPaid → Paid → Overdue/Disputed`
(module 9 còn yêu cầu riêng: `Adjusted`/`Replaced`/`Voided` cho hóa đơn điện tử VNPT —
"phát hành, lỗi, điều chỉnh, thay thế và hủy")

## 4. Ranh giới sở hữu dữ liệu giữa các module (dễ làm sai nếu bỏ qua)

Các ranh giới dưới đây được nêu rõ trong ghi chú chức năng của file gốc — vi phạm sẽ
gây trùng lặp dữ liệu hoặc sai nguồn sự thật:

- **Giá mua (purchase price) do module 10 (Nguồn lực và đối tác vận tải) sở hữu**,
  không phải module 3. Module 3 (Hợp đồng, bảng giá và báo giá) chỉ **tham chiếu** giá
  mua từ module 10 để tính biên lợi nhuận khi lập báo giá — không lưu bản sao giá mua
  trong bảng của module 3.
- **Giá trị khấu hao tài sản do module 13 (Kế toán tổng hợp, nếu có) sở hữu**. Module
  10 chỉ quản lý tài sản vận hành (ghi tăng, đơn vị sử dụng, điều chuyển, trạng thái,
  thanh lý) và **hiển thị khấu hao dưới dạng tham chiếu read-only** từ module 13 nếu
  module đó tồn tại — không tự tính khấu hao trong module 10.
- **Kết quả AI/OCR do module 7 (Chứng từ và bằng chứng giao nhận) sở hữu và xử lý**.
  Module 8 (Chi phí) chỉ **nhận dữ liệu đã trích xuất** từ module 7 để tạo phiếu chi
  phí nháp, và nhận riêng kết quả kiểm tra trùng/OCR để **so sánh chéo** với số tiền
  chi phí tài xế khai báo — module 8 không tự gọi LLM hay tự OCR.
- **Cổng nhà vận tải (module 10) có hai mức phạm vi khác nhau** — xem chi tiết ở
  [open-questions.md](./open-questions.md): bản tối giản (xem chuyến, khai nguồn lực,
  tải chứng từ, xem bảng kê) thuộc phạm vi gần R1; bản đầy đủ (tender inbox,
  counter-offer, award, AI xếp hạng) là **Later**, không code trong đợt hiện tại.

## 4. Ràng buộc dữ liệu quan trọng

- **Container ISO 6346**: `Container.number` phải qua validate check-digit bằng code
  thường sau khi nhận từ AI/OCR (ràng buộc 3, CLAUDE.md) — không lưu thẳng kết quả AI
  chưa qua validate.
- **Số tiền hóa đơn**: `Invoice.total = Invoice.subtotal + Invoice.vatAmount`, luôn
  validate lại bằng code sau khi AI đọc hóa đơn, không tin tuyệt đối OCR.
- **Audit log bất biến**: mọi bảng liên quan tiền (`Quote`, `Invoice`,
  `ReconciliationStatement`, `TripCostActual`, `Advance`, `DriverPay`) không cho phép
  `DELETE` — chỉ soft-cancel + ghi `AuditLog`.
- **Phạm vi dữ liệu (data scope)**: các bảng nghiệp vụ chính nên có `branchId` và/hoặc
  `customerId` để phục vụ phân quyền theo chi nhánh/khách hàng ở module 12 (ràng buộc
  5, CLAUDE.md) — thiết kế ngay từ đầu, không thêm sau.
