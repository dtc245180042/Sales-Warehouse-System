import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context';
import Header from './components/Header';
import Navigation from './components/Navigation';
import ChangePasswordModal from './components/ChangePasswordModal';
import Toast from './components/Toast';

// Các màn hình
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import UsersManagementPage from './pages/UsersManagementPage';
import FinancialReportPage from './pages/FinancialReportPage';
import ErrorPage from './pages/ErrorPage';

function AppContent() {
  const { user, isAuthenticated, loading } = useAuth();

  const getRouteFromHash = () => {
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    return hash || 'dashboard';
  };

  const [currentRoute, setCurrentRoute] = useState(getRouteFromHash);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Thông báo đăng nhập thành công (nền xanh lá hơi nhạt, xuyên thấu, 2 giây, không bo góc, nút X)
  const [loginSuccessToast, setLoginSuccessToast] = useState(false);

  // Toast chung khác
  const [toast, setToast] = useState({ message: '', type: 'info' });

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(getRouteFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const triggerLoginSuccess = () => {
    setLoginSuccessToast(true);
    setTimeout(() => {
      setLoginSuccessToast(false);
    }, 2000);
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast({ message: '', type: 'info' });
    }, 4500);
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          color: '#64748b',
          fontSize: '15px',
          fontWeight: 500,
        }}
      >
        Đang khởi tạo phiên làm việc an toàn...
      </div>
    );
  }

  // 1. Khi chưa đăng nhập
  if (!isAuthenticated) {
    if (currentRoute === 'forgot-password') {
      return <ForgotPasswordPage />;
    }
    return <LoginPage onLoginSuccess={triggerLoginSuccess} />;
  }

  // Nếu đã đăng nhập nhưng URL là login hoặc forgot-password -> đưa về dashboard
  if (currentRoute === 'login' || currentRoute === 'forgot-password') {
    window.location.hash = '#/dashboard';
  }

  // 2. Khi đã đăng nhập
  const renderCurrentPage = () => {
    switch (currentRoute) {
      case 'dashboard':
        return <DashboardPage />;

      case 'users':
        if (user.role !== 'Admin') {
          return (
            <ErrorPage
              statusCode={403}
              title="Truy Cập Bị Từ Chối"
              message="Chức năng Quản lý Người dùng & Nhân sự chỉ dành riêng cho tài khoản Quản trị viên (Admin)."
              onAction={() => (window.location.hash = '#/dashboard')}
              actionLabel="Quay lại Bảng điều khiển"
            />
          );
        }
        return <UsersManagementPage onShowToast={showToast} />;

      case 'financial':
        if (user.role !== 'Sales Manager' && user.role !== 'Admin') {
          return (
            <ErrorPage
              statusCode={403}
              title="Không Đủ Quyền Truy Cập Dữ Liệu Giá Vốn"
              message="Dữ liệu giá vốn và biên lợi nhuận chỉ dành riêng cho Quản lý kinh doanh (Sales Manager) và Quản trị viên (Admin)."
              onAction={() => (window.location.hash = '#/dashboard')}
              actionLabel="Quay lại Bảng điều khiển"
            />
          );
        }
        return <FinancialReportPage onNavigateDashboard={() => (window.location.hash = '#/dashboard')} />;

      default:
        return (
          <ErrorPage
            statusCode={404}
            title="Không Tìm Thấy Trang"
            message="Đường dẫn bạn yêu cầu không tồn tại trong hệ thống."
            onAction={() => (window.location.hash = '#/dashboard')}
            actionLabel="Quay lại Trang chủ"
          />
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header onOpenChangePassword={() => setIsChangePasswordOpen(true)} />

      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        <Navigation currentRoute={currentRoute} />

        <main style={{ flex: 1, padding: '24px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {renderCurrentPage()}
        </main>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={(msg) => showToast(msg, 'success')}
      />

      {/* Thông báo đăng nhập thành công: nền xanh lá hơi nhạt, xuyên thấu, 2 giây, không bo góc, nút X */}
      {loginSuccessToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            backgroundColor: 'rgba(220, 252, 231, 0.85)',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(134, 239, 172, 0.8)',
            color: '#166534',
            padding: '10px 16px',
            borderRadius: 0,
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
          }}
        >
          <span>Đăng nhập thành công</span>
          <button
            type="button"
            onClick={() => setLoginSuccessToast(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#166534',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              fontWeight: 700,
              lineHeight: 1,
            }}
            title="Đóng thông báo"
          >
            X
          </button>
        </div>
      )}

      {toast.message && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}