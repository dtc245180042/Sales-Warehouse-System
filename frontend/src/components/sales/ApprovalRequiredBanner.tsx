import React from 'react';
import { AlertTriangle, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { Button } from '../common/Button';

interface ApprovalRequiredBannerProps {
  pendingCount: number;
  canApprove: boolean;
  onFilterPending: () => void;
  onDismiss?: () => void;
}

export const ApprovalRequiredBanner: React.FC<ApprovalRequiredBannerProps> = ({
  pendingCount,
  canApprove,
  onFilterPending,
  onDismiss,
}) => {
  if (pendingCount <= 0) return null;

  return (
    <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-orange-500/10 dark:from-amber-950/40 dark:via-amber-900/30 dark:to-orange-950/30 border border-amber-300/80 dark:border-amber-800/80 shadow-soft animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0 animate-pulse">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              YÊU CẦU PHÊ DUYỆT GIÁ SÀN: Có {pendingCount} bảng giá đang chờ duyệt
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700">
              CẦN XỬ LÝ
            </span>
          </div>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
            {canApprove
              ? 'Bảng giá có các mặt hàng được thiết lập giá bán thấp hơn giá sàn tối thiểu. Cần sự phê duyệt của Quản lý kinh doanh / Giám đốc.'
              : 'Các bảng giá này đang chờ Quản lý kinh doanh xem xét và phê duyệt trước khi được đưa vào áp dụng chính thức.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onFilterPending}
          className="text-xs gap-1.5 border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 hover:bg-amber-50"
        >
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          {canApprove ? 'Xem danh sách cần duyệt' : 'Xem các bảng giá chờ duyệt'}
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-xl text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
