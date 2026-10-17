import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeNames: Record<string, string> = {
  dashboard: 'Bảng Điều Khiển',
  products: 'Sản Phẩm',
  create: 'Thêm Mới',
  edit: 'Chỉnh Sửa',
  inventory: 'Quản Lý Kho',
  'stock-in': 'Nhập Kho',
  'stock-out': 'Xuất Kho',
  'stock-takes': 'Kiểm Kê Kho Hàng',
  history: 'Lịch Sử Giao Dịch',
  sales: 'Bán Hàng',
  pos: 'Điểm Bán Hàng (POS)',
  orders: 'Đơn Hàng',
  customers: 'Khách Hàng',
  suppliers: 'Nhà Cung Cấp',
  reports: 'Báo Cáo',
  revenue: 'Doanh Thu',
  'agency-debts': 'Sổ Công Nợ Theo Đại Lý',
  'debt-aging': 'Phân Tích Tuổi Nợ',
  'sales-multidim': 'Doanh Số Đa Chiều',
  'inventory-turnover': 'Vòng Quay Tồn Kho',
  'volume-discounts': 'Chiết Khấu Sản Lượng',
  targets: 'Chỉ Tiêu Doanh Số',
  progress: 'Tiến Độ Doanh Số',
  invoices: 'Hóa Đơn Bán Hàng',
  payments: 'Phiếu Thu Công Nợ',
  returns: 'Phiếu Trả Hàng',
  'credit-notes': 'Chứng Từ Giảm Nợ',
  lots: 'Quản Lý Lô Hàng',
  dispatches: 'Điều Phối Xuất Kho',
  backorders: 'Nợ Hàng & Giao Bù',
  adjustments: 'Điều Chỉnh Tồn Kho',
  users: 'Người Dùng & Phân Quyền',
  settings: 'Cài Đặt Hệ Thống',
  profile: 'Hồ Sơ Cá Nhân',
  categories: 'Nhóm Hàng & Ngành Hàng',
  'activity-log': 'Nhật Ký Thao Tác',
  'price-lists': 'Bảng Giá Phân Phối',
  units: 'Đơn Vị Tính & Quy Đổi',
  'price-history': 'Lịch Sử Thay Đổi Giá',
  transfers: 'Chuyển Kho Nội Bộ',
  overview: 'Tổng Quan Tồn Kho',
  portal: 'Cổng Đại Lý B2B',
  import: 'Nhập Excel',
  new: 'Thêm Mới',
  agents: 'Đại Lý',
};

export const Breadcrumb: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Link
        to="/dashboard"
        className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Trang chủ</span>
      </Link>

      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        let name = routeNames[value] || value;

        if (value.startsWith('PCK-')) {
          name = `Phiếu ${value}`;
        } else if (value.startsWith('TRF-')) {
          name = `Phiếu ${value.replace('TRF-', 'PCK-')}`;
        } else if (pathnames[index - 1] === 'stock-takes') {
          if (value === 'create' || value === 'new') {
            name = 'Tạo Phiếu Kiểm Kê';
          } else {
            name = 'Phiếu Kiểm Kê';
          }
        } else if (pathnames[index - 1] === 'adjustments') {
          if (value === 'create' || value === 'new') {
            name = 'Tạo Phiếu Điều Chỉnh';
          } else {
            name = 'Phiếu Điều Chỉnh';
          }
        } else if (pathnames[index - 1] === 'reports' && value === 'inventory') {
          name = 'Báo Cáo Tồn Kho';
        } else if (pathnames[index - 1] === 'reports' && value === 'sales') {
          name = 'Báo Cáo Bán Hàng';
        } else if (typeof name === 'string' && name.startsWith('STK-TAKE-')) {
          name = name.replace('STK-TAKE-', 'PKK-2026-');
        }

        return (
          <React.Fragment key={to}>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px] sm:max-w-none">
                {name}
              </span>
            ) : (
              <Link
                to={to}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-[120px] sm:max-w-none"
              >
                {name}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
