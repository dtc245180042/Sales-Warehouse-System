import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  FileDown,
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
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
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
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCustomerLocked, setIsCustomerLocked] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

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
    } catch {
      showToast('Lỗi cập nhật trạng thái', 'error');
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    try {
      const updated = await orderService.cancelOrder(order.id);
      setOrder(updated);
      showToast('Đã hủy đơn hàng thành công', 'success');
      setIsCancelModalOpen(false);
    } catch {
      showToast('Lỗi khi hủy đơn hàng', 'error');
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
          {order.status !== 'cancelled' && order.status !== 'completed' && (
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
      {/* Banner Cảnh báo đại lý bị khoá giao dịch (SC-228 Subtask 6) */}
      {(order.customerIsLocked || isCustomerLocked) && (
        <div
          id="order-customer-locked-alert"
          className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 flex items-start gap-3.5 shadow-sm"
        >
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm">
            <h4 className="font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
              ⚠️ CẢNH BÁO: ĐẠI LÝ ĐANG BỊ KHOÁ GIAO DỊCH
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 font-semibold text-amber-800 dark:text-amber-200">
                Đơn dở vẫn được xử lý tiếp
              </span>
            </h4>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              {order.customerLockWarning ||
                `Đại lý '${order.customerName}' hiện đang bị khoá giao dịch. Theo quy định SC-228, đơn hàng đã tạo này vẫn được phép tiếp tục đóng gói, giao hàng hoặc hoàn tất, nhưng không thể tạo đơn mới.`}
            </p>
          </div>
        </div>
      )}

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
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-xs mt-2 font-bold whitespace-nowrap ${
                      isCurrent
                        ? 'text-indigo-600 dark:text-indigo-400'
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

          {/* Quick status change buttons */}
          <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            {order.status === 'pending' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpdateStatus('confirmed')}
              >
                Xác nhận đơn hàng
              </Button>
            )}
            {order.status === 'confirmed' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpdateStatus('shipping')}
              >
                Bắt đầu giao hàng
              </Button>
            )}
            {order.status === 'shipping' && (
              <Button
                variant="success"
                size="sm"
                onClick={() => handleUpdateStatus('completed')}
              >
                Xác nhận đã giao thành công
              </Button>
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
                        <span className="text-[11px] text-slate-400 font-mono">SKU: {it.sku}</span>
                      </td>
                      <td className="py-3 text-center font-medium">{formatCurrency(it.price)}</td>
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

      <OrderPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        orderId={order.id}
        orderCode={order.code}
      />
    </PageContainer>
  );
};
