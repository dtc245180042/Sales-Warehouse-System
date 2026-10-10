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
import { ErrorBoundary } from '../components/common/ErrorBoundary';

// Core Dashboard & Management Pages (Sprint 1: SCRUM-198, SCRUM-201, SCRUM-202, SCRUM-205, SCRUM-206, SCRUM-207)
import { Dashboard } from '../pages/dashboard/Dashboard';
import { UserManagement } from '../pages/users/UserManagement';
import { UserImportPage } from '../pages/users/UserImportPage';
import { Settings } from '../pages/settings/Settings';
import { Profile } from '../pages/profile/Profile';
import { PriceListManagement } from '../pages/sales/PriceListManagement';
import { CategoryManagement } from '../pages/categories/CategoryManagement';

// Orders & Field Sales (SCRUM-230, S3-09)
import { CreateOrder } from '../pages/orders/CreateOrder';

// Supplier Management Pages (SCRUM-217)
import { SupplierList } from '../pages/suppliers/SupplierList';
import { SupplierDetail } from '../pages/suppliers/SupplierDetail';

// Customer & Agency Pages (Sprint 3: SC-224, SC-228, SC-229)
import { CustomerList } from '../pages/customers/CustomerList';
import { CustomerDetail } from '../pages/customers/CustomerDetail';

// Sales & Order Pages (SC-228, SC-230)
import { POS } from '../pages/sales/POS';
import { Orders } from '../pages/sales/Orders';
import { OrderDetail } from '../pages/sales/OrderDetail';

// Sprint 2 Pages - Activity Log (SCRUM-212)
import ActivityLogPage from '../pages/activitylog/ActivityLogPage';

// Product Catalog Pages (Sprint 2: SCRUM-220, SCRUM-380, SCRUM-381, SCRUM-215, SCRUM-216)
import { ProductList } from '../pages/products/ProductList';
import { ProductDetail } from '../pages/products/ProductDetail';
import { ProductCreate } from '../pages/products/ProductCreate';
import { ProductEdit } from '../pages/products/ProductEdit';
import { ProductUnitPage } from '../pages/products/ProductUnitPage';
import { ProductImportPage } from '../pages/products/ProductImportPage';

// Report Pages (Báo cáo bán hàng theo ngành hàng & Doanh thu)
import { SalesReport } from '../pages/reports/SalesReport';
import { RevenueReport } from '../pages/reports/RevenueReport';
import { InventoryReport } from '../pages/reports/InventoryReport';

// Agent & Sales Pages (SCRUM-229, SCRUM-230, SCRUM-347)
import { AgentList } from '../pages/agents/AgentList';
import { AgentOrderCreate } from '../pages/agents/AgentOrderCreate';

// Cổng Đại Lý B2B (S4-10, SCRUM-242)
import { PortalOrderPage } from '../pages/portal/PortalOrderPage';

// All 7 business roles allowed in Sprint 1 & 2 backoffice
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
      {/* SPRINT 1 & 2 BACKOFFICE ROUTES                                   */}
      {/* ================================================================ */}
      <Route
        element={
          <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
            <ErrorBoundary>
              <DashboardLayout />
            </ErrorBoundary>
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

        {/* Nhập người dùng hàng loạt từ Excel - SC-209 */}
        <Route
          path="/users/import"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <UserImportPage />
            </ProtectedRoute>
          }
        />

        {/* Quản lý Bảng giá theo nhóm khách hàng (SCRUM-420, SCRUM-421) */}
        <Route
          path="/price-lists"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <PriceListManagement />
            </ProtectedRoute>
          }
        />

        {/* Quản lý Nhóm hàng nhiều cấp - Quản lý kinh doanh & Admin (SCRUM-214) */}
        <Route
          path="/categories"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <ErrorBoundary>
                <CategoryManagement />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/categories"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <ErrorBoundary>
                <CategoryManagement />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Quản lý Nhà cung cấp (SCRUM-217) */}
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <SupplierList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <SupplierDetail />
            </ProtectedRoute>
          }
        />

        {/* Quản lý Khách hàng & Đại lý (SC-224, SC-228, SC-229) */}
        <Route
          path="/customers"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <CustomerList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <CustomerDetail />
            </ProtectedRoute>
          }
        />

        {/* Tạo đơn hiện trường Mobile 360px (SCRUM-230, S3-09) */}
        <Route
          path="/orders/create"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <CreateOrder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/pos"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <POS />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Orders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <OrderDetail />
            </ProtectedRoute>
          }
        />

        {/* Hồ sơ cá nhân - Xem và cập nhật họ tên, SĐT Việt Nam - Mọi vai trò (SCRUM-210, SCRUM-361) */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Profile />
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

        {/* Nhật ký thao tác - Chỉ Admin (Sprint 2 - SCRUM-212) */}
        <Route
          path="/activity-log"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <ActivityLogPage />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* DANH MỤC SẢN PHẨM (SCRUM-220, SCRUM-380, SCRUM-381)          */}
        {/* ============================================================ */}
        <Route
          path="/products"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'SalesStaff', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager', 'Staff']}>
              <ProductList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/new"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'WarehouseManager', 'Director', 'Manager']}>
              <ProductCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/create"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'WarehouseManager', 'Director', 'Manager']}>
              <ProductCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/units"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'WarehouseManager', 'Director', 'Manager']}>
              <ProductUnitPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/import"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'Director', 'Manager']}>
              <ProductImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/:id"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'SalesStaff', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager', 'Staff']}>
              <ProductDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/:id/edit"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'WarehouseManager', 'Director', 'Manager']}>
              <ProductEdit />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* BÁO CÁO & THỐNG KÊ DOANH SỐ THEO NGÀNH HÀNG                  */}
        {/* ============================================================ */}
        <Route
          path="/reports/sales"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'SalesStaff', 'Director', 'Accountant', 'Manager', 'Staff']}>
              <SalesReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/revenue"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'Director', 'Accountant', 'Manager']}>
              <RevenueReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/inventory"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager']}>
              <InventoryReport />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* KÊNH ĐẠI LÝ & TẠO ĐƠN (SCRUM-229, SCRUM-230, SCRUM-347)       */}
        {/* ============================================================ */}
        <Route
          path="/agents"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <AgentList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/orders/new"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <AgentOrderCreate />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* BÁN HÀNG & POS (SCRUM-347 / SCRUM-486)                       */}
        {/* ============================================================ */}
        <Route
          path="/sales/pos"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <POS />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pos"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <POS />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/orders"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Orders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Orders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/orders/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <OrderDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <OrderDetail />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Cổng Đại lý tự đặt hàng B2B 24/7 Mobile & Desktop (S4-10, SCRUM-242) */}
      <Route
        path="/portal/order"
        element={
          <ProtectedRoute allowedRoles={['Customer', 'User', 'Admin']}>
            <PortalOrderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal"
        element={<Navigate to="/portal/order" replace />}
      />

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
