import React, { useState } from 'react';
import { usersApi } from '../api/client';

export default function LockUserModal({ isOpen, user, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const isSalesPerson = user.role === 'Sales Rep' || user.role === 'Sales Manager';

  const handleLock = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Bắt buộc phải ghi rõ lý do khóa tài khoản.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await usersApi.lockUser(user.id, { reason: reason.trim() });
      onSuccess({
        message: res.message || `Đã khóa tài khoản '${user.email}'.`,
        handoverWarning: res.handover_warning,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Không thể khóa tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title" style={{ color: '#dc2626' }}>
            Khóa Tài Khoản: {user.full_name || user.email}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
          >
            Đóng
          </button>
        </div>

        <form onSubmit={handleLock}>
          <div className="modal-body">
            {isSalesPerson && (
              <div className="alert alert-warning" style={{ fontSize: '13px' }}>
                <strong>Cảnh báo bàn giao:</strong> Người dùng này thuộc bộ phận Kinh doanh (
                <strong>{user.role}</strong>) đang phụ trách danh sách đại lý trên địa bàn. Khi tài khoản bị khóa, các
                đại lý phụ trách cần được bàn giao ngay cho nhân sự khác.
              </div>
            )}

            <div className="alert alert-danger" style={{ fontSize: '13px' }}>
              Tài khoản bị khóa sẽ không thể đăng nhập và toàn bộ phiên đăng nhập đang
              mở phía máy chủ sẽ bị thu hồi ngay lập tức.
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <div className="form-group">
              <label className="form-label required">Lý do khóa tài khoản</label>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="Nhập chi tiết lý do khóa (Ví dụ: Nhân viên nghỉ việc từ ngày 01/10/2026, vi phạm chính sách...)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                autoFocus
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                * Bắt buộc ghi rõ lý do để lưu vào nhật ký hệ thống.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-danger" disabled={loading}>
              {loading ? 'Đang thực hiện...' : 'Xác nhận khóa tài khoản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
