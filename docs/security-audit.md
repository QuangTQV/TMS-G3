# Phân quyền & Audit log

> Ràng buộc bắt buộc (CLAUDE.md mục 5.4, 5.5): phân quyền tập trung ở module 12, audit
> log không cho sửa/xóa cho mọi thay đổi liên quan tiền.

## 1. Mô hình phân quyền (RBAC + data scope)

```
User ──▶ có 1..n Role ──▶ mỗi Role có 1..n Permission (VD: quote:approve, invoice:issue)
User ──▶ có DataScope: { branchIds: [...], customerIds?: [...] }
```

- `Permission` kiểm tra **được làm hành động gì** (chức năng).
- `DataScope` kiểm tra **được làm trên dữ liệu nào** (chi nhánh/khách hàng cụ thể).
- Hai lớp kiểm tra **luôn đi cùng nhau**: có quyền `invoice:issue` nhưng hóa đơn không
  thuộc chi nhánh trong `DataScope` của user → vẫn từ chối (`403`).

## 2. Nơi kiểm tra quyền

- Định nghĩa `Permission`/`Role` tập trung trong module 12 (`admin-integration`).
- Mọi module khác dùng **guard/decorator dùng chung** (VD:
  `@RequirePermission('quote:approve')` + tự động lọc theo `DataScope` ở tầng
  query/service), không tự viết điều kiện phân quyền riêng trong từng controller
  (ràng buộc 5, CLAUDE.md) — tránh lệch chuẩn giữa các module.
- Kiểm tra quyền thực hiện ở **backend**, không dựa vào việc ẩn nút trên UI (UI chỉ ẩn
  để trải nghiệm tốt hơn, không phải lớp bảo mật).

## 3. Audit log

### Bắt buộc ghi audit log cho mọi thay đổi trên các entity liên quan tiền:
`Quote`, `PriceList`, `Surcharge`, `Invoice`, `ReconciliationStatement`,
`TripCostPlan`, `TripCostActual`, `Advance`, `AdvanceSettlement`, `DriverPay`,
`AccountsReceivable`, `AccountsPayable`.

### Cấu trúc tối thiểu một bản ghi `AuditLog`:

```
AuditLog {
  id
  entityType        # VD: "Invoice"
  entityId
  action             # CREATE | UPDATE | CANCEL | SPLIT | MERGE ...
  actorUserId
  actorRole
  occurredAt
  reason?            # bắt buộc với UPDATE/CANCEL/SPLIT/MERGE trên entity tiền
  beforeState        # snapshot JSON trước khi đổi
  afterState         # snapshot JSON sau khi đổi
}
```

- Bảng `AuditLog` **append-only**: không có API/quyền nào cho phép `UPDATE` hay
  `DELETE` bản ghi audit, kể cả admin cấp cao.
- Ghi audit log **trong cùng transaction** với thay đổi dữ liệu nghiệp vụ (không ghi
  bất đồng bộ riêng lẻ) — tránh trường hợp dữ liệu đổi nhưng audit log bị mất do lỗi
  tạm thời.
- Entity tiền không hỗ trợ xoá cứng (`DELETE`) — chỉ có trạng thái `Cancelled` +
  `reason` bắt buộc + `AuditLog`, phục vụ kiểm toán và truy vết (ràng buộc 4 & 6,
  CLAUDE.md).

## 4. Việc KHÔNG làm

- Không hardcode kiểm tra quyền theo `role === 'admin'` rải rác trong code từng module.
- Không cho phép xoá cứng bản ghi tiền dù là qua công cụ admin/DB trực tiếp trên
  production — mọi thao tác sửa dữ liệu tiền trên production phải đi qua nghiệp vụ có
  audit log, không chạy script sửa DB tay.
