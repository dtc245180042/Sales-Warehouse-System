import React from 'react';
import { User, MapPin, CheckCircle2, TrendingUp, ShoppingBag, ShieldCheck, Lock } from 'lucide-react';
import { SalesTargetProgressItem } from '../../types/SalesTarget';
import { ProgressRing } from './ProgressRing';
import { formatNumber } from '../../utils/formatters';

interface TargetProgressCardProps {
  item: SalesTargetProgressItem;
}

export const TargetProgressCard: React.FC<TargetProgressCardProps> = ({ item }) => {
  const targetRevenue = Number(item.targetRevenue) || 0;
  const currentRevenue = Number(item.currentRevenue) || 0;
  const remainingRevenue = Number(item.remainingRevenue) || Math.max(0, targetRevenue - currentRevenue);
  const revenuePercentage = Number(item.revenuePercentage) || (targetRevenue > 0 ? Math.round((currentRevenue / targetRevenue) * 1000) / 10 : 0);
  const targetOrders = Number(item.targetOrders) || 0;
  const currentOrders = Number(item.currentOrders) || 0;
  const ordersPercentage = Number(item.ordersPercentage) || (targetOrders > 0 ? Math.round((currentOrders / targetOrders) * 100) : 0);

  const isComplete = revenuePercentage >= 100;

  const getStatusColorClass = () => {
    if (revenuePercentage >= 100) return 'text-emerald-600 dark:text-emerald-400';
    if (revenuePercentage >= 75) return 'text-blue-600 dark:text-blue-400';
    if (revenuePercentage >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getProgressBarColor = () => {
    if (revenuePercentage >= 100) return 'bg-emerald-500';
    if (revenuePercentage >= 75) return 'bg-blue-500';
    if (revenuePercentage >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
      {/* Top Banner accent if 100% completed */}
      {isComplete && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
      )}

      <div>
        {/* Card Header: Name / Territory + Badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                item.scope === 'individual'
                  ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {item.scope === 'individual' ? (
                <User className="w-5 h-5" />
              ) : (
                <MapPin className="w-5 h-5" />
              )}
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight">
                {item.scope === 'individual'
                  ? (item.userName || item.userId || 'Chưa đặt tên')
                  : (item.territory || 'Khu vực kinh doanh')}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                {item.scope === 'individual' && item.territory && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {item.territory}
                  </span>
                )}
                {item.scope === 'territory' && (
                  <span className="font-medium text-indigo-500">Khu vực kinh doanh</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {item.status === 'locked' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <Lock className="w-3 h-3" />
                Đã khoá
              </span>
            )}
            {isComplete && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                Đạt
              </span>
            )}
          </div>
        </div>

        {/* Center: Progress Donut & Numbers */}
        <div className="flex items-center justify-between gap-4 py-2 my-2 border-y border-slate-100 dark:border-slate-800/80">
          <div className="shrink-0">
            <ProgressRing percentage={revenuePercentage} size={90} strokeWidth={9} />
          </div>

          <div className="flex-1 space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Mục tiêu:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatNumber(targetRevenue)} đ
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Đã đạt:</span>
              <span className={`font-bold ${getStatusColorClass()}`}>
                {formatNumber(currentRevenue)} đ
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Còn lại:</span>
              <span className="font-semibold text-rose-500">
                {remainingRevenue > 0 ? `${formatNumber(remainingRevenue)} đ` : '0 đ'}
              </span>
            </div>
          </div>
        </div>

        {/* Horizontal Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>Tiến độ doanh số</span>
            <span className="font-bold">{revenuePercentage}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${getProgressBarColor()} transition-all duration-700`}
              style={{ width: `${Math.min(revenuePercentage, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer: Orders progress */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
          <span>Số đơn hàng:</span>
        </div>
        <div className="font-medium text-slate-800 dark:text-slate-200">
          <strong className="text-slate-900 dark:text-slate-100">{currentOrders}</strong> /{' '}
          {targetOrders} đơn ({ordersPercentage}%)
        </div>
      </div>
    </div>
  );
};
