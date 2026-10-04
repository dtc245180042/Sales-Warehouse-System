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
  history: 'Lịch Sử Giao Dịch',
  sales: 'Bán Hàng',
  pos: 'Điểm Bán Hàng (POS)',
  orders: 'Đơn Hàng',
  customers: 'Khách Hàng',
  suppliers: 'Nhà Cung Cấp',
  reports: 'Báo Cáo',
  revenue: 'Doanh Thu',
  users: 'Người Dùng & Phân Quyền',
  settings: 'Cài Đặt Hệ Thống',
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
        const name = routeNames[value] || value;

        return (
          <React.Fragment key={to}>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px] sm:max-w-none">
                {name}
              </span>
            ) : (
              <Link
                to={to}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-[100px] sm:max-w-none"
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
