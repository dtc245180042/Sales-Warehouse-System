import UserInfo from './UserInfo';
import './Navbar.css';

export default function Navbar() {
  return (
    <header className="navbar-header">
      {/* Bên trái: Logo và Tên hệ thống */}
      <div className="navbar-brand">
        <div className="brand-logo-icon" aria-hidden="true">
          📦
        </div>
        <div className="brand-title">
          <span className="brand-name">Hệ Thống Bán Hàng & Kho</span>
          <span className="brand-subtitle">Sales & Warehouse Management</span>
        </div>
      </div>

      {/* Ở giữa: Menu điều hướng cơ bản */}
      <nav aria-label="Điều hướng chính">
        <ul className="navbar-links">
          <li className="nav-item active">
            <a href="#dashboard">📊 Tổng quan</a>
          </li>
          <li className="nav-item">
            <a href="#warehouse">🏭 Kho hàng</a>
          </li>
          <li className="nav-item">
            <a href="#sales">🛒 Bán hàng</a>
          </li>
          <li className="nav-item">
            <a href="#reports">📈 Báo cáo</a>
          </li>
        </ul>
      </nav>

      {/* Bên phải: Khu vực Thông tin người dùng [SCRUM-300] */}
      <div className="navbar-right">
        <UserInfo />
      </div>
    </header>
  );
}
