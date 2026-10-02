import React, { useState } from 'react';
import { useAuth } from '../context';

export default function ChangePasswordModal({ isOpen, onClose, onSuccess }) {
  const { changePassword } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!oldPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (!hasLetter || !hasNumber) {
      setError('Mật khẩu mới phải bao gồm cả chữ cái và số.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    if (newPassword === oldPassword) {
      setError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword(oldPassword, newPassword);
      onSuccess(res.message || 'Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được thu hồi.');
      onClose();
    } catch (err) {
      setError(err.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu cũ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">Đổi Mật Khẩu Cá Nhân</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
          >
            Đóng
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="alert alert-info" style={{ fontSize: '13px', marginBottom: '16px' }}>
              Mật khẩu mới cần tối thiểu 8 ký tự, có cả chữ và số.
              Sau khi đổi xong, toàn bộ các phiên đăng nhập khác trên thiết bị khác sẽ tự động bị thu hồi ngay lập tức.
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="form-group">
              <label className="form-label required">Mật khẩu hiện tại</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showOld ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Nhập mật khẩu đang sử dụng"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  style={{ paddingRight: '56px' }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowOld(!showOld)}
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
                  {showOld ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Mật khẩu mới</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Tối thiểu 8 ký tự, gồm cả chữ và số"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{ paddingRight: '56px' }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNew(!showNew)}
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
                  {showNew ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Xác nhận mật khẩu mới</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ paddingRight: '56px' }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm(!showConfirm)}
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
                  {showConfirm ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang xử lý...' : 'Cập nhật mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
