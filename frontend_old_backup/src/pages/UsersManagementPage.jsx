import React, { useState, useEffect, useCallback } from 'react';
import { usersApi } from '../api/client';
import { useAuth } from '../context';
import UserFormModal from '../components/UserFormModal';
import LockUserModal from '../components/LockUserModal';

export default function UsersManagementPage({ onShowToast }) {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bộ lọc tìm kiếm và phân trang
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [userToLock, setUserToLock] = useState(null);

  // Cảnh báo bàn giao đại lý
  const [handoverAlert, setHandoverAlert] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await usersApi.getUsers({
        q: keyword.trim(),
        role: roleFilter,
        is_active: statusFilter !== '' ? statusFilter === 'true' : '',
        page,
        page_size: 20,
      });

      if (res) {
        setUsers(res.items || []);
        setTotalPages(res.total_pages || 1);
        setTotalCount(res.total || 0);
      }
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  }, [keyword, roleFilter, statusFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUnlockUser = async (user) => {
    if (!window.confirm(`Bạn có chắc chắn muốn mở khóa cho tài khoản '${user.email}'?`)) {
      return;
    }

    try {
      const res = await usersApi.unlockUser(user.id);
      onShowToast(res.message || `Đã mở khóa tài khoản '${user.email}'.`, 'success');
      fetchUsers();
    } catch (err) {
      onShowToast(err.message || 'Không thể mở khóa tài khoản.', 'error');
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Tiêu đề & Nút Thêm mới */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
            Quản Lý Tài Khoản & Nhân Sự
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
            Cấp tài khoản, gán kho phụ trách, phân quyền và khóa tài khoản
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setUserToEdit(null);
            setIsFormModalOpen(true);
          }}
        >
          Thêm tài khoản mới
        </button>
      </div>

      {handoverAlert && (
        <div className="alert alert-warning" style={{ fontSize: '13px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>{handoverAlert}</div>
          <button
            onClick={() => setHandoverAlert(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#92400e', fontWeight: 'bold' }}
          >
            Đóng
          </button>
        </div>
      )}

      {/* Thanh Tìm Kiếm & Lọc */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <input
              type="text"
              className="form-input"
              placeholder="Tìm theo tên, email, số điện thoại..."
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <select
              className="form-select"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả vai trò</option>
              <option value="Admin">Admin</option>
              <option value="Sales Manager">Sales Manager</option>
              <option value="Sales Rep">Sales Rep</option>
              <option value="WH Manager">WH Manager</option>
              <option value="Warehouse">Warehouse</option>
              <option value="Accountant">Accountant</option>
              <option value="Customer">Customer</option>
            </select>
          </div>

          <div>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="true">Đang hoạt động</option>
              <option value="false">Đã bị khóa</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Bảng Danh Sách Phân Trang 20 Dòng / Trang */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Họ và Tên</th>
                <th>Địa chỉ Email</th>
                <th>Số Điện Thoại</th>
                <th>Vai Trò</th>
                <th>Kho Phụ Trách</th>
                <th>Trạng Thái</th>
                <th style={{ textAlign: 'right' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Đang tải danh sách tài khoản...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Không tìm thấy tài khoản nào phù hợp.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrentAdmin = currentUser && u.id === currentUser.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.full_name || u.email}</div>
                        {u.lock_reason && (
                          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>
                            Lý do khóa: {u.lock_reason}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', color: '#0f172a' }}>{u.email}</div>
                      </td>
                      <td>{u.phone_number || '-'}</td>
                      <td>
                        <span className={`badge ${getRoleBadgeClass(u.role)}`}>{u.role}</span>
                      </td>
                      <td>
                        {u.assigned_warehouse ? (
                          <span style={{ fontSize: '13px', color: '#0284c7' }}>
                            {u.assigned_warehouse}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '13px' }}>-</span>
                        )}
                      </td>
                      <td>
                        {u.is_active ? (
                          <span className="badge badge-active">Hoạt động</span>
                        ) : (
                          <span className="badge badge-locked">Đã bị khóa</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setUserToEdit(u);
                              setIsFormModalOpen(true);
                            }}
                          >
                            Chỉnh sửa
                          </button>

                          {u.is_active ? (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={isCurrentAdmin}
                              onClick={() => {
                                setUserToLock(u);
                                setIsLockModalOpen(true);
                              }}
                              title={isCurrentAdmin ? 'Không thể tự khóa tài khoản của chính mình' : 'Khóa tài khoản'}
                            >
                              Khóa
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ color: '#059669', borderColor: '#a7f3d0' }}
                              onClick={() => handleUnlockUser(u)}
                            >
                              Mở khóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh Phân Trang 20 Dòng / Trang */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            Hiển thị <strong>{users.length}</strong> / <strong>{totalCount}</strong> tài khoản (20 dòng/trang)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trang trước
            </button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Trang sau
            </button>
          </div>
        </div>
      </div>

      <UserFormModal
        isOpen={isFormModalOpen}
        userToEdit={userToEdit}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={(msg) => {
          onShowToast(msg, 'success');
          fetchUsers();
        }}
      />

      <LockUserModal
        isOpen={isLockModalOpen}
        user={userToLock}
        onClose={() => setIsLockModalOpen(false)}
        onSuccess={({ message, handoverWarning }) => {
          onShowToast(message, 'info');
          if (handoverWarning) {
            setHandoverAlert(handoverWarning);
          }
          fetchUsers();
        }}
      />
    </div>
  );
}
