# Đối chiếu thuật ngữ nghiệp vụ (VN ↔ tên trong code)

Dùng bảng này để đặt tên entity/field/API nhất quán — tránh mỗi module dịch một kiểu
cho cùng một khái niệm nghiệp vụ.

| Thuật ngữ tiếng Việt | Tên trong code (English) | Ghi chú |
|---|---|---|
| Khách hàng | `Customer` | B2B, doanh nghiệp |
| Đầu mối liên hệ | `Contact` | |
| Địa điểm (kho, điểm giao) | `Location` | dùng chung cho điểm lấy/giao |
| Hợp đồng | `Contract` | |
| Bảng giá | `PriceList` | |
| Phụ phí | `Surcharge` | |
| Báo giá | `Quote` | |
| Đơn vận chuyển | `ShipmentOrder` | không viết tắt `Order` một mình — dễ nhầm entity khác |
| Điểm lấy/giao hàng | `PickupDeliveryPoint` | |
| Hàng hóa | `Cargo` | |
| Kế hoạch điều phối | `DispatchPlan` | |
| Chuyến vận tải | `Trip` | |
| Điểm dừng (của chuyến) | `TripStop` | |
| Sự cố | `Incident` | |
| Khiếu nại | `Complaint` | |
| Chứng từ / bằng chứng giao nhận | `DocumentEvidence` | |
| Loại chứng từ bắt buộc | `RequiredDocumentType` | |
| Kết quả trích xuất AI | `AIExtractionResult` | |
| Chi phí kế hoạch | `TripCostPlan` | |
| Chi phí thực tế | `TripCostActual` | |
| Tạm ứng | `Advance` | |
| Hoàn ứng / quyết toán tạm ứng | `AdvanceSettlement` | |
| Lương/công chuyến | `DriverPay` | |
| Đối soát | `Reconciliation` / `ReconciliationStatement` | |
| Bảng kê | `Statement` | thường gắn với `ReconciliationStatement` |
| Hóa đơn (điện tử) | `Invoice` | |
| Công nợ phải thu | `AccountsReceivable` | với khách hàng |
| Công nợ phải trả | `AccountsPayable` | với nhà vận tải/nhà cung cấp |
| Xe / đầu kéo / rơ-moóc | `Vehicle` / `Trailer` | |
| Tài xế | `Driver` | |
| Container | `Container` | có `sealNumber` |
| Seal | `Seal` | |
| Depot | `Depot` | |
| Nhà vận tải (đối tác thuê ngoài) | `Carrier` | phân biệt với `Customer` |
| Tài khoản người dùng | `User` | |
| Vai trò | `Role` | |
| Quyền | `Permission` | |
| Phạm vi dữ liệu | `DataScope` | theo chi nhánh/khách hàng |
| Nhật ký kiểm toán | `AuditLog` | append-only |
| Chi nhánh | `Branch` | |
| Danh mục dùng chung | `Category` / `Lookup` | quản lý tập trung ở module 12 |

## Thuật ngữ chuyên ngành logistics/container (xuất hiện trong file gốc, giữ nguyên viết tắt)

| Viết tắt/thuật ngữ | Giải thích | Xuất hiện ở |
|---|---|---|
| EIR | Equipment Interchange Receipt — biên bản giao nhận container tại cảng/depot | Module 7 (bằng chứng), module 10 (container/depot) |
| POD | Proof of Delivery — bằng chứng giao hàng | Module 7 |
| ePOD | POD điện tử (có thể duyệt/từ chối/chia sẻ qua hệ thống) | Module 7 |
| DO | Delivery Order — lệnh giao hàng | Module 4 |
| PO | Purchase Order — đơn đặt hàng của khách | Module 4 |
| Cut-off | Thời hạn chót nhận hàng/chứng từ trước khi tàu chạy | Module 4 |
| POL / POD (vận tải biển) | Port of Loading / Port of Discharge — cảng xếp/dỡ hàng (khác nghĩa với POD "proof of delivery" ở trên, phân biệt theo ngữ cảnh) | Module 4 (đặt chỗ vận tải biển — thuộc điểm chưa chốt, xem open-questions.md) |
| SI / VGM | Shipping Instruction / Verified Gross Mass — chỉ dẫn gửi hàng / khối lượng tổng đã xác minh | Module 4 (đặt chỗ vận tải biển — chưa chốt) |
| Vessel/voyage | Tàu/chuyến tàu (mã hành trình tàu biển) | Module 4 (chưa chốt) |
| Geofence | Vùng ranh giới địa lý ảo dùng để tự động check-in/check-out khi xe vào/ra | Module 6 |
| CAPA | Corrective and Preventive Action — hành động khắc phục và phòng ngừa (cho sự cố) | Module 6 — bản đầy đủ thuộc Later, R1 chỉ có "nguyên nhân gốc đơn giản và hành động khắc phục" |
| PWA | Progressive Web App — ứng dụng web cài trên điện thoại, dùng cho vai trò tối giản (duyệt/chứng từ) trên app tài xế | Module 7 |
| Tender / counter-offer / award | Mời chào giá nhiều nhà vận tải / đối giá / chốt thắng thầu | Module 5, 10 — thuộc phạm vi đấu thầu đầy đủ (Later), không phải bản tối giản R1 |

## Nguyên tắc

- Ưu tiên tên miền nghiệp vụ tiếng Anh chuẩn ngành logistics (`Trip`, `Consignment`
  tương đương `ShipmentOrder`...) thay vì dịch word-by-word từ tiếng Việt khi có thuật
  ngữ ngành đã phổ biến hơn — nhưng **giữ nhất quán** theo bảng này trong toàn bộ repo
  một khi đã chọn.
- Khi gặp khái niệm mới chưa có trong bảng, thêm vào bảng này trước khi dùng tên đó
  rải rác nhiều nơi trong code.
