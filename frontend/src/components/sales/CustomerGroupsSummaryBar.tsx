import React from 'react';
import { Tag, CheckCircle2, AlertTriangle, Clock, ChevronRight, Layers } from 'lucide-react';
import { CustomerGroupSummaryItem, CUSTOMER_GROUPS } from '../../services/priceListService';
import { formatDate } from '../../utils/formatters';

interface CustomerGroupsSummaryBarProps {
  summaries: CustomerGroupSummaryItem[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
  loading: boolean;
}

export const CustomerGroupsSummaryBar: React.FC<CustomerGroupsSummaryBarProps> = ({
  summaries,
  selectedGroup,
  onSelectGroup,
  loading,
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Tình trạng bảng giá theo từng nhóm khách hàng
          </h3>
        </div>
        {selectedGroup !== 'all' && (
          <button
            onClick={() => onSelectGroup('all')}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            ← Xem tất cả nhóm
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {CUSTOMER_GROUPS.map((grp) => {
          const summary = summaries.find((s) => s.customer_group === grp.value);
          const isSelected = selectedGroup === grp.value;
          const activeList = summary?.active_price_list;

          return (
            <div
              key={grp.value}
              onClick={() => onSelectGroup(isSelected ? 'all' : grp.value)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group select-none ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-md ring-2 ring-indigo-500/20'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-800 shadow-soft'
              }`}
            >
              {/* Header card */}
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border ${grp.badgeColor}`}
                  >
                    {grp.label}
                  </span>
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">{grp.description}</p>
                </div>
              </div>

              {/* Active price list status */}
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                {loading ? (
                  <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                ) : activeList ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{activeList.code}</span>
                      <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950">
                        v{activeList.version}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>{activeList.items_count} sản phẩm</span>
                      <span className="text-[10px] text-slate-400">
                        Từ {formatDate(activeList.valid_from)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] font-medium">Chưa có bảng giá áp dụng</span>
                  </div>
                )}
              </div>

              {/* Counters */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">
                  Tổng: <strong>{summary?.total_price_lists || 0}</strong>
                </span>
                {summary && summary.pending_approval_count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 animate-pulse">
                    {summary.pending_approval_count} chờ duyệt
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
