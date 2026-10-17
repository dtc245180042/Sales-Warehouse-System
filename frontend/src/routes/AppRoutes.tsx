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
import { DebtRiskConfigPage } from '../pages/settings/DebtRiskConfigPage';
import { Profile } from '../pages/profile/Profile';
import { PriceListManagement } from '../pages/sales/PriceListManagement';
import { VolumeDiscountManagementPage } from '../pages/sales/VolumeDiscountManagementPage';
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
import { PriceHistoryPage } from '../pages/products/PriceHistoryPage';

// Report Pages (Báo cáo bán hàng theo ngành hàng & Doanh thu)
import { SalesReport } from '../pages/reports/SalesReport';
import { RevenueReport } from '../pages/reports/RevenueReport';
import { InventoryReport } from '../pages/reports/InventoryReport';
import { SalesMultiDimReport } from '../pages/reports/SalesMultiDimReport';
import { InventoryTurnoverReport } from '../pages/reports/InventoryTurnoverReport';
import { AgencyDebtAgingReport } from '../pages/reports/AgencyDebtAgingReport';

// Inventory & Stock Ledger & Stock Take Pages
import { InventoryOverview } from '../pages/inventory/InventoryOverview';
import { StockIn } from '../pages/inventory/StockIn';
import { StockOut } from '../pages/inventory/StockOut';
import { InventoryHistory } from '../pages/inventory/InventoryHistory';
import { StockTakeList } from '../pages/inventory/StockTakeList';
import { StockTakeCreate } from '../pages/inventory/StockTakeCreate';
import { StockTakeDetail } from '../pages/inventory/StockTakeDetail';

// Cổng Đại Lý B2B (S4-10, SCRUM-242 & S5-01, SCRUM-243)
import { PortalOrderPage } from '../pages/portal/PortalOrderPage';
import { PortalOrdersPage } from '../pages/portal/PortalOrdersPage';

// Kho & Chuyển kho nội bộ (S5-07, EP-05, SCRUM-574, SCRUM-576, SCRUM-577, SCRUM-578)
import { StockTransferList } from '../pages/inventory/StockTransferList';
import { StockTransferCreate } from '../pages/inventory/StockTransferCreate';
import { StockTransferDetail } from '../pages/inventory/StockTransferDetail';

// Quản lý lô hàng & Xuất kho điều phối
import { LotManagementPage } from '../pages/inventory/LotManagementPage';
import { StockDispatchListPage } from '../pages/inventory/StockDispatchListPage';
import { BackorderListPage } from '../pages/inventory/BackorderListPage';

// Hóa đơn VAT & Phiếu thu công nợ
import { InvoiceListPage } from '../pages/invoices/InvoiceListPage';
import { PaymentListPage } from '../pages/payments/PaymentListPage';

// Trả hàng & Giảm nợ
import { ReturnListPage } from '../pages/returns/ReturnListPage';
import { CreditNoteListPage } from '../pages/credit-notes/CreditNoteListPage';

// Điều chỉnh tồn kho & Duyệt phiếu (SCRUM-274: SCRUM-790, SCRUM-794)
import { StockAdjustList } from '../pages/inventory/StockAdjustList';
import { StockAdjustCreate } from '../pages/inventory/StockAdjustCreate';
import { StockAdjustDetail } from '../pages/inventory/StockAdjustDetail';

// Quản lý chỉ tiêu doanh số & Tiến độ (SCRUM-275: SCRUM-802, SCRUM-803, SCRUM-805)
import { SalesTargetManagement } from '../pages/sales/SalesTargetManagement';
import { SalesTargetProgress } from '../pages/sales/SalesTargetProgress';

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

        {/* Quản lý Chính sách chiết khấu sản lượng - Quản lý kinh doanh & Admin (SCRUM-347) */}
        <Route
          path="/volume-discounts"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'Director']}>
              <VolumeDiscountManagementPage />
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

        {/* Cấu hình Quy tắc Rủi ro & Chặn bán Công nợ */}
        <Route
          path="/settings/debt-risk"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <DebtRiskConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/debt-risk-config"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <DebtRiskConfigPage />
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
          path="/products/price-history"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'SalesStaff', 'Accountant', 'Director', 'Manager']}>
              <PriceHistoryPage />
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
        {/* KHO & CHUYỂN KHO NỘI BỘ (S5-07, EP-05, SCRUM-574 - 578)       */}
        {/* ============================================================ */}
        <Route
          path="/inventory"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InventoryOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/overview"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InventoryOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/transfers"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockTransferList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/transfers/create"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockTransferCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/transfers/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockTransferDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-in"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockIn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-out"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockOut />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/history"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InventoryHistory />
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
            <ProtectedRoute allowedRoles={['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager', 'Accountant']}>
              <InventoryReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/sales-multidim"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'Director', 'Manager', 'Accountant', 'SalesStaff']}>
              <SalesMultiDimReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/inventory-turnover"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager', 'Accountant']}>
              <InventoryTurnoverReport />
            </ProtectedRoute>
          }
        />
        {/* Sổ công nợ theo đại lý & Phân tích tuổi nợ (Story S7-03) */}
        <Route
          path="/reports/agency-debts"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'Director', 'Accountant', 'Manager', 'SalesStaff']}>
              <AgencyDebtAgingReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/debt-aging"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'SalesManager', 'Director', 'Accountant', 'Manager', 'SalesStaff']}>
              <AgencyDebtAgingReport />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* QUẢN LÝ KHO HÀNG, SỔ TỒN KHO 3 CỘT & KIỂM KÊ (S5-08)         */}
        {/* ============================================================ */}
        <Route
          path="/inventory"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InventoryOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/overview"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InventoryOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-in"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockIn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-out"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockOut />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/history"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InventoryHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-takes"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockTakeList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-takes/create"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager']}>
              <StockTakeCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-takes/new"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager']}>
              <StockTakeCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-takes/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockTakeDetail />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* ĐIỀU CHỈNH TỒN KHO & DUYỆT PHIẾU (SCRUM-274: SCRUM-790/794) */}
        {/* ============================================================ */}
        <Route
          path="/inventory/adjustments"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockAdjustList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/adjustments/create"
          element={
            <ProtectedRoute allowedRoles={['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager']}>
              <StockAdjustCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/adjustments/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockAdjustDetail />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* HỢP NHẤT ĐẠI LÝ & KHÁCH HÀNG (EP-03) - REDIRECT TƯƠNG THÍCH   */}
        {/* ============================================================ */}
        <Route
          path="/agents"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Navigate to="/customers" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/:id"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Navigate to="/customers" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/orders/new"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <Navigate to="/orders/create" replace />
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

        {/* ============================================================ */}
        {/* QUẢN LÝ LÔ HÀNG & ĐIỀU PHỐI XUẤT KHO                         */}
        {/* ============================================================ */}
        <Route
          path="/inventory/lots"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <LotManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/dispatches"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <StockDispatchListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/backorders"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <BackorderListPage />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* HÓA ĐƠN BÁN HÀNG & PHIẾU THU CÔNG NỢ                         */}
        {/* ============================================================ */}
        <Route
          path="/invoices"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <InvoiceListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <PaymentListPage />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* TRẢ HÀNG & CHỨNG TỪ GIẢM NỢ                                  */}
        {/* ============================================================ */}
        <Route
          path="/returns"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <ReturnListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/credit-notes"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <CreditNoteListPage />
            </ProtectedRoute>
          }
        />

        {/* ============================================================ */}
        {/* QUẢN LÝ CHỈ TIÊU & TIẾN ĐỘ DOANH SỐ (SCRUM-275: 802, 803, 805) */}
        {/* ============================================================ */}
        <Route
          path="/sales/targets"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <SalesTargetManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/targets/progress"
          element={
            <ProtectedRoute allowedRoles={ALL_BACKOFFICE_ROLES}>
              <SalesTargetProgress />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Cổng Đại lý tự đặt hàng B2B 24/7 Mobile & Desktop (SCRUM-242) */}
      <Route
        path="/portal/order"
        element={
          <ProtectedRoute allowedRoles={['Customer', 'User', 'Admin']}>
            <PortalOrderPage />
          </ProtectedRoute>
        }
      />
      {/* Theo dõi đơn hàng của đại lý (S5-01, SCRUM-243) */}
      <Route
        path="/portal/orders"
        element={
          <ProtectedRoute allowedRoles={['Customer', 'User', 'Admin']}>
            <PortalOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal"
        element={<Navigate to="/portal/orders" replace />}
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
