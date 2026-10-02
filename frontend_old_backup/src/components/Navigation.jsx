import React from 'react';
import { useAuth } from '../context';

export default function Navigation({ currentRoute, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();

  if (!user) return null;

  const navItems = [
    {
      id: 'dashboard',
      href: '#/dashboard',
      label: 'Tổng quan không gian làm việc',
      roles: ['Admin', 'Sales Manager', 'Sales Rep', 'WH Manager', 'Warehouse', 'Accountant', 'Customer'],
    },
    {
      id: 'users',
      href: '#/users',
      label: 'Quản lý Tài khoản & Nhân sự',
      roles: ['Admin'],
    },
    {
      id: 'financial',
      href: '#/financial',
      label: 'Báo cáo Giá vốn & Lợi nhuận',
      roles: ['Admin', 'Sales Manager'],
    },
  ];

  const accessibleItems = navItems.filter((item) => item.roles.includes(user.role));

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Thông tin ngữ cảnh công tác */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
        }}
      >
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px' }}>
          Ngữ cảnh làm việc
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '4px' }}>
          {user.role}
        </div>
        <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '2px', fontWeight: 500 }}>
          {user.assigned_warehouse || 'Toàn hệ thống'}
        </div>
      </div>

      {/* Danh sách menu điều hướng bằng thẻ <a> */}
      <nav style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, padding: '0 8px 8px 8px' }}>
          Chức năng
        </div>

        {accessibleItems.map((item) => {
          const isActive = currentRoute === item.id;
          return (
            <a
              key={item.id}
              href={item.href}
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                backgroundColor: isActive ? '#eff6ff' : 'transparent',
                color: isActive ? '#1d4ed8' : '#334155',
                fontWeight: isActive ? 600 : 400,
                fontSize: '14px',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Chân trang điều hướng */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#94a3b8' }}>
        <div>Hệ thống Quản lý Bán hàng & Kho</div>
      </div>
    </div>
  );

  return (
    <>
      <aside
        style={{
          width: '260px',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'none',
          flexShrink: 0,
        }}
        className="desktop-sidebar"
      >
        {content}
      </aside>

      {mobileOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
          }}
        >
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(2px)',
            }}
            onClick={onCloseMobile}
          />

          <div
            style={{
              position: 'relative',
              width: '280px',
              maxWidth: '85vw',
              height: '100%',
              backgroundColor: '#ffffff',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              zIndex: 110,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInLeft 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <button
                type="button"
                onClick={onCloseMobile}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                Đóng
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>{content}</div>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar {
            display: block !important;
          }
        }
      `}</style>
    </>
  );
}
