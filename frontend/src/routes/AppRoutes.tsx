import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types/User';
import { getHomePathForRole } from '../utils/roleUtils';

// Auth pages (Sprint 1: SCRUM-198, SCRUM-200)
import { Login } from '../pages/auth/Login';
import { ForgotPassword } from '../pages/auth/ForgotPassword';
import { ResetPassword } from '../pages/auth/ResetPassword';
import { ErrorPage } from '../pages/error/ErrorPage';

// Core Dashboard & Management Pages (Sprint 1: SCRUM-198, SCRUM-201, SCRUM-202, SCRUM-205, SCRUM-206, SCRUM-207)
import { Dashboard } from '../pages/dashboard/Dashboard';
import { UserManagement } from '../pages/users/UserManagement';
import { Settings } from '../pages/settings/Settings';

// All 7 business roles allowed in Sprint 1 backoffice
const ALL_BACKOFFICE_ROLES: UserRole[] = [
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

// Smart root redirect based on Role (SCRUM-198)
const RootRedirect: React.FC = () => {
  const { role } = useAuth();
  return <Navigate to={getHomePathForRole(role)} replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      {/* Root redirect */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RootRedirect />
          </ProtectedRoute>
        }
      />

      {/* Redirect /admin to /users for Sprint 1 */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['Admin']}>
            <Navigate to="/users" replace />
          </ProtectedRoute>
        }
      />

      {/* ================================================================ */}
      {/* SPRINT 1 BACKOFFICE ROUTES                                       */}
      {/* ================================================================ */}
      <Route
        element={
          <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Tổng quan Dashboard - Phân quyền theo vai trò (SCRUM-198, SCRUM-202) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Quản lý Người dùng & Phân quyền - Chỉ Admin (SCRUM-205, SCRUM-206, SCRUM-207) */}
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />

        {/* Cài đặt & Bảo mật tài khoản / Đổi mật khẩu - Mọi vai trò (SCRUM-201) */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Fallback 404 Route - SCRUM-204 */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <ErrorPage code="404" />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};
