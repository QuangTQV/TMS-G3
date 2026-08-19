import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

const NAV_ITEMS = [
  { to: "/customers", label: "Khách hàng" },
  { to: "/contracts", label: "Hợp đồng & bảng giá" },
  { to: "/quotes", label: "Báo giá" },
  { to: "/shipment-orders", label: "Đơn vận chuyển" },
  { to: "/trips", label: "Chuyến vận tải" },
  { to: "/vehicles", label: "Xe" },
  { to: "/drivers", label: "Tài xế" },
  { to: "/carriers", label: "Nhà vận tải" },
  { to: "/document-types", label: "Loại chứng từ" },
  { to: "/ai-jobs", label: "Hàng đợi AI" },
  { to: "/reconciliation-statements", label: "Đối soát" },
  { to: "/invoices", label: "Hóa đơn" },
  { to: "/accounts-payable", label: "Công nợ phải trả" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">TMS G3</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="topbar-user">
            {user?.fullName} ({user?.roles.join(", ")})
          </span>
          <button className="btn btn-ghost" onClick={logout}>
            Đăng xuất
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
