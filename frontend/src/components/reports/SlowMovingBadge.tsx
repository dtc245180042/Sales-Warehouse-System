import React from 'react';
import { AlertTriangle, Clock, Skull } from 'lucide-react';

export interface SlowMovingBadgeProps {
  days: number;
  threshold?: number;
  showDays?: boolean;
  className?: string;
}

export const SlowMovingBadge: React.FC<SlowMovingBadgeProps> = ({
  days,
  showDays = true,
  className = '',
}) => {
  if (days < 30) {
    return null; // Normal rotation, no warning badge needed
  }

  if (days > 180) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800 ${className}`}
        title={`Sản phẩm tồn chết: ${days} ngày chưa phát sinh giao dịch xuất`}
      >
        <Skull className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>Tồn chết{showDays ? ` (${days}d)` : ''}</span>
      </span>
    );
  }

  if (days > 90) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 ${className}`}
        title={`Chậm luân chuyển: ${days} ngày không có giao dịch`}
      >
        <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
        <span>Chậm luân chuyển{showDays ? ` (${days}d)` : ''}</span>
      </span>
    );
  }

  if (days >= 60) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60 ${className}`}
        title={`Cảnh báo luân chuyển: ${days} ngày không có giao dịch`}
      >
        <Clock className="w-3 h-3 text-orange-500 shrink-0" />
        <span>Cảnh báo{showDays ? ` (${days}d)` : ''}</span>
      </span>
    );
  }

  // 30 - 59 days
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 ${className}`}
      title={`Ít luân chuyển: ${days} ngày không có giao dịch`}
    >
      <Clock className="w-3 h-3 text-amber-500 shrink-0" />
      <span>Ít luân chuyển{showDays ? ` (${days}d)` : ''}</span>
    </span>
  );
};
