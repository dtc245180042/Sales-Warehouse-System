import React from 'react';
import {
  DollarSign,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Building,
  User,
  ShieldAlert,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { Agent } from '../../types/Agent';
import { formatCurrency } from '../../utils/formatters';
import { Badge } from '../common/Badge';

interface AgentDebtSummaryHeaderProps {
  agent: Agent;
  totalRemainingDebt: number;
  creditLimit: number;
  overdueDebt: number;
  inDueDebt: number;
  overdueCount: number;
  availableAgents?: Agent[];
  onSelectAgent?: (agentId: string) => void;
}

export const AgentDebtSummaryHeader: React.FC<AgentDebtSummaryHeaderProps> = ({
  agent,
  totalRemainingDebt,
  creditLimit,
  overdueDebt,
  inDueDebt,
  overdueCount,
  availableAgents,
  onSelectAgent,
}) => {
  // Hạn mức còn lại = Hạn mức được cấp - Tổng còn nợ
  const remainingCredit = Math.max(0, creditLimit - totalRemainingDebt);
  const utilizationRate = creditLimit > 0 ? Math.round((totalRemainingDebt / creditLimit) * 100) : 0;
  const isOverLimit = totalRemainingDebt > creditLimit;

  // Xác định màu sắc cảnh báo theo % hạn mức
  let utilizationColor = 'bg-emerald-500 text-emerald-700 dark:text-emerald-300';
  let badgeStatus: { label: string; variant: 'success' | 'warning' | 'danger' } = {
    label: 'Hạn mức an toàn',
    variant: 'success',
  };

  if (isOverLimit) {
    utilizationColor = 'bg-rose-600 text-rose-700 dark:text-rose-300';
    badgeStatus = { label: 'Vượt hạn mức tín dụng', variant: 'danger' };
  } else if (utilizationRate >= 80) {
    utilizationColor = 'bg-amber-500 text-amber-700 dark:text-amber-300';
    badgeStatus = { label: 'Sắp chạm hạn mức', variant: 'warning' };
  }

  return (
    <div className="space-y-4 mb-6">
      {/* 1. Header Card: Thông tin Đại lý & Selector */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-lg border border-indigo-200 dark:border-indigo-800 shrink-0">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {agent.name}
                </h2>
                <Badge variant="primary" size="sm">
                  {agent.customerGroup.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Mã đại lý: <strong className="text-slate-700 dark:text-slate-300">{agent.code}</strong> | MST: {agent.taxCode || 'Chưa cập nhật'} | ĐT: {agent.phone}
              </p>
            </div>
          </div>

          {/* Selector chuyển đổi đại lý nếu có nhiều */}
          {availableAgents && availableAgents.length > 1 && onSelectAgent && (
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                Xem đại lý khác:
              </label>
              <select
                value={agent.id}
                onChange={(e) => onSelectAgent(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
              >
                {availableAgents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 2. KHU VỰC TỔNG HỢP CÔNG NỢ & HẠN MỨC CÒN LẠI (SCRUM-757) */}
        <div className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Thẻ 1: Tổng Còn Nợ */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Tổng Còn Nợ Hiện Tại</span>
                <DollarSign className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {formatCurrency(totalRemainingDebt)}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Tổng nợ trên toàn bộ hoá đơn
              </span>
            </div>

            {/* Thẻ 2: Hạn Mức Còn Lại (SCRUM-757) */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Hạn Mức Còn Lại (Khả dụng)</span>
                <CreditCard className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(remainingCredit)}
              </p>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 block font-medium">
                {isOverLimit ? 'Đã vượt hạn mức cấp' : 'Được phép đặt hàng tiếp'}
              </span>
            </div>

            {/* Thẻ 3: Hạn Mức Tín Dụng Được Cấp */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Hạn Mức Công Nợ Cấp</span>
                <ShieldAlert className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">
                {formatCurrency(creditLimit)}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Hạn kỳ thanh toán: 30 ngày
              </span>
            </div>

            {/* Thẻ 4: Tình Trạng Quá Hạn */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Nợ Quá Hạn Cần Thanh Toán</span>
                <Clock className="w-4 h-4 text-rose-500" />
              </div>
              <p
                className={`text-2xl font-black ${
                  overdueDebt > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {formatCurrency(overdueDebt)}
              </p>
              <span className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 block font-semibold">
                {overdueCount > 0 ? `${overdueCount} hoá đơn quá hạn` : 'Không có nợ quá hạn'}
              </span>
            </div>
          </div>

          {/* Thanh Tiến Trình Sử Dụng Hạn Mức Tín Dụng */}
          <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Tỷ lệ sử dụng hạn mức công nợ:</span>
                <strong className={isOverLimit ? 'text-rose-600' : 'text-slate-900 dark:text-white'}>
                  {utilizationRate}%
                </strong>
              </span>
              <Badge variant={badgeStatus.variant} size="sm">
                {badgeStatus.label}
              </Badge>
            </div>

            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-700 ${
                  isOverLimit
                    ? 'bg-rose-600'
                    : utilizationRate >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, utilizationRate)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
