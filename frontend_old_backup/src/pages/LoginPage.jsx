import React, { useState } from 'react';
import { useAuth } from '../context';

export default function LoginPage({ onLoginSuccess }) {
  const { login, sessionAlert, clearSessionAlert } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLocked15Min, setIsLocked15Min] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setErrorMessage('');
    clearSessionAlert();

    try {
      await login(email.trim(), password);
      if (onLoginSuccess) {
        onLoginSuccess();
      }
      window.location.hash = '#/dashboard';
    } catch (err) {
      if (err.status === 403 && err.message?.includes('15 phút')) {
        setIsLocked15Min(true);
        setErrorMessage('Tài khoản đã bị tạm khóa trong 15 phút do nhập sai mật khẩu 5 lần liên tiếp.');
      } else if (err.status === 403) {
        setErrorMessage(err.message || 'Tài khoản đã bị vô hiệu hóa hoặc bị khóa bởi quản trị viên.');
      } else {
        setErrorMessage(err.message || 'Địa chỉ email hoặc mật khẩu không chính xác.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        padding: '20px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          padding: '40px 36px',
        }}
      >
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Hệ Thống Quản Lý Bán Hàng & Kho
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>
            Đăng nhập tài khoản làm việc
          </p>
        </div>

        {sessionAlert && (
          <div className="alert alert-warning" style={{ fontSize: '13px' }}>
            {sessionAlert}
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-danger" style={{ fontSize: '13px' }}>
            {errorMessage}
          </div>
        )}

        {isLocked15Min && (
          <div className="alert alert-warning" style={{ fontSize: '13px' }}>
            Vui lòng chờ 15 phút trước khi thử lại hoặc liên hệ quản trị viên để được hỗ trợ.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Ô 1: Địa chỉ Email */}
          <div className="form-group">
            <label className="form-label required">Địa chỉ Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="nhanvien@warehouse.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || isLocked15Min}
              required
              autoFocus
              tabIndex={1}
            />
          </div>

          {/* Ô 2: Mật khẩu kèm nút Hiện/Ẩn (tabIndex={-1} để phím Tab vẫn xuống thẳng Quên mật khẩu) */}
          <div className="form-group">
            <label className="form-label required">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || isLocked15Min}
                required
                tabIndex={2}
                style={{ paddingRight: '56px' }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '12px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  fontWeight: 600,
                  userSelect: 'none',
                }}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>

          {/* Hàng phụ trợ: Quên mật khẩu */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              marginBottom: '20px',
              marginTop: '-4px',
            }}
          >
            <a
              href="#/forgot-password"
              tabIndex={3}
              style={{
                fontSize: '13px',
                color: '#2563eb',
                textDecoration: 'none',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Quên mật khẩu?
            </a>
          </div>

          {/* Nút Đăng nhập */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px', fontSize: '15px' }}
            disabled={loading || isLocked15Min}
            tabIndex={4}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#94a3b8' }}>
          Cổng thông tin nghiệp vụ nội bộ
        </div>
      </div>
    </div>
  );
}
