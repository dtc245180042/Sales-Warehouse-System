import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  ShoppingBag,
  PlusCircle,
  Package,
  Bell,
  User,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface UserSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  onLogoutClick: () => void;
}

export const Sidebar: React.FC<UserSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onMobileClose,
  onLogoutClick,
}) => {
  const navigate = useNavigate();

  const navItems = [
    { title: 'Tổng quan', path: '/user/dashboard', icon: Home },
    { title: 'Sản phẩm', path: '/user/products', icon: ShoppingBag },
    { title: 'Tạo đơn hàng', path: '/user/orders/create', icon: PlusCircle },
    { title: 'Đơn hàng của tôi', path: '/user/orders', icon: Package },
    { title: 'Thông báo', path: '/user/notifications', icon: Bell },
    { title: 'Tài khoản', path: '/user/profile', icon: User },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <NavLink to="/user/dashboard" className="flex items-center gap-3">
          {/* SALEPRO Logo Badge */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
            <Warehouse className="w-5 h-5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-black text-lg tracking-wider text-slate-900 dark:text-white uppercase">
                SALE<span className="text-indigo-600 dark:text-indigo-400">PRO</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Staff Portal
              </span>
            </div>
          )}
        </NavLink>

        {/* Mobile Close Button */}
        {isMobileOpen && (
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => isMobileOpen && onMobileClose()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-indigo-600 dark:hover:text-indigo-400'
                } ${isCollapsed ? 'justify-center px-2' : ''}`
              }
              title={isCollapsed ? item.title : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>{item.title}</span>}
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Actions: Settings & Logout */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1 shrink-0">
        <NavLink
          to="/user/change-password"
          onClick={() => isMobileOpen && onMobileClose()}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all ${
              isActive
                ? 'bg-slate-100 dark:bg-slate-800 text-indigo-600 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            } ${isCollapsed ? 'justify-center px-2' : ''}`
          }
          title={isCollapsed ? 'Cài đặt mật khẩu' : undefined}
        >
          <Settings className="w-5 h-5 shrink-0 text-slate-400" />
          {!isCollapsed && <span>Cài đặt bảo mật</span>}
        </NavLink>

        <button
          onClick={onLogoutClick}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors ${
            isCollapsed ? 'justify-center px-2' : ''
          }`}
          title={isCollapsed ? 'Đăng xuất' : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span>Đăng xuất</span>}
        </button>

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:flex justify-end pt-2">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block fixed left-0 top-0 bottom-0 z-30 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 transition-opacity"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`lg:hidden fixed left-0 top-0 bottom-0 w-72 z-50 transition-transform duration-300 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};
