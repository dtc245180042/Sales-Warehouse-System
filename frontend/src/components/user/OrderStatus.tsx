import React from 'react';
import { Clock, CheckCircle2, PackageCheck, Truck, XCircle, AlertCircle } from 'lucide-react';

export type OrderStatusType = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';

interface OrderStatusProps {
  status: OrderStatusType | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const OrderStatus: React.FC<OrderStatusProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const configs: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
    pending: {
      label: 'Chờ duyệt',
      icon: <Clock className="w-3.5 h-3.5" />,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
    },
    confirmed: {
      label: 'Đã xác nhận',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
    },
    processing: {
      label: 'Đang xử lý kho',
      icon: <PackageCheck className="w-3.5 h-3.5" />,
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      text: 'text-indigo-700 dark:text-indigo-400',
      border: 'border-indigo-200 dark:border-indigo-800',
    },
    completed: {
      label: 'Hoàn thành',
      icon: <Truck className="w-3.5 h-3.5" />,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    cancelled: {
      label: 'Đã hủy',
      icon: <XCircle className="w-3.5 h-3.5" />,
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-400',
      border: 'border-rose-200 dark:border-rose-800',
    },
  };

  const conf = configs[status] || {
    label: status,
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
  };

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-bold',
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border shadow-xs ${conf.bg} ${conf.text} ${conf.border} ${sizeClasses[size]}`}
    >
      {showIcon && conf.icon}
      <span>{conf.label}</span>
    </span>
  );
};

export { OrderStatus as OrderStatusBadge };
export default OrderStatus;
