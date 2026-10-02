import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/user/Sidebar';
import { Header } from '../components/user/Header';
import { Modal } from '../components/user/Modal';
import { UserCartProvider } from '../contexts/UserCartContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const UserLayout: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleConfirmLogout = async () => {
    try {
      await logout();
      showToast('Đã đăng xuất khỏi hệ thống thành công.', 'info');
      navigate('/login');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLogoutModalOpen(false);
    }
  };

  return (
    <UserCartProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors">
        {/* Sidebar Component */}
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          isMobileOpen={isMobileOpen}
          onMobileClose={() => setIsMobileOpen(false)}
          onLogoutClick={() => setIsLogoutModalOpen(true)}
        />

        {/* Main Content Area */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
            isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          }`}
        >
          {/* Header Component */}
          <Header
            onToggleMobile={() => setIsMobileOpen(true)}
            onLogoutClick={() => setIsLogoutModalOpen(true)}
          />

          {/* Page Outlet */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>

        {/* Logout Confirmation Modal */}
        <Modal
          isOpen={isLogoutModalOpen}
          onClose={() => setIsLogoutModalOpen(false)}
          title="Xác nhận đăng xuất"
          maxWidth="sm"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/25 transition-colors"
              >
                Đăng xuất ngay
              </button>
            </div>
          }
        >
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Bạn có chắc chắn muốn đăng xuất khỏi tài khoản nhân viên bán hàng hiện tại không?
          </div>
        </Modal>
      </div>
    </UserCartProvider>
  );
};
