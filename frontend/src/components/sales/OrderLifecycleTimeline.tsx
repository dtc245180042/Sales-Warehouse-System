import React from 'react';
import {
  FileEdit,
  Clock,
  CheckCircle,
  Boxes,
  Truck,
  PackageCheck,
  Archive,
  Ban,
  ArrowRight,
  User,
  Calendar,
  AlertTriangle,
  GitBranch,
} from 'lucide-react';
import { Order, OrderStatus } from '../../types/Order';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

interface OrderLifecycleTimelineProps {
  order: Order;
  onUpdateStatus: (nextStatus: OrderStatus, note?: string) => void;
  onRequestCancel: () => void;
}

interface StepConfig {
  key: OrderStatus;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}

const LIFECYCLE_STEPS: StepConfig[] = [
  { key: 'draft', label: 'Nháp', shortDesc: 'Khởi tạo đơn', icon: FileEdit },
  { key: 'pending', label: 'Chờ duyệt', shortDesc: 'Chờ Quản lý duyệt', icon: Clock },
  { key: 'confirmed', label: 'Đã duyệt', shortDesc: 'Xác nhận đơn', icon: CheckCircle },
  { key: 'preparing', label: 'Đang soạn hàng', shortDesc: 'Kho đóng gói', icon: Boxes },
  { key: 'shipping', label: 'Đã xuất', shortDesc: 'Bàn giao giao vận', icon: Truck },
  { key: 'completed', label: 'Đã giao', shortDesc: 'Giao hàng thành công', icon: PackageCheck },
  { key: 'closed', label: 'Đóng', shortDesc: 'Hoàn tất vòng đời', icon: Archive },
];

export const OrderLifecycleTimeline: React.FC<OrderLifecycleTimelineProps> = ({
  order,
  onUpdateStatus,
  onRequestCancel,
}) => {
  const isCancelled = order.status === 'cancelled';

  // Determine current step index in linear lifecycle
  const currentStepIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === order.status);

  // If order was cancelled, determine which step it was cancelled from
  const cancelledFromIndex = isCancelled
    ? (order.timeline && order.timeline.length > 0
        ? LIFECYCLE_STEPS.findIndex(
            (s) => s.key === order.timeline![order.timeline!.length - 1]?.status
          )
        : 1) // default from pending if not recorded
    : -1;

  // Next status action helpers
  const getNextStepInfo = (): { nextStatus: OrderStatus; buttonLabel: string } | null => {
    switch (order.status) {
      case 'draft':
        return { nextStatus: 'pending', buttonLabel: 'Gửi duyệt đơn hàng' };
      case 'pending':
        return { nextStatus: 'confirmed', buttonLabel: 'Phê duyệt đơn hàng' };
      case 'confirmed':
        return { nextStatus: 'preparing', buttonLabel: 'Chuyển kho soạn hàng' };
      case 'preparing':
        return { nextStatus: 'shipping', buttonLabel: 'Xuất kho & Giao hàng' };
      case 'shipping':
        return { nextStatus: 'completed', buttonLabel: 'Xác nhận đã giao' };
      case 'completed':
        return { nextStatus: 'closed', buttonLabel: 'Đóng đơn hàng' };
      default:
        return null;
    }
  };

  const nextStep = getNextStepInfo();

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card mb-6">
      {/* Title & Status Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Vòng Đời Đơn Hàng (Order Lifecycle)
            </h3>
            <Badge
              variant={
                isCancelled
                  ? 'danger'
                  : order.status === 'closed'
                  ? 'neutral'
                  : order.status === 'completed'
                  ? 'success'
                  : 'primary'
              }
              size="sm"
              dot
            >
              {isCancelled ? 'Đã hủy đơn' : `Khâu hiện tại: ${LIFECYCLE_STEPS.find((s) => s.key === order.status)?.label || order.status}`}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Hiển thị trực quan tiến trình các mốc khâu kinh doanh từ Nháp tới Đóng và Nhánh Hủy
          </p>
        </div>

        {/* Action button to proceed to next stage */}
        <div className="flex items-center gap-2">
          {nextStep && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onUpdateStatus(nextStep.nextStatus)}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              {nextStep.buttonLabel}
            </Button>
          )}
          {!isCancelled && !['shipping', 'completed', 'closed'].includes(order.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRequestCancel}
              leftIcon={<Ban className="w-4 h-4 text-rose-500" />}
              className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              Hủy đơn
            </Button>
          )}
        </div>
      </div>

      {/* Main Timeline Visual Flow */}
      <div className="pt-8 pb-4 overflow-x-auto">
        <div className="min-w-[760px] relative px-4">
          {/* Background Connecting Line */}
          <div className="absolute top-6 left-12 right-12 h-1 bg-slate-200 dark:bg-slate-700/80 -translate-y-1/2 z-0" />

          {/* Active Progress Line */}
          {!isCancelled && currentStepIndex >= 0 && (
            <div
              className="absolute top-6 left-12 h-1 bg-indigo-600 transition-all duration-500 -translate-y-1/2 z-0"
              style={{
                width: `${Math.min(100, (currentStepIndex / (LIFECYCLE_STEPS.length - 1)) * 100)}%`,
              }}
            />
          )}

          {/* Steps Array */}
          <div className="relative z-10 flex items-start justify-between">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const isPast = !isCancelled && idx < currentStepIndex;
              const isCurrent = !isCancelled && idx === currentStepIndex;
              const isFuture = !isCancelled && idx > currentStepIndex;
              const wasCancelledHere = isCancelled && idx === Math.max(0, cancelledFromIndex);

              const Icon = step.icon;

              return (
                <div key={step.key} className="flex flex-col items-center group relative max-w-[100px] text-center">
                  {/* Step Node Circle */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm ${
                      wasCancelledHere
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 border-2 border-rose-500 ring-4 ring-rose-100 dark:ring-rose-950'
                        : isPast
                        ? 'bg-indigo-600 text-white shadow-indigo-200 dark:shadow-none'
                        : isCurrent
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950 shadow-md scale-110'
                        : 'bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Step Label */}
                  <span
                    className={`text-xs mt-3 font-bold block ${
                      wasCancelledHere
                        ? 'text-rose-600 dark:text-rose-400'
                        : isCurrent
                        ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                        : isPast
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Short subtitle */}
                  <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 block">
                    {step.shortDesc}
                  </span>

                  {/* Badge for Current Stage */}
                  {isCurrent && (
                    <span className="mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 animate-pulse">
                      Hiện tại
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Nhánh HỦY (Cancelled Branch) ── */}
      {isCancelled ? (
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-800 dark:text-rose-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider bg-rose-600 text-white px-2 py-0.5 rounded-md">
                    Nhánh Hủy Đơn
                  </span>
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                    Đơn hàng đã rẽ nhánh huỷ bỏ và đóng lại
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5">
                  <span className="font-bold">Lý do huỷ:</span>{' '}
                  {order.cancelledReason || 'Khách hàng yêu cầu hủy đơn hàng / Hết hàng.'}
                </p>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-500">
                  {order.cancelledAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-rose-500" />
                      Thời điểm huỷ: {order.cancelledAt}
                    </span>
                  )}
                  {order.cancelledBy && (
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-rose-500" />
                      Thực hiện bởi: {order.cancelledBy}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right sm:border-l sm:border-rose-200 sm:dark:border-rose-900 sm:pl-4">
              <span className="text-[11px] font-semibold text-rose-600 block">
                Kho hàng đã tự động
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Hoàn trả toàn bộ số lượng tồn kho
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Timeline audit history preview */
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Ngày tạo đơn: <span className="font-semibold text-slate-800 dark:text-slate-200">{order.createdAt}</span></span>
            <span className="text-slate-300">•</span>
            <span>Cập nhật gần nhất: <span className="font-semibold text-slate-800 dark:text-slate-200">{order.updatedAt}</span></span>
          </div>

          <span className="text-[11px] text-slate-400 italic">
            Mọi thao tác thay đổi khâu đều được tự động lưu vào Nhật ký thao tác hệ thống
          </span>
        </div>
      )}
    </div>
  );
};
