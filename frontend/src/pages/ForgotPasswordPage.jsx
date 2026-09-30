import React, { useState } from 'react';
import { authApi } from '../api/client';

export default function ForgotPasswordPage() {
  const [activeStep, setActiveStep] = useState('request'); // 'request' | 'reset'

  // State cho Bước 1: Yêu cầu gửi link qua email
  const [email, setEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');

  // State cho Bước 2: Đặt lại mật khẩu với token
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setRequestLoading(true);
    setRequestMessage('');

    try {
      const res = await authApi.forgotPassword({ email: email.trim().toLowerCase() });
      setRequestMessage(
        res.message || 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn.'
      );
    } catch (err) {
      setRequestMessage('Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn.');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetMessage('');

    if (newPassword.length < 8) {
      setResetError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (!hasLetter || !hasNumber) {
      setResetError('Mật khẩu mới phải bao gồm cả chữ cái và số.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setResetLoading(true);

    try {
      const res = await authApi.resetPassword({
        token: resetToken.trim(),
        new_password: newPassword,
      });
      setResetMessage(res.message || 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
    } catch (err) {
      setResetError(err.message || 'Mã xác nhận không hợp lệ hoặc đã hết hạn.');
    } finally {
      setResetLoading(false);
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
          maxWidth: '480px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          padding: '36px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Khôi Phục Mật Khẩu</h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Quy trình cấp lại mật khẩu qua email
          </p>
        </div>

        {/* Tab chuyển đổi */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            padding: '4px',
            borderRadius: '6px',
            marginBottom: '20px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveStep('request')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: activeStep === 'request' ? '#ffffff' : 'transparent',
              color: activeStep === 'request' ? '#0f172a' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            1. Gửi yêu cầu qua Email
          </button>
          <button
            type="button"
            onClick={() => setActiveStep('reset')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: activeStep === 'reset' ? '#ffffff' : 'transparent',
              color: activeStep === 'reset' ? '#0f172a' : '#64748b',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            2. Nhập mã đặt lại mật khẩu
          </button>
        </div>

        {/* BƯỚC 1: FORM GỬI EMAIL */}
        {activeStep === 'request' && (
          <form onSubmit={handleRequestSubmit}>
            <div className="alert alert-info" style={{ fontSize: '13px' }}>
              Mã đặt lại mật khẩu sẽ có hiệu lực trong vòng 30 phút và chỉ sử dụng được một lần duy nhất.
            </div>

            {requestMessage && (
              <div className="alert alert-success" style={{ fontSize: '13px' }}>
                {requestMessage}
              </div>
            )}

            <div className="form-group">
              <label className="form-label required">Địa chỉ Email đã đăng ký</label>
              <input
                type="email"
                className="form-input"
                placeholder="nhanvien@warehouse.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={requestLoading}
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px' }}
              disabled={requestLoading}
            >
              {requestLoading ? 'Đang gửi yêu cầu...' : 'Gửi liên kết khôi phục'}
            </button>
          </form>
        )}

        {/* BƯỚC 2: FORM NHẬP TOKEN VÀ ĐẶT MẬT KHẨU MỚI */}
        {activeStep === 'reset' && (
          <form onSubmit={handleResetSubmit}>
            {resetMessage ? (
              <div className="alert alert-success" style={{ fontSize: '13px' }}>
                <div>{resetMessage}</div>
                <div style={{ marginTop: '12px' }}>
                  <a href="#/login" className="btn btn-primary btn-sm" style={{ display: 'inline-block' }}>
                    Đăng nhập ngay
                  </a>
                </div>
              </div>
            ) : (
              <>
                {resetError && <div className="alert alert-danger" style={{ fontSize: '13px' }}>{resetError}</div>}

                <div className="form-group">
                  <label className="form-label required">Mã Token xác nhận</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Dán mã token nhận được từ hệ thống hoặc email"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    disabled={resetLoading}
                    required
                    autoFocus
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    * Mã có hiệu lực trong 30 phút và chỉ sử dụng được một lần.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label required">Mật khẩu mới</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Tối thiểu 8 ký tự, gồm cả chữ và số"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={resetLoading}
                      required
                      style={{ paddingRight: '56px' }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNewPassword(!showNewPassword)}
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
                      }}
                    >
                      {showNewPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Xác nhận mật khẩu mới</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Nhập lại mật khẩu mới"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={resetLoading}
                      required
                      style={{ paddingRight: '56px' }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                      }}
                    >
                      {showConfirmPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '12px' }}
                  disabled={resetLoading}
                >
                  {resetLoading ? 'Đang cập nhật...' : 'Xác nhận đặt lại mật khẩu'}
                </button>
              </>
            )}
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <a
            href="#/login"
            style={{
              fontSize: '13px',
              color: '#2563eb',
              fontWeight: 500,
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            Quay lại màn hình đăng nhập
          </a>
        </div>
      </div>
    </div>
  );
}
