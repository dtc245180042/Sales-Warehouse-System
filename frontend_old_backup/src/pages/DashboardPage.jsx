import React from 'react';
import { useAuth } from '../context';

export default function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  const roleDescriptions = {
    Admin: {
      title: 'Quản Trị Hệ Thống',
      desc: 'Quản lý tài khoản người dùng, phân quyền truy cập, gắn kho phụ trách và giám sát an ninh hệ thống.',
      actions: [
        { label: 'Quản lý Tài khoản & Nhân sự', href: '#/users' },
        { label: 'Báo cáo Giá vốn & Lợi nhuận', href: '#/financial' },
      ],
    },
    'Sales Manager': {
      title: 'Quản Lý Kinh Doanh & Phân Phối',
      desc: 'Giám sát hoạt động kinh doanh, chỉ tiêu bán hàng và được cấp quyền xem dữ liệu tài chính giá vốn và biên lợi nhuận.',
      actions: [
        { label: 'Báo cáo Giá vốn & Lợi nhuận', href: '#/financial' },
      ],
    },
    'Sales Rep': {
      title: 'Nhân Viên Kinh Doanh Thị Trường',
      desc: 'Phụ trách địa bàn và danh sách các đại lý phân phối, hỗ trợ đại lý và tạo đơn hàng.',
      actions: [],
    },
    'WH Manager': {
      title: 'Quản Lý Kho Hàng',
      desc: 'Điều phối hoạt động xuất nhập kho, quản lý định mức tồn an toàn tại kho phụ trách.',
      actions: [],
    },
    Warehouse: {
      title: 'Thủ Kho Vận Hành',
      desc: 'Thao tác trực tiếp tại kho được phân công, kiểm đếm số lượng thực tế khi xuất hàng.',
      actions: [],
    },
    Accountant: {
      title: 'Kế Toán Viên',
      desc: 'Theo dõi hạn mức công nợ đại lý, đối soát hóa đơn và chứng từ thanh toán.',
      actions: [],
    },
    Customer: {
      title: 'Cổng Đại Lý / Khách Hàng',
      desc: 'Xem danh mục sản phẩm, bảng giá đại lý và kiểm tra hạn mức mua hàng.',
      actions: [],
    },
  };

  const currentRoleInfo = roleDescriptions[user.role] || {
    title: user.role,
    desc: 'Người dùng hệ thống bán hàng và quản lý kho.',
    actions: [],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Banner Chào Mừng & Ngữ Cảnh Làm Việc */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          border: 'none',
          padding: '28px 32px',
          borderRadius: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Không Gian Làm Việc • {user.role}
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
              Xin chào, {user.full_name || user.email}!
            </h1>
            <p style={{ color: '#cbd5e1', fontSize: '14px', marginTop: '6px', maxWidth: '600px' }}>
              {currentRoleInfo.desc}
            </p>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              padding: '12px 18px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Địa bàn / Kho trực thuộc</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#38bdf8', marginTop: '2px' }}>
              {user.assigned_warehouse || 'Toàn bộ địa bàn'}
            </div>
          </div>
        </div>
      </div>

      {/* Thông tin hồ sơ tài khoản */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
            Thông Tin Tài Khoản
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
              <span style={{ color: '#64748b' }}>Họ và tên:</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{user.full_name || 'Chưa cập nhật'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
              <span style={{ color: '#64748b' }}>Email:</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{user.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
              <span style={{ color: '#64748b' }}>Số điện thoại:</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{user.phone_number || 'Chưa cập nhật'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
              <span style={{ color: '#64748b' }}>Trạng thái:</span>
              <span className="badge badge-active">Đang hoạt động</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
            Chức Năng Phân Quyền
          </h3>
          {currentRoleInfo.actions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {currentRoleInfo.actions.map((act) => (
                <a
                  key={act.href}
                  href={act.href}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '12px 16px', textAlign: 'left', textDecoration: 'none' }}
                >
                  <span style={{ fontWeight: 600 }}>{act.label}</span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.6 }}>
              Tài khoản của bạn đang hoạt động bình thường với vai trò <strong>{user.role}</strong>. 
              Các chức năng nghiệp vụ của bạn được hiển thị tương ứng trên thanh điều hướng bên trái.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
