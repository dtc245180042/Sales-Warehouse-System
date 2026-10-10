import React, { useEffect, useState, useMemo } from 'react';
import {
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  TrendingUp,
  Ban,
  HelpCircle,
  FileCheck2,
} from 'lucide-react';
import { creditService } from '../../services/creditService';
import { CustomerCreditProfile } from '../../types/CreditProfile';
import { formatCurrency } from '../../utils/formatters';

export interface CustomerCreditStatusInfo {
  isBlocked: boolean;
  requiresApproval: boolean;
  blockReason?: string | null;
  approvalReason?: string | null;
  creditLimit: number;
  currentDebt: number;
  availableCredit: number;
  maxDebtDays: number;
  hasOverdue: boolean;
  overdueDays: number;
  overdueOrderCode?: string | null;
}

interface CustomerCreditBannerProps {
  customerId?: string;
  customerName?: string;
  newOrderAmount?: number;
  newOrderPaid?: number;
  onStatusChange?: (status: CustomerCreditStatusInfo) => void;
  compact?: boolean;
}

export const CustomerCreditBanner: React.FC<CustomerCreditBannerProps> = ({
  customerId,
  customerName,
  newOrderAmount = 0,
  newOrderPaid = 0,
  onStatusChange,
  compact = false,
}) => {
  const [profile, setProfile] = useState<CustomerCreditProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch credit profile whenever customerId changes
  useEffect(() => {
    if (!customerId) {
      setProfile(null);
      setFetchError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setFetchError(null);

    creditService
      .getProfile(customerId)
      .then((data) => {
        if (isMounted) {
          setProfile(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('[CustomerCreditBanner] Could not load credit profile:', err);
          setFetchError('Không tải được hồ sơ công nợ đại lý');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  // Derived calculation
  const creditStatus = useMemo<CustomerCreditStatusInfo>(() => {
    const limit = Number(profile?.creditLimit ?? 0);
    const currDebt = Number(profile?.currentDebt ?? 0);
    const maxDays = Number(profile?.maxDebtDays ?? 0);
    const hasOverdue = Boolean(profile?.hasOverdue);
    const overdueDays = Number(profile?.overdueDays ?? 0);
    const overdueCode = profile?.overdueOrderCode ?? null;
    const isBlocked = Boolean(profile?.isBlocked || (hasOverdue && overdueDays > 0));

    const unpaidFromNew = Math.max(0, Number(newOrderAmount) - Number(newOrderPaid));
    const projectedTotalDebt = currDebt + unpaidFromNew;
    const excess = limit > 0 ? Math.max(0, projectedTotalDebt - limit) : unpaidFromNew;

    // Rules
    let requiresApproval = false;
    let approvalMsg: string | null = null;

    if (!isBlocked && unpaidFromNew > 0) {
      if (limit <= 0) {
        requiresApproval = true;
        approvalMsg = `Đại lý chưa được cấp hạn mức công nợ (Hạn mức: 0 đ). Đơn hàng cần được Quản lý duyệt.`;
      } else if (projectedTotalDebt > limit) {
        requiresApproval = true;
        approvalMsg = `Đơn hàng làm tổng công nợ (${formatCurrency(projectedTotalDebt)}) vượt hạn mức (${formatCurrency(limit)}) là ${formatCurrency(excess)}. Đơn cần Quản lý duyệt.`;
      }
    }

    const avail = Math.max(0, limit - currDebt);
    const blockMsg = isBlocked
      ? profile?.blockReason ||
        `Đại lý đang có khoản nợ quá hạn ${overdueDays} ngày (Đơn ${overdueCode || 'cũ'}). Hệ thống chặn tạo và chốt đơn hoàn toàn.`
      : null;

    return {
      isBlocked,
      requiresApproval,
      blockReason: blockMsg,
      approvalReason: approvalMsg,
      creditLimit: limit,
      currentDebt: currDebt,
      availableCredit: avail,
      maxDebtDays: maxDays,
      hasOverdue,
      overdueDays,
      overdueOrderCode: overdueCode,
    };
  }, [profile, newOrderAmount, newOrderPaid]);

  // Notify parent on status change
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(creditStatus);
    }
  }, [creditStatus, onStatusChange]);

  if (!customerId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 animate-pulse text-xs text-slate-400 flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-slate-400 animate-spin" />
        <span>Đang kiểm tra hạn mức công nợ đại lý...</span>
      </div>
    );
  }

  if (fetchError && !profile) {
    return null;
  }

  const {
    isBlocked,
    requiresApproval,
    blockReason,
    approvalReason,
    creditLimit,
    currentDebt,
    availableCredit,
    maxDebtDays,
    hasOverdue,
    overdueDays,
    overdueOrderCode,
  } = creditStatus;

  // Percentage calculation
  const percentUsed = creditLimit > 0 ? Math.min(100, Math.round((currentDebt / creditLimit) * 100)) : (currentDebt > 0 ? 100 : 0);
  const projectedDebt = currentDebt + Math.max(0, newOrderAmount - newOrderPaid);
  const projectedPercentUsed = creditLimit > 0 ? Math.min(100, Math.round((projectedDebt / creditLimit) * 100)) : (projectedDebt > 0 ? 100 : 0);

  // Border & background theme based on state
  let cardBorder = 'border-slate-200/90 dark:border-slate-800';
  let cardBg = 'bg-white dark:bg-slate-900';
  let statusBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80';
  let statusBadgeText = 'Hạn mức an toàn';

  if (isBlocked) {
    cardBorder = 'border-rose-400 dark:border-rose-700 shadow-rose-500/10';
    cardBg = 'bg-rose-50/40 dark:bg-rose-950/20';
    statusBadgeColor = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800';
    statusBadgeText = 'Đang bị chặn đặt hàng';
  } else if (requiresApproval) {
    cardBorder = 'border-amber-400 dark:border-amber-700 shadow-amber-500/10';
    cardBg = 'bg-amber-50/40 dark:bg-amber-950/20';
    statusBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800';
    statusBadgeText = 'Cần quản lý duyệt';
  }

  return (
    <div className={`rounded-2xl border transition-all duration-200 shadow-sm ${cardBorder} ${cardBg} p-3.5 space-y-3`}>
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isBlocked ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' : requiresApproval ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'}`}>
            {isBlocked ? <Ban className="w-4 h-4" /> : requiresApproval ? <AlertTriangle className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Hạn Mức & Công Nợ Đại Lý
              </h4>
            </div>
            {customerName && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                {customerName}
              </p>
            )}
          </div>
        </div>

        {/* Status Chip */}
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${statusBadgeColor}`}>
          {isBlocked ? (
            <Ban className="w-3 h-3" />
          ) : requiresApproval ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          <span>{statusBadgeText}</span>
        </span>
      </div>

      {/* KPI 3 columns */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {/* Hạn mức cấp */}
        <div className="p-2 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
            Hạn mức cấp
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate block mt-0.5">
            {formatCurrency(creditLimit)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
            Tối đa {maxDebtDays} ngày
          </span>
        </div>

        {/* Dư nợ hiện tại */}
        <div className={`p-2 rounded-xl border ${currentDebt > 0 ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/60' : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800'}`}>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
            Dư nợ hiện tại
          </span>
          <span className={`text-xs sm:text-sm font-bold truncate block mt-0.5 ${currentDebt > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
            {formatCurrency(currentDebt)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {percentUsed}% hạn mức
          </span>
        </div>

        {/* Hạn mức còn lại */}
        <div className={`p-2 rounded-xl border ${availableCredit > 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/60' : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200/60 dark:border-rose-800/60'}`}>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
            Hạn mức còn lại
          </span>
          <span className={`text-xs sm:text-sm font-black truncate block mt-0.5 ${availableCredit > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}`}>
            {formatCurrency(availableCredit)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {availableCredit > 0 ? 'Khả dụng' : 'Hết hạn mức'}
          </span>
        </div>
      </div>

      {/* Progress Bar of Credit Utilization */}
      {creditLimit > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            <span>Sử dụng hạn mức:</span>
            <span className="font-mono">{newOrderAmount > 0 ? `${projectedPercentUsed}% (sau đơn)` : `${percentUsed}%`}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
            {/* Current Debt bar */}
            <div
              className={`h-full transition-all duration-300 ${percentUsed > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
            {/* Projected addition */}
            {newOrderAmount > 0 && projectedDebt > currentDebt && (
              <div
                className={`h-full transition-all duration-300 ${projectedDebt > creditLimit ? 'bg-rose-500' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(100 - percentUsed, projectedPercentUsed - percentUsed)}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* CRITICAL BANNER: Overdue Debt -> BLOCK ORDER COMPLETELY */}
      {isBlocked && (
        <div className="p-2.5 rounded-xl bg-rose-100/80 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Chặn tạo đơn: Đại lý có nợ quá hạn!</span>
          </div>
          <p className="text-[11px] leading-relaxed text-rose-800 dark:text-rose-200">
            {blockReason ||
              `Đại lý đang có đơn hàng ${overdueOrderCode || ''} nợ quá hạn ${overdueDays} ngày (quy định tối đa ${maxDebtDays} ngày). Hệ thống từ chối nhận đơn mới cho đến khi hoàn tất thanh toán khoản nợ quá hạn này.`}
          </p>
        </div>
      )}

      {/* WARNING BANNER: Exceeds Limit -> MARK AS REQUIRES APPROVAL */}
      {!isBlocked && requiresApproval && (
        <div className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Cảnh báo: Đơn hàng cần duyệt khi chốt!</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
            {approvalReason ||
              `Tổng đơn hàng cộng công nợ hiện tại vượt hạn mức cho phép. Đơn vẫn cho phép gửi lên nhưng sẽ được chuyển sang trạng thái "Chờ duyệt" để Quản lý kinh doanh phê duyệt.`}
          </p>
        </div>
      )}

      {/* SUCCESS BANNER: Within limit and no overdue */}
      {!isBlocked && !requiresApproval && newOrderAmount > 0 && (
        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Đơn hàng nằm trong hạn mức công nợ khả dụng.</span>
          </div>
          <span className="font-bold text-emerald-700 dark:text-emerald-300">
            Duyệt tự động
          </span>
        </div>
      )}
    </div>
  );
};
