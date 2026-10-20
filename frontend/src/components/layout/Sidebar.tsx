import React, { useState, useMemo, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  Settings,
  FolderTree,
  ChevronDown,
  X,
  Building2,
  ClipboardList,
  Boxes,
  Scale,
  LayoutList,
  Tag,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  Store,
  ShoppingCart,
  Warehouse,
  Layers,
  ArrowLeftRight,
  ClipboardCheck,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  RotateCcw,
  FileCheck2,
  FileText,
  CreditCard,
  Truck,
  CalendarClock,
  Target,
  AlertOctagon,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types/User';
import { Logo } from '../common/Logo';
import { getRoleDisplayName } from '../../utils/roleUtils';

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface SubMenuItem {
  title: string;
  path: string;
  icon?: React.ReactNode;
  allowedRoles: UserRole[];
}

interface MenuGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  allowedRoles: UserRole[];
  path?: string; // Nếu là single item (như Dashboard)
  items?: SubMenuItem[];
}

const normalizePath = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

const isNavItemActive = (
  currentPath: string,
  itemPath: string,
  allSiblingPaths: string[]
): boolean => {
  const normCurrent = normalizePath(currentPath);
  const normItem = normalizePath(itemPath);

  if (normCurrent === normItem) return true;

  const otherSiblingMatches = allSiblingPaths.some((siblingPath) => {
    const normSibling = normalizePath(siblingPath);
    return (
      normSibling !== normItem &&
      normSibling.length > normItem.length &&
      (normCurrent === normSibling || normCurrent.startsWith(normSibling + '/'))
    );
  });

  if (otherSiblingMatches) return false;

  return normCurrent.startsWith(normItem + '/');
};

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onMobileClose,
  isCollapsed,
}) => {
  const { role, user } = useAuth();
  const location = useLocation();

  // Danh sách các vai trò chuẩn hóa
  const ALL_STAFF_ROLES: UserRole[] = [
    'Admin',
    'SalesManager',
    'SalesStaff',
    'WarehouseManager',
    'WarehouseStaff',
    'Accountant',
    'Director',
    'Manager',
    'Staff',
  ];

  // Cấu trúc Menu Accordion thu gọn thông minh & Phân quyền RBAC nghiêm ngặt
  const menuGroups = useMemo<MenuGroup[]>(() => [
    {
      id: 'dashboard',
      title: 'Tổng quan Dashboard',
      path: '/dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      allowedRoles: [...ALL_STAFF_ROLES, 'User', 'Customer'],
    },
    {
      id: 'sales',
      title: 'Kinh Doanh & Bán Hàng',
      icon: <ShoppingCart className="w-5 h-5" />,
      allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Accountant', 'Customer', 'User'],
      items: [
        {
          title: 'Quản lý đơn hàng',
          path: '/orders',
          icon: <LayoutList className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Accountant', 'Customer', 'User'],
        },
        {
          title: 'Tạo đơn hàng mới',
          path: '/orders/create',
          icon: <ShoppingCart className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Customer', 'User'],
        },
        {
          title: 'Bán hàng tại quầy (POS)',
          path: '/sales/pos',
          icon: <Store className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Staff'],
        },
        {
          title: 'Bảng giá & Khách hàng',
          path: '/price-lists',
          icon: <Tag className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Accountant'],
        },
        {
          title: 'Chiết khấu sản lượng',
          path: '/volume-discounts',
          icon: <TrendingDown className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager'],
        },
        {
          title: 'Chỉ tiêu doanh số (KPI)',
          path: '/sales/targets',
          icon: <Target className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff'],
        },
        {
          title: 'Tiến độ doanh số',
          path: '/sales/targets/progress',
          icon: <TrendingUp className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff'],
        },
      ],
    },
    {
      id: 'finance',
      title: 'Tài Chính & Công Nợ',
      icon: <CreditCard className="w-5 h-5" />,
      allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager', 'SalesStaff', 'Customer', 'User'],
      items: [
        {
          title: 'Hóa đơn bán hàng VAT',
          path: '/invoices',
          icon: <FileText className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager', 'Customer', 'User'],
        },
        {
          title: 'Phiếu thu công nợ',
          path: '/payments',
          icon: <CreditCard className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant'],
        },
        {
          title: 'Phiếu trả hàng',
          path: '/returns',
          icon: <RotateCcw className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager', 'SalesStaff'],
        },
        {
          title: 'Chứng từ giảm nợ (Credit)',
          path: '/credit-notes',
          icon: <FileCheck2 className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager'],
        },
        {
          title: 'Sổ chi tiết công nợ',
          path: '/customers/debt-ledger',
          icon: <FileSpreadsheet className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager', 'SalesStaff', 'Customer', 'User'],
        },
        {
          title: 'Quy tắc rủi ro & Chặn bán',
          path: '/settings/debt-risk',
          icon: <ShieldAlert className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager'],
        },
      ],
    },
    {
      id: 'warehouse',
      title: 'Kho & Hàng Hóa',
      icon: <Warehouse className="w-5 h-5" />,
      allowedRoles: [
        'Admin',
        'Director',
        'Manager',
        'WarehouseManager',
        'WarehouseStaff',
        'SalesManager',
        'SalesStaff',
        'Customer',
        'User',
      ],
      items: [
        {
          title: 'Danh mục sản phẩm',
          path: '/products',
          icon: <Boxes className="w-4 h-4" />,
          allowedRoles: ALL_STAFF_ROLES.concat(['Customer', 'User']),
        },
        {
          title: 'Nhóm hàng & Ngành hàng',
          path: '/categories',
          icon: <FolderTree className="w-4 h-4" />,
          allowedRoles: ALL_STAFF_ROLES,
        },
        {
          title: 'Đơn vị tính & Quy đổi',
          path: '/products/units',
          icon: <Scale className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'SalesManager'],
        },
        {
          title: 'Lịch sử thay đổi giá',
          path: '/products/price-history',
          icon: <History className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'Accountant'],
        },
        {
          title: 'Sổ tồn kho 3 cột',
          path: '/inventory',
          icon: <Layers className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff', 'SalesManager'],
        },
        {
          title: 'Quản lý lô & Hạn dùng (FEFO)',
          path: '/inventory/lots',
          icon: <CalendarClock className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Phiếu soạn hàng (Picking)',
          path: '/inventory/picking-lists',
          icon: <ClipboardList className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Phiếu xuất kho điều phối',
          path: '/inventory/dispatches',
          icon: <Truck className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Nợ hàng & Giao bù',
          path: '/inventory/backorders',
          icon: <RotateCcw className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff', 'SalesManager'],
        },
        {
          title: 'Chuyển kho nội bộ',
          path: '/inventory/transfers',
          icon: <ArrowLeftRight className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Nhập kho nhà cung cấp',
          path: '/inventory/stock-in',
          icon: <ArrowDownLeft className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Xuất kho hàng hóa',
          path: '/inventory/stock-out',
          icon: <ArrowUpRight className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Kiểm kê kho hàng',
          path: '/inventory/stock-takes',
          icon: <ClipboardCheck className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
        {
          title: 'Điều chỉnh tồn kho',
          path: '/inventory/adjustments',
          icon: <AlertOctagon className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager'],
        },
        {
          title: 'Lịch sử thẻ kho',
          path: '/inventory/history',
          icon: <History className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff'],
        },
      ],
    },
    {
      id: 'partners',
      title: 'Đối Tác & Đại Lý',
      icon: <Store className="w-5 h-5" />,
      allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Accountant', 'WarehouseManager'],
      items: [
        {
          title: 'Đại lý & Hạn mức nợ',
          path: '/customers',
          icon: <Store className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Accountant'],
        },
        {
          title: 'Nhà cung cấp',
          path: '/suppliers',
          icon: <Building2 className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'SalesManager'],
        },
      ],
    },
    {
      id: 'reports',
      title: 'Báo Cáo & Phân Tích',
      icon: <BarChart3 className="w-5 h-5" />,
      allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'WarehouseManager', 'Accountant'],
      items: [
        {
          title: 'Báo cáo Bán hàng',
          path: '/reports/sales',
          icon: <BarChart3 className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'SalesStaff', 'Accountant'],
        },
        {
          title: 'Báo cáo Doanh thu & Công nợ',
          path: '/reports/revenue',
          icon: <TrendingUp className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'Accountant'],
        },
        {
          title: 'Sổ công nợ theo đại lý',
          path: '/reports/agency-debts',
          icon: <Scale className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'Accountant', 'SalesStaff'],
        },
        {
          title: 'Công nợ Quá hạn (Aging)',
          path: '/reports/debt-aging',
          icon: <TrendingDown className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'Accountant', 'SalesManager', 'SalesStaff'],
        },
        {
          title: 'Báo cáo Tồn kho',
          path: '/reports/inventory',
          icon: <Package className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'WarehouseStaff', 'Accountant'],
        },
        {
          title: 'Vòng quay Tồn kho (DSI)',
          path: '/reports/inventory-turnover',
          icon: <RotateCcw className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'WarehouseManager', 'Accountant'],
        },
        {
          title: 'Doanh số Đa chiều',
          path: '/reports/sales-multidim',
          icon: <Layers className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director', 'Manager', 'SalesManager', 'Accountant'],
        },
      ],
    },
    {
      id: 'system',
      title: 'Cài Đặt & Quản Trị',
      icon: <Settings className="w-5 h-5" />,
      allowedRoles: ['Admin', 'Director'],
      items: [
        {
          title: 'Người dùng & Phân quyền',
          path: '/users',
          icon: <ShieldCheck className="w-4 h-4" />,
          allowedRoles: ['Admin'],
        },
        {
          title: 'Nhật ký thao tác (Audit)',
          path: '/activity-log',
          icon: <ClipboardList className="w-4 h-4" />,
          allowedRoles: ['Admin'],
        },
        {
          title: 'Cài đặt hệ thống',
          path: '/settings',
          icon: <Settings className="w-4 h-4" />,
          allowedRoles: ['Admin', 'Director'],
        },
      ],
    },
  ], []);

  // Lọc các group và sub-items theo role của người dùng hiện tại
  const visibleGroups = useMemo(() => {
    return menuGroups
      .filter((group) => group.allowedRoles.includes(role))
      .map((group) => {
        if (!group.items) return group;
        const visibleSubItems = group.items.filter((item) => item.allowedRoles.includes(role));
        return {
          ...group,
          items: visibleSubItems,
        };
      })
      .filter((group) => !group.items || group.items.length > 0);
  }, [menuGroups, role]);

  // Quản lý trạng thái đóng/mở của từng Accordion
  // Tự động mở accordion của mục đang active trên URL hiện tại
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Tìm xem group nào đang chứa route hiện tại
    const activeGroupId = visibleGroups.find((g) => {
      if (g.path && normalizePath(location.pathname) === normalizePath(g.path)) return false;
      if (g.items) {
        return g.items.some((sub) => {
          const allSiblingPaths = g.items!.map((i) => i.path);
          return isNavItemActive(location.pathname, sub.path, allSiblingPaths);
        });
      }
      return false;
    })?.id;

    if (activeGroupId) {
      setOpenGroups((prev) => ({
        ...prev,
        [activeGroupId]: true,
      }));
    }
  }, [location.pathname, visibleGroups]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const allTopLevelPaths = useMemo(() => {
    return visibleGroups.map((g) => g.path).filter(Boolean) as string[];
  }, [visibleGroups]);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <NavLink to="/dashboard" className="flex items-center gap-2">
          <Logo size="md" showText={!isCollapsed} />
        </NavLink>
        {isMobileOpen && (
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav Menu Gọn Gàng Dạng Accordion */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 custom-scrollbar">
        {visibleGroups.map((group) => {
          // Trường hợp 1: Nhóm chỉ có 1 link duy nhất (như Dashboard)
          if (group.path) {
            const isItemActive = isNavItemActive(location.pathname, group.path, allTopLevelPaths);
            return (
              <Link
                key={group.id}
                to={group.path}
                onClick={onMobileClose}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all outline-none ${
                  isItemActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                title={isCollapsed ? group.title : undefined}
                aria-current={isItemActive ? 'page' : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className="shrink-0">{group.icon}</span>
                  {!isCollapsed && <span>{group.title}</span>}
                </div>
              </Link>
            );
          }

          // Trường hợp 2: Accordion cha chứa danh sách con
          const allSubPaths = group.items ? group.items.map((i) => i.path) : [];
          const isAnyChildActive = group.items
            ? group.items.some((sub) => isNavItemActive(location.pathname, sub.path, allSubPaths))
            : false;
          const isOpen = openGroups[group.id] ?? isAnyChildActive;

          return (
            <div key={group.id} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all outline-none ${
                  isAnyChildActive
                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                title={isCollapsed ? group.title : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 ${isAnyChildActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                    {group.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="truncate">{group.title}</span>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="flex items-center gap-1.5">
                    {group.items && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {group.items.length}
                      </span>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'
                      }`}
                    />
                  </div>
                )}
              </button>

              {/* Submenu khi Accordion mở */}
              {isOpen && !isCollapsed && group.items && (
                <div className="pl-4 pr-1 space-y-0.5 pt-1 pb-1 border-l-2 border-indigo-100 dark:border-indigo-900/40 ml-4 animate-fadeIn">
                  {group.items.map((sub) => {
                    const isActive = isNavItemActive(location.pathname, sub.path, allSubPaths);
                    return (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        onClick={onMobileClose}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/40'
                        }`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}>
                          {sub.icon}
                        </span>
                        <span className="truncate">{sub.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Role & User Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'NV'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {user?.name || user?.username || 'Người dùng'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                    role === 'Admin'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                      : role === 'Director'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                      : role === 'SalesManager' || role === 'SalesStaff'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : role === 'WarehouseManager' || role === 'WarehouseStaff'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                      : role === 'Accountant'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {getRoleDisplayName(role)}
                </span>
              </div>
            </div>
          </div>
          {(user?.warehouse || user?.territory) && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-1 flex items-center gap-1">
              <span>📍</span>
              <span className="truncate">{user?.warehouse || user?.territory}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 h-screen sticky top-0 transition-all duration-300 z-30 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="relative w-72 max-w-[85%] h-full z-10 animate-slide-right">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
