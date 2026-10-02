import React, { useState, useEffect } from 'react';
import { usersApi } from '../api/client';
import { useAuth } from '../context';

const WAREHOUSE_LIST = [
  'Kho Tổng Hà Nội',
  'Kho Trung Chuyển Đà Nẵng',
  'Kho Phân Phối TP.HCM',
  'Kho Cần Thơ',
];

const ROLES_LIST = [
  { value: 'Admin', label: 'Quản trị viên (Admin)' },
  { value: 'Sales Manager', label: 'Quản lý kinh doanh (Sales Manager)' },
  { value: 'Sales Rep', label: 'Nhân viên kinh doanh (Sales Rep)' },
  { value: 'WH Manager', label: 'Quản lý kho (WH Manager)' },
  { value: 'Warehouse', label: 'Thủ kho (Warehouse Staff)' },
  { value: 'Accountant', label: 'Kế toán viên (Accountant)' },
  { value: 'Customer', label: 'Đại lý / Khách hàng (Customer)' },
];

export default function UserFormModal({ isOpen, userToEdit, onClose, onSuccess }) {
  const { user: currentUser } = useAuth();
  const isEdit = !!userToEdit;

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone_number: '',
    role: 'Customer',
    assigned_warehouse: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userToEdit) {
      setFormData({
        email: userToEdit.email || '',
        full_name: userToEdit.full_name || '',
        phone_number: userToEdit.phone_number || '',
        role: userToEdit.role || 'Customer',
        assigned_warehouse: userToEdit.assigned_warehouse || '',
        password: '',
      });
    } else {
      setFormData({
        email: '',
        full_name: '',
        phone_number: '',
        role: 'Customer',
        assigned_warehouse: '',
        password: '',
      });
    }
    setError('');
  }, [userToEdit, isOpen]);

  if (!isOpen) return null;

  const isWarehouseRole = formData.role === 'Warehouse' || formData.role === 'WH Manager';
  const isEditingSelf = isEdit && currentUser && userToEdit.id === currentUser.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isWarehouseRole && !formData.assigned_warehouse) {
      setError('Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho cụ thể.');
      return;
    }

    if (isEditingSelf && formData.role !== 'Admin') {
      setError('Bạn không thể tự thu hồi vai trò Quản trị viên của chính mình.');
      return;
    }

    setLoading(true);

    try {
      if (isEdit) {
        const updatePayload = {
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          role: formData.role,
          assigned_warehouse: formData.assigned_warehouse || null,
        };
        const updated = await usersApi.updateUser(userToEdit.id, updatePayload);
        onSuccess(`Cập nhật tài khoản '${updated.email}' thành công.`);
      } else {
        const emailClean = formData.email.trim();
        const createPayload = {
          username: emailClean, // Sử dụng chính email làm username định danh
          email: emailClean,
          full_name: formData.full_name.trim(),
          phone_number: formData.phone_number.trim(),
          role: formData.role,
          assigned_warehouse: formData.assigned_warehouse || null,
          password: formData.password ? formData.password : null,
        };
        const created = await usersApi.createUser(createPayload);
        onSuccess(
          `Tạo tài khoản '${created.email}' thành công. ${
            !formData.password ? 'Hệ thống đã cấp mật khẩu tạm và gửi email kích hoạt.' : ''
          }`
        );
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Thao tác không thành công.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit ? `Chỉnh Sửa Tài Khoản: ${userToEdit.email}` : 'Thêm Mới Tài Khoản'}
          </h3>
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
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="form-group">
              <label className="form-label required">Địa chỉ Email đăng nhập</label>
              <input
                type="email"
                className="form-input"
                placeholder="nhanvien@warehouse.local"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isEdit}
                required
                autoFocus={!isEdit}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Họ và tên đầy đủ</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nguyễn Văn A"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Số điện thoại</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0901234567"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label required">Vai trò hệ thống</label>
                <select
                  className="form-select"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  disabled={isEditingSelf}
                >
                  {ROLES_LIST.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {isEditingSelf && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    * Bạn không thể tự thu hồi quyền Admin của chính mình.
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className={`form-label ${isWarehouseRole ? 'required' : ''}`}>
                  Kho phụ trách {isWarehouseRole ? '(Bắt buộc)' : ''}
                </label>
                <select
                  className="form-select"
                  value={formData.assigned_warehouse}
                  onChange={(e) => setFormData({ ...formData, assigned_warehouse: e.target.value })}
                  required={isWarehouseRole}
                >
                  <option value="">Chọn kho làm việc</option>
                  {WAREHOUSE_LIST.map((wh) => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
                {isWarehouseRole && (
                  <span style={{ fontSize: '11px', color: '#d97706' }}>
                    * Người dùng thuộc vai trò kho bắt buộc phải gắn ít nhất 1 kho cụ thể.
                  </span>
                )}
              </div>
            </div>

            {!isEdit && (
              <div className="form-group">
                <label className="form-label">Mật khẩu khởi tạo</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Để trống nếu muốn hệ thống tự tạo mật khẩu tạm"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
