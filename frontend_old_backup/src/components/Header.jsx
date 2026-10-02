import React, { useState } from 'react';
import { useAuth } from '../context';

export default function Header({ onOpenChangePassword }) {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'Admin':
        return 'badge-admin';
      case 'Sales Manager':
        return 'badge-sales-manager';
      case 'Sales Rep':
        return 'badge-sales-rep';
      case 'WH Manager':
        return 'badge-wh-manager';
      case 'Warehouse':
        return 'badge-warehouse';
      case 'Accountant':
        return 'badge-accountant';
      default:
        return 'badge-customer';
    }
  };

  return (
    <header
      style={{
        height: '60px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Bên trái: Tên Hệ Thống (Đã bỏ nút Menu ở góc) */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <a href="#/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
            SALES & WAREHOUSE SYSTEM
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Hệ Thống Quản Lý Bán Hàng & Phân Phối Kho</div>
        </a>
      </div>

      {/* Bên phải: Khu vực Người dùng & Lối đi tới Đăng xuất */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: dropdownOpen ? '#f1f5f9' : '#ffffff',
                border: dropdownOpen ? '1px solid #94a3b8' : '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!dropdownOpen) e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                if (!dropdownOpen) e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              title="Nhấn để xem thông tin và Đăng xuất"
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                    {user.full_name || user.email}
                  </span>
                  <span className={`badge ${getRoleBadgeClass(user.role)}`}>{user.role}</span>
                </div>
                {user.assigned_warehouse && (
                  <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 500 }}>
                    {user.assigned_warehouse}
                  </span>
                )}
              </div>

              {/* Mũi tên chỉ thị menu */}
              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>
                {dropdownOpen ? '▲' : '▼'}
              </span>
            </button>

            {/* Menu Dropdown Người Dùng & Nút Đăng Xuất Nổi Bật */}
            {dropdownOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 60 }}
                  onClick={() => setDropdownOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    width: '260px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    boxShadow: '0 10px 20px -3px rgba(0, 0, 0, 0.15)',
                    padding: '8px 0',
                    zIndex: 70,
                  }}
                >
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Tài khoản đang đăng nhập
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', wordBreak: 'break-all', marginTop: '2px' }}>
                      {user.email}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenChangePassword();
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      fontSize: '13px',
                      color: '#334155',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    Đổi mật khẩu cá nhân
                  </button>

                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />

                  {/* Lối đi tới Đăng xuất: Gây chú ý rõ ràng, lịch sự, không phô trương */}
                  <div style={{ padding: '4px 8px' }}>
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                        window.location.hash = '#/login';
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        textAlign: 'left',
                        backgroundColor: '#fff1f2',
                        border: '1px solid #fecdd3',
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: '#be123c',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffe4e6';
                        e.currentTarget.style.borderColor = '#fda4af';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#fff1f2';
                        e.currentTarget.style.borderColor = '#fecdd3';
                      }}
                    >
                      <span>Đăng xuất hệ thống</span>
                      <span style={{ fontSize: '12px' }}>→</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
