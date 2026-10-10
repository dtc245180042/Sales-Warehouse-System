import React, { useState, useMemo } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldCheck,
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
  Package,
  Users,
  Store,
  Receipt,
  PlusCircle,
  ShoppingCart,
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

interface MenuItem {
  title: string;
  path?: string;
  icon: React.ReactNode;
  allowedRoles: UserRole[];
  submenu?: {
    title: string;
    path: string;
    icon?: React.ReactNode;
    allowedRoles: UserRole[];
  }[];
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

  // Nếu có một đường dẫn khác có độ dài lớn hơn và match với URL hiện tại (VD: /orders/create khớp hơn /orders)
  // thì đường dẫn ngắn hơn không được coi là active
  const otherSiblingMatches = allSiblingPaths.some((siblingPath) => {
    const normSibling = normalizePath(siblingPath);
    return (
      normSibling !== normItem &&
      normSibling.length > normItem.length &&
      (normCurrent === normSibling || normCurrent.startsWith(normSibling + '/'))
    );
  });

  if (otherSiblingMatches) return false;

  // Match các sub-path chi tiết (ví dụ: /orders/123 hoặc /orders/OD-2026-0001 -> Quản lý đơn hàng vẫn active)
  return normCurrent.startsWith(normItem + '/');
};

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onMobileClose,
  isCollapsed,
}) => {
  const { role, user } = useAuth();
  const location = useLocation();
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  const toggleSubmenu = (key: string) => {
    setOpenSubmenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const ALL_ROLES: UserRole[] = [
    'Admin',
    'SalesManager',
    'SalesStaff',
    'WarehouseManager',
    'WarehouseStaff',
    'Accountant',
    'Director',
    'Manager',
    'Staff',
    'User',
  ];

  const menuSections: { heading?: string; items: MenuItem[] }[] = [
    {
      heading: 'BẢNG ĐIỀU KHIỂN',
      items: [
        {
          title: 'Tổng quan Dashboard',
          path: '/dashboard',
          icon: <LayoutDashboard className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
      ],
    },
    {
      heading: 'QUẢN LÝ BÁN HÀNG',
      items: [
        {
          title: 'Quản lý đơn hàng',
          path: '/orders',
          icon: <LayoutList className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
        {
          title: 'Tạo đơn hiện trường',
          path: '/orders/create',
          icon: <ShoppingCart className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
        {
          title: 'Bán hàng tại quầy (POS)',
          path: '/sales/pos',
          icon: <Store className="w-5 h-5" />,
          allowedRoles: ALL_ROLES.filter((r) => r !== 'User'),
        },
      ],
    },
    {
      heading: 'ĐỐI TÁC & CUNG ỨNG',
      items: [
        {
          title: 'Đại lý & Hạn mức công nợ',
          path: '/customers',
          icon: <Store className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
        {
          title: 'Nhà cung cấp',
          path: '/suppliers',
          icon: <Building2 className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
      ],
    },
    {
      heading: 'KHO & SẢN PHẨM',
      items: [
        {
          title: 'Sản phẩm',
          icon: <Boxes className="w-5 h-5" />,
          allowedRoles: [
            'Admin',
            'SalesManager',
            'SalesStaff',
            'WarehouseManager',
            'WarehouseStaff',
            'Director',
            'Manager',
            'Staff',
          ],
          submenu: [
            {
              title: 'Danh mục sản phẩm',
              path: '/products',
              icon: <LayoutList className="w-3.5 h-3.5" />,
              allowedRoles: [
                'Admin',
                'SalesManager',
                'SalesStaff',
                'WarehouseManager',
                'WarehouseStaff',
                'Director',
                'Manager',
                'Staff',
              ],
            },
            {
              title: 'Nhóm ngành hàng',
              path: '/categories',
              icon: <FolderTree className="w-3.5 h-3.5" />,
              allowedRoles: [
                'Admin',
                'SalesManager',
                'SalesStaff',
                'WarehouseManager',
                'WarehouseStaff',
                'Director',
                'Manager',
                'Staff',
              ],
            },
            {
              title: 'Đơn vị tính & Quy đổi',
              path: '/products/units',
              icon: <Scale className="w-3.5 h-3.5" />,
              allowedRoles: [
                'Admin',
                'SalesManager',
                'WarehouseManager',
                'Director',
                'Manager',
              ],
            },
          ],
        },
        {
          title: 'Bảng Giá & Chiết Khấu',
          path: '/price-lists',
          icon: <Tag className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
      ],
    },
    {
      heading: 'BÁO CÁO & PHÂN TÍCH',
      items: [
        {
          title: 'Báo cáo Bán hàng',
          path: '/reports/sales',
          icon: <BarChart3 className="w-5 h-5" />,
          allowedRoles: [
            'Admin',
            'SalesManager',
            'SalesStaff',
            'Director',
            'Accountant',
            'Manager',
            'Staff',
          ],
        },
        {
          title: 'Báo cáo Doanh thu & Công nợ',
          path: '/reports/revenue',
          icon: <TrendingUp className="w-5 h-5" />,
          allowedRoles: [
            'Admin',
            'SalesManager',
            'Director',
            'Accountant',
            'Manager',
          ],
        },
        {
          title: 'Báo cáo Tồn kho',
          path: '/reports/inventory',
          icon: <Package className="w-5 h-5" />,
          allowedRoles: [
            'Admin',
            'WarehouseManager',
            'WarehouseStaff',
            'Director',
            'Manager',
          ],
        },
      ],
    },
    {
      heading: 'HỆ THỐNG',
      items: [
        {
          title: 'Người dùng & Phân quyền',
          path: '/users',
          icon: <ShieldCheck className="w-5 h-5" />,
          allowedRoles: ['Admin'],
        },
        {
          title: 'Nhật ký thao tác',
          path: '/activity-log',
          icon: <ClipboardList className="w-5 h-5" />,
          allowedRoles: ['Admin'],
        },
        {
          title: 'Cài đặt hệ thống',
          path: '/settings',
          icon: <Settings className="w-5 h-5" />,
          allowedRoles: ALL_ROLES,
        },
      ],
    },
  ];

  const allTopLevelPaths = useMemo(() => {
    return menuSections
      .flatMap((s) => s.items.map((i) => i.path).filter(Boolean) as string[]);
  }, [menuSections]);

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

      {/* Nav Menu */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {menuSections.map((section, idx) => {
          const visibleItems = section.items.filter((item) => item.allowedRoles.includes(role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-1">
              {section.heading && !isCollapsed && (
                <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {section.heading}
                </p>
              )}
              {visibleItems.map((item, itemIdx) => {
                if (item.submenu) {
                  const allSubmenuPaths = item.submenu.map((s) => s.path);
                  const isAnySubActive = item.submenu.some((sub) =>
                    isNavItemActive(location.pathname, sub.path, allSubmenuPaths)
                  );
                  const isSubOpen = openSubmenus[item.title.toLowerCase()] ?? isAnySubActive;

                  return (
                    <div key={itemIdx} className="space-y-1">
                      <button
                        onClick={() => toggleSubmenu(item.title.toLowerCase())}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors outline-none focus:outline-none ${isAnySubActive
                            ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          }`}
                        title={isCollapsed ? item.title : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <span className="shrink-0">{item.icon}</span>
                          {!isCollapsed && <span>{item.title}</span>}
                        </div>
                        {!isCollapsed && (
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${isSubOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'
                              }`}
                          />
                        )}
                      </button>

                      {isSubOpen && !isCollapsed && (
                        <div className="pl-6 space-y-1 pt-1 border-l-2 border-slate-100 dark:border-slate-800 ml-5">
                          {item.submenu
                            .filter((sub) => sub.allowedRoles.includes(role))
                            .map((sub, sIdx) => {
                              const isActive = isNavItemActive(
                                location.pathname,
                                sub.path,
                                allSubmenuPaths
                              );

                              return (
                                <Link
                                  key={sIdx}
                                  to={sub.path}
                                  onClick={onMobileClose}
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all outline-none focus:outline-none ${isActive
                                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-none'
                                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                    }`}
                                  aria-current={isActive ? 'page' : undefined}
                                >
                                  {sub.icon}
                                  <span>{sub.title}</span>
                                </Link>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                }

                const isItemActive = isNavItemActive(location.pathname, item.path!, allTopLevelPaths);

                return (
                  <Link
                    key={itemIdx}
                    to={item.path!}
                    onClick={onMobileClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all outline-none focus:outline-none ${isItemActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                    title={isCollapsed ? item.title : undefined}
                    aria-current={isItemActive ? 'page' : undefined}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!isCollapsed && <span>{item.title}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Role & Location Badge Footer (SCRUM-203) */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
          {/* User name */}
          <div className="flex items-center gap-2">
            {user?.avatar && (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-6 h-6 rounded-full object-cover shrink-0"
              />
            )}
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {user?.name || 'Người dùng'}
            </span>
          </div>
          {/* Role badge */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Vai trò:</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${role === 'Admin'
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
          {/* Kho hoặc địa bàn (SCRUM-203) */}
          {(user?.warehouse || user?.territory) && (
            <div className="text-[11px] text-slate-400 truncate" title={user?.warehouse || user?.territory}>
              📍 {user?.warehouse || user?.territory}
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
        className={`hidden lg:block shrink-0 h-screen sticky top-0 transition-all duration-300 z-30 ${isCollapsed ? 'w-20' : 'w-64'
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
