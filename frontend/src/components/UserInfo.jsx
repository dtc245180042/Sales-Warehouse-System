import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import './UserInfo.css';

export default function UserInfo() {
  const { user, loading, selectWarehouse, availableWarehouses, login } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Edge Case: Trạng thái đang tải dữ liệu (Loading / Skeleton loader)
  if (loading) {
    return (
      <div className="user-skeleton-container" aria-busy="true" aria-label="Đang tải thông tin người dùng">
        <div className="skeleton-avatar skeleton-shimmer" />
        <div className="skeleton-text-group">
          <div className="skeleton-name skeleton-shimmer" />
          <div className="skeleton-subtext skeleton-shimmer" />
        </div>
      </div>
    );
  }

  // 2. Edge Case: Dữ liệu trống / Chưa đăng nhập (Kiểm tra null/undefined)
  if (!user) {
    return (
      <div className="user-empty" aria-label="Chưa đăng nhập">
        <span style={{ fontSize: '13px', color: 'var(--text)' }}>Khách</span>
        <button
          type="button"
          className="btn-login-quick"
          onClick={() => login()}
          title="Đăng nhập lại tài khoản mẫu"
        >
          Đăng nhập
        </button>
      </div>
    );
  }

  // Lấy chữ cái viết tắt của tên để hiển thị Avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Xác định class màu cho vai trò người dùng
  const getRoleClass = (role) => {
    if (!role) return 'role-default';
    const r = role.toLowerCase();
    if (r.includes('admin') || r.includes('quản trị')) return 'role-admin';
    if (r.includes('quản lý') || r.includes('kho') || r.includes('manager')) return 'role-manager';
    if (r.includes('bán hàng') || r.includes('sales')) return 'role-sales';
    return 'role-default';
  };

  const hasWarehouse = Boolean(user.warehouse && user.warehouse.trim() !== '');

  return (
    <div className="user-info-container" ref={dropdownRef}>
      <div
        className="user-badge"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        title="Nhấp để đổi kho hoặc xem chi tiết"
        style={{ cursor: 'pointer' }}
      >
        {/* Avatar */}
        <div className="user-avatar" aria-hidden="true">
          {getInitials(user?.name)}
        </div>

        {/* Thông tin chính */}
        <div className="user-details">
          {/* Hàng trên: Tên người dùng và Vai trò */}
          <div className="user-primary-row">
            <span className="user-name" title={user?.name || 'Chưa đặt tên'}>
              {user?.name || 'Người dùng'}
            </span>
            <span className={`role-badge ${getRoleClass(user?.role)}`}>
              {user?.role || 'Chưa phân quyền'}
            </span>
          </div>

          {/* Hàng dưới: Kho / Địa bàn đang làm việc */}
          <div className="warehouse-info">
            {hasWarehouse ? (
              <div className="warehouse-selected" title={`Kho đang làm việc: ${user.warehouse}`}>
                <span className="warehouse-icon" aria-hidden="true">🏢</span>
                <span className="warehouse-name">{user.warehouse}</span>
              </div>
            ) : (
              <div
                className="warehouse-unselected"
                title="Cảnh báo: Bạn chưa chọn kho/địa bàn đang làm việc"
              >
                <span className="warning-icon" aria-hidden="true">⚠️</span>
                <span>Chưa chọn kho/địa bàn</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dropdown chuyển đổi nhanh kho/địa bàn làm việc */}
      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            backgroundColor: 'var(--bg, #ffffff)',
            border: '1px solid var(--border, #e5e4e7)',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            padding: '12px',
            width: '240px',
            zIndex: 1000,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-h)', marginBottom: '8px' }}>
            📍 Chọn kho / địa bàn làm việc:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {availableWarehouses.map((wh) => (
              <button
                key={wh}
                type="button"
                onClick={() => {
                  selectWarehouse(wh);
                  setDropdownOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: user.warehouse === wh ? '1px solid var(--accent, #aa3bff)' : '1px solid transparent',
                  backgroundColor: user.warehouse === wh ? 'var(--accent-bg, rgba(170, 59, 255, 0.1))' : 'transparent',
                  color: user.warehouse === wh ? 'var(--accent, #aa3bff)' : 'var(--text-h)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{wh}</span>
                {user.warehouse === wh && <span>✓</span>}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                selectWarehouse(null);
                setDropdownOpen(false);
              }}
              style={{
                marginTop: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px dashed #f59e0b',
                backgroundColor: '#fffbeb',
                color: '#b45309',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'center',
                fontWeight: 500,
              }}
              title="Đặt về trạng thái chưa chọn kho để kiểm tra"
            >
              ⚠️ Bỏ chọn kho (Test cảnh báo)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
