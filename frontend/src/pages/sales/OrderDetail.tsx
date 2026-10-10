import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  FileDown,
  Copy,
  Ban,
  CheckCircle2,
  Clock,
  Truck,
  CreditCard,
  User,
  MapPin,
  Phone,
  Calendar,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { OrderLifecycleTimeline } from '../../components/sales/OrderLifecycleTimeline';
import { orderService } from '../../services/orderService';
import { Order, OrderStatus } from '../../types/Order';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

import { customerLockService } from '../../services/customerLockService';
import { OrderPrintModal } from '../../components/orders/OrderPrintModal';

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, role } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCustomerLocked, setIsCustomerLocked] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Phân quyền theo vai trò (RBAC S4-05, SCRUM-203, SCRUM-498):
  const isManagerOrAdmin = ['Admin', 'Director', 'SalesManager', 'Manager', 'Accountant'].includes(role);
  const isWarehouseRole = ['Admin', 'Director', 'WarehouseManager', 'WarehouseStaff'].includes(role);
  const isSalesStaff = role === 'SalesStaff' || role === 'Staff';

  // 1. Phê duyệt đơn vượt hạn mức (pending_approval): Chỉ Quản lý kinh doanh, Ban giám đốc, Kế toán, Admin
  const canApproveCredit = isManagerOrAdmin;

  // 2. Xác nhận đơn hàng thông thường (pending): Quản lý kinh doanh, Giám đốc, Admin, Quản lý kho
  const canConfirmOrder = ['Admin', 'Director', 'SalesManager', 'Manager', 'WarehouseManager'].includes(role);

  // 3. Xuất kho & Bắt đầu giao hàng (confirmed -> shipping): Bộ phận Kho, Quản lý, Admin
  const canShipOrder = isWarehouseRole || ['Admin', 'Director', 'SalesManager'].includes(role);

  // 4. Xác nhận giao thành công (shipping -> completed): Bộ phận Kho, Kế toán, Quản lý
  const canCompleteOrder = isWarehouseRole || isManagerOrAdmin;

  // 5. Hủy đơn hàng: Quản lý hoặc Nhân viên lập đơn (chỉ khi đơn chưa xuất kho)
  const isOrderOwner = Boolean(user && (user.name === order?.staffName || String(user.id) === String(order?.staffId)));
  const canCancelOrder = isManagerOrAdmin || (isSalesStaff && isOrderOwner && ['draft', 'pending', 'pending_approval'].includes(order?.status || ''));

  const loadOrder = async () => {
    if (!id) return;
    try {
      const data = await orderService.getById(id);
      if (data) {
        setOrder(data);
        if (data.customerIsLocked) {
          setIsCustomerLocked(true);
        } else if (data.customerId) {
          try {
            const lockStatus = await customerLockService.getStatus(data.customerId);
            if (lockStatus?.isLocked) {
              setIsCustomerLocked(true);
            }
          } catch {}
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id]);

  const handleUpdateStatus = async (nextStatus: OrderStatus) => {
    if (!order) return;
    try {
      const updated = await orderService.updateStatus(order.id, nextStatus);
      setOrder(updated);
      showToast(`Đã chuyển trạng thái đơn hàng sang "${nextStatus}"`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Lỗi cập nhật trạng thái', 'error');
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    try {
      const updated = await orderService.cancelOrder(order.id);
      setOrder(updated);
      showToast('Đã hủy đơn hàng thành công', 'success');
      setIsCancelModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi hủy đơn hàng', 'error');
    }
  };

  const handleCopyOrder = async () => {
    if (!order || isCopying) return;
    setIsCopying(true);
    try {
      const res = await orderService.copyOrder(order.id);
      setIsCopyModalOpen(false);

      if (res.warnings && res.warnings.length > 0) {
        res.warnings.forEach((warn) => showToast(warn, 'warning'));
      }
      showToast(`Đã sao chép sang đơn nháp mới ${res.order.code}`, 'success');

      // Điều hướng sang trang tạo đơn với draftId của đơn mới
      navigate(`/orders/create?draftId=${encodeURIComponent(res.order.id)}`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi sao chép đơn hàng', 'error');
    } finally {
      setIsCopying(false);
    }
  };

  if (loading) return <Loading text="Đang tải chi tiết đơn hàng..." />;
  if (!order) {
    return (
      <EmptyState
        title="Không tìm thấy đơn hàng"
        description="Mã đơn hàng không tồn tại."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/orders')}
      />
    );
  }

  const steps: { key: OrderStatus; label: string; icon: any }[] = [
    ...(order.status === 'pending_approval' || order.requiresApproval
      ? [{ key: 'pending_approval' as OrderStatus, label: 'Chờ duyệt công nợ', icon: ShieldAlert }]
      : []),
    { key: 'pending', label: 'Chờ xử lý', icon: Clock },
    { key: 'confirmed', label: 'Đã xác nhận', icon: CheckCircle2 },
    { key: 'shipping', label: 'Đang giao hàng', icon: Truck },
    { key: 'completed', label: 'Đã giao thành công', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === order.status);

  return (
    <PageContainer
      title={`Chi Tiết Đơn Hàng: ${order.code}`}
      subtitle={`Ngày tạo: ${formatDate(order.createdAt)} | Phụ trách: ${order.staffName}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/orders">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            leftIcon={<Printer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          >
            In / Lưu PDF
          </Button>
          {(!user || ['admin', 'sales manager', 'sales rep', 'salesstaff', 'salesmanager', 'staff', 'manager'].includes((user.role || '').toLowerCase())) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCopyModalOpen(true)}
              isLoading={isCopying}
              disabled={isCopying}
              leftIcon={<Copy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            >
              Sao chép đơn
            </Button>
          )}
          {canCancelOrder && order.status !== 'cancelled' && order.status !== 'completed' && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsCancelModalOpen(true)}
              leftIcon={<Ban className="w-4 h-4" />}
            >
              Hủy đơn
            </Button>
          )}
        </div>
      }
    >
      {/* Banner Cảnh báo đơn chờ duyệt do vượt hạn mức công nợ (S4-02 / SCRUM-498 / SCRUM-501) */}
      {(order.status === 'pending_approval' || order.requiresApproval) && (
        <div
          id="order-credit-approval-alert"
          className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 flex items-start gap-3.5 shadow-sm"
        >
          <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm">
            <h4 className="font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
              ĐƠN HÀNG CẦN PHÊ DUYỆT CÔNG NỢ
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 font-semibold text-amber-800 dark:text-amber-200">
                Vượt hạn mức tín dụng
              </span>
            </h4>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              {order.approvalReason ||
                'Đơn hàng này khiến tổng dư nợ của đại lý vượt quá hạn mức công nợ được cấp. Đơn đang ở trạng thái Chờ duyệt trước khi được xác nhận và xuất kho.'}
            </p>
          </div>
        </div>
      )}

      {/* Banner Cảnh báo đại lý bị khoá giao dịch */}
      {(order.customerIsLocked || isCustomerLocked) && (
        <div
          id="order-customer-locked-alert"
          className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 flex items-start gap-3.5 shadow-sm"
        >
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm">
            <h4 className="font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
              CẢNH BÁO: ĐẠI LÝ ĐANG BỊ KHOÁ GIAO DỊCH
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 font-semibold text-amber-800 dark:text-amber-200">
                Đơn dở vẫn được xử lý tiếp
              </span>
            </h4>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              {order.customerLockWarning ||
                `Đại lý '${order.customerName}' hiện đang bị khoá giao dịch. Theo quy định, đơn hàng đã tạo này vẫn được phép tiếp tục đóng gói, giao hàng hoặc hoàn tất, nhưng không thể tạo đơn mới.`}
            </p>
          </div>
        </div>
      )}

      {/* SCRUM-238 (S4-06): Tiến trình vòng đời đơn hàng trực quan và phân nhánh */}
      <div className="mb-6">
        <OrderLifecycleTimeline
          order={order}
          onUpdateStatus={(st) => handleUpdateStatus(st)}
          onRequestCancel={() => setIsCancelModalOpen(true)}
        />
      </div>

      {/* Order Status Timeline Tracker */}
      {order.status !== 'cancelled' ? (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">
            Tiến Trình Đơn Hàng
          </h3>
          <div className="relative flex items-center justify-between max-w-3xl mx-auto">
            {/* Background line */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700 -translate-y-1/2 z-0" />
            {steps.map((step, idx) => {
              const isPast = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const Icon = step.icon;

              return (
                <div key={step.key} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md ${
                      isPast
                        ? step.key === 'pending_approval'
                          ? 'bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-950'
                          : 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-xs mt-2 font-bold whitespace-nowrap ${
                      isCurrent
                        ? step.key === 'pending_approval'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                        : isPast
                        ? 'text-slate-800 dark:text-slate-200'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick status change buttons & Role Notice */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            {order.status === 'pending_approval' && (
              canApproveCredit ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleUpdateStatus('confirmed')}
                    leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    Phê duyệt đơn hàng (Vượt hạn mức)
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setIsCancelModalOpen(true)}
                    leftIcon={<Ban className="w-4 h-4" />}
                  >
                    Từ chối duyệt / Hủy đơn
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-medium">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Đơn hàng vượt hạn mức công nợ, đang chờ Quản lý kinh doanh hoặc Ban giám đốc phê duyệt.</span>
                  <span>
                    {order.approvalReason
                      ? `Lý do cần duyệt: ${order.approvalReason}`
                      : 'Đơn hàng có sản phẩm dưới giá sàn hoặc vượt hạn mức công nợ, đang chờ Quản lý kinh doanh hoặc Ban giám đốc phê duyệt.'}
                  </span>
                </div>
              )
            )}

            {order.status === 'pending' && (
              canConfirmOrder ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleUpdateStatus('confirmed')}
                >
                  Xác nhận đơn hàng
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-medium">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Đơn hàng đã được tạo thành công, đang chờ Quản lý xác nhận để tiến hành xuất kho.</span>
                </div>
              )
            )}

            {order.status === 'confirmed' && (
              canShipOrder ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleUpdateStatus('shipping')}
                  leftIcon={<Truck className="w-4 h-4" />}
                >
                  Bắt đầu giao hàng
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Đơn hàng đã được xác nhận, đang chờ bộ phận Kho xuất kho và giao hàng.</span>
                </div>
              )
            )}

            {order.status === 'shipping' && (
              canCompleteOrder ? (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleUpdateStatus('completed')}
                >
                  Xác nhận đã giao thành công
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200 font-medium">
                  <Truck className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Đơn hàng đang trong quá trình vận chuyển đến đại lý.</span>
                </div>
              )
            )}

            {order.status === 'completed' && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Đơn hàng đã hoàn thành giao nhận thành công.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 mb-6 flex items-center gap-3 text-rose-700 dark:text-rose-300 text-sm font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Đơn hàng này đã bị hủy bỏ. Sản phẩm đã được hoàn trả lại kho lưu trữ.</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Products in Order (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Danh Sách Sản Phẩm Đã Mua
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3">Sản phẩm</th>
                    <th className="pb-3 text-center">Đơn giá</th>
                    <th className="pb-3 text-center">Số lượng</th>
                    <th className="pb-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {order.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-3">
                        <p className="font-bold text-slate-900 dark:text-slate-100">{it.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-400 font-mono">SKU: {it.sku}</span>
                          {(it.isBelowFloor || it.is_below_floor) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                              Dưới giá sàn {it.floorPrice || it.floor_price ? `(${formatCurrency(it.floorPrice || it.floor_price || 0)})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-center font-medium">
                        <div>{formatCurrency(it.price)}</div>
                        {(it.floorPrice || it.floor_price) ? (
                          <div className="text-[10px] text-slate-400 font-normal">
                            Sàn: {formatCurrency(it.floorPrice || it.floor_price || 0)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 text-center font-bold">{it.quantity}</td>
                      <td className="py-3 text-right font-black text-slate-900 dark:text-white">
                        {formatCurrency(it.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Customer & Financials (1 col) */}
        <div className="space-y-6">
          {/* Creator / Staff info (SCRUM-362, SCRUM-364, SCRUM-367) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" />
              Người Lập Đơn Hàng
            </h3>
            <div className="flex items-center gap-3.5 pt-1">
              <img
                src={
                  user && (user.name === order.staffName || String(user.id) === String(order.staffId)) && user.avatar
                    ? user.avatar
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(order.staffName)}&background=6366f1&color=fff&size=128`
                }
                alt={order.staffName}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-500/30 shadow-md shrink-0"
              />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {order.staffName}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    Nhân viên bán hàng
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({order.staffId})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Customer info */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" />
              Thông Tin Khách Hàng
            </h3>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{order.customerName}</p>
              <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{order.customerPhone}</span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{order.customerAddress || 'Nhận tại quầy'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Payment summary */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              Tổng Kết Thanh Toán
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tạm tính hàng hóa:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(order.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Chiết khấu / Giảm giá:</span>
                <span className="text-rose-600 font-semibold">
                  -{formatCurrency(order.discount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Thuế giá trị gia tăng (VAT):</span>
                <span>+{formatCurrency(order.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white">
                <span>TỔNG THANH TOÁN:</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(order.total)}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1 text-slate-500">
                <span>Phương thức:</span>
                <span className="font-bold uppercase text-slate-800 dark:text-slate-200">
                  {order.paymentMethod}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancel}
        title="Xác nhận hủy đơn hàng"
        message="Bạn có chắc chắn muốn hủy đơn hàng này? Toàn bộ số lượng sản phẩm sẽ được hoàn trả về tồn kho."
        confirmText="Hủy đơn"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={isCopyModalOpen}
        onClose={() => !isCopying && setIsCopyModalOpen(false)}
        onConfirm={handleCopyOrder}
        title="Xác nhận sao chép đơn hàng"
        message={`Bạn có chắc chắn muốn sao chép đơn hàng "${order.code}"? Hệ thống sẽ tạo một đơn nháp mới và tự động tính lại đơn giá & chiết khấu theo bảng giá hiện hành.`}
        confirmText={isCopying ? "Đang sao chép..." : "Sao chép thành đơn nháp"}
        cancelText="Đóng"
        variant="info"
        isLoading={isCopying}
      />

      <OrderPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        orderId={order.id}
        orderCode={order.code}
      />
    </PageContainer>
  );
};
