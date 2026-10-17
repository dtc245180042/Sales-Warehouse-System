import React from 'react';
import {
  Calendar,
  User,
  MapPin,
  Store,
  FolderTree,
  Package,
  RefreshCw,
  GitCompare,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ReportDimension,
  ReportPeriodType,
  ComparisonMode,
  SalesReportFilter,
} from '../../types/SalesReport';

export interface ReportFilterBarProps {
  value: SalesReportFilter;
  onChange: (filter: SalesReportFilter) => void;
  onApply: () => void;
  loading?: boolean;
  className?: string;
}

const DIMENSIONS: {
  key: ReportDimension;
  label: string;
  icon: React.ReactNode;
  desc: string;
}[] = [
  { key: 'staff', label: 'Nhân viên', icon: <User className="w-4 h-4" />, desc: 'Doanh số theo sales reps' },
  { key: 'territory', label: 'Khu vực', icon: <MapPin className="w-4 h-4" />, desc: 'Theo vùng miền / tỉnh' },
  { key: 'agent', label: 'Đại lý / KH', icon: <Store className="w-4 h-4" />, desc: 'Theo khách hàng B2B' },
  { key: 'category', label: 'Nhóm hàng', icon: <FolderTree className="w-4 h-4" />, desc: 'Theo danh mục sản phẩm' },
  { key: 'sku', label: 'SKU cụ thể', icon: <Package className="w-4 h-4" />, desc: 'Chi tiết từng mã hàng' },
];

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  value,
  onChange,
  onApply,
  loading = false,
  className = '',
}) => {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const handlePeriodTypeChange = (type: ReportPeriodType) => {
    onChange({
      ...value,
      periodType: type,
      // Default to sensible defaults
      month: type === 'month' ? value.month || new Date().getMonth() + 1 : undefined,
      quarter: type === 'quarter' ? value.quarter || Math.floor(new Date().getMonth() / 3) + 1 : undefined,
    });
  };

  const handleDimensionChange = (dimension: ReportDimension) => {
    onChange({
      ...value,
      dimension,
    });
  };

  const handleComparisonModeChange = (mode: ComparisonMode) => {
    onChange({
      ...value,
      comparisonMode: mode,
      compareWithPrev: mode !== 'none',
    });
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-4 ${className}`}
    >
      {/* Top Row: Period Types & Dimensions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Period Selector Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
            <Calendar className="w-3.5 h-3.5 text-primary-500" />
            <span>Kỳ báo cáo:</span>
          </div>

          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              id="filter-period-month"
              onClick={() => handlePeriodTypeChange('month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                value.periodType === 'month'
                  ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Theo Tháng
            </button>
            <button
              type="button"
              id="filter-period-quarter"
              onClick={() => handlePeriodTypeChange('quarter')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                value.periodType === 'quarter'
                  ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Theo Quý
            </button>
            <button
              type="button"
              id="filter-period-custom"
              onClick={() => handlePeriodTypeChange('custom')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                value.periodType === 'custom'
                  ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tùy Chọn
            </button>
          </div>
        </div>

        {/* Dimension Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary-500" />
            <span>Chiều nhóm:</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {DIMENSIONS.map((dim) => {
              const active = value.dimension === dim.key;
              return (
                <button
                  key={dim.key}
                  type="button"
                  id={`dim-btn-${dim.key}`}
                  onClick={() => handleDimensionChange(dim.key)}
                  title={dim.desc}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-primary-600 text-white shadow-sm ring-2 ring-primary-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {dim.icon}
                  <span>{dim.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Detailed controls + Comparison + Apply Button */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Dynamic Period Inputs */}
        <div className="flex items-center gap-2 flex-wrap">
          {value.periodType === 'month' && (
            <>
              <div className="flex items-center gap-1.5">
                <label htmlFor="select-report-month" className="text-xs text-slate-500 dark:text-slate-400">
                  Tháng:
                </label>
                <select
                  id="select-report-month"
                  aria-label="Chọn tháng báo cáo"
                  value={value.month || new Date().getMonth() + 1}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      month: parseInt(e.target.value, 10),
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="select-report-year" className="text-xs text-slate-500 dark:text-slate-400">
                  Năm:
                </label>
                <select
                  id="select-report-year"
                  aria-label="Chọn năm báo cáo"
                  value={value.year || currentYear}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      year: parseInt(e.target.value, 10),
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {value.periodType === 'quarter' && (
            <>
              <div className="flex items-center gap-1.5">
                <label htmlFor="select-report-quarter" className="text-xs text-slate-500 dark:text-slate-400">
                  Quý:
                </label>
                <select
                  id="select-report-quarter"
                  aria-label="Chọn quý báo cáo"
                  value={value.quarter || 1}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      quarter: parseInt(e.target.value, 10),
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
                >
                  <option value={1}>Quý I (T1 - T3)</option>
                  <option value={2}>Quý II (T4 - T6)</option>
                  <option value={3}>Quý III (T7 - T9)</option>
                  <option value={4}>Quý IV (T10 - T12)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="select-report-qyear" className="text-xs text-slate-500 dark:text-slate-400">
                  Năm:
                </label>
                <select
                  id="select-report-qyear"
                  aria-label="Chọn năm quý báo cáo"
                  value={value.year || currentYear}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      year: parseInt(e.target.value, 10),
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {value.periodType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                id="filter-from-date"
                type="date"
                aria-label="Từ ngày"
                value={value.fromDate || ''}
                onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
              />
              <span className="text-xs text-slate-400">đến</span>
              <input
                id="filter-to-date"
                type="date"
                aria-label="Đến ngày"
                value={value.toDate || ''}
                onChange={(e) => onChange({ ...value, toDate: e.target.value })}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Comparison Mode Select (SCRUM-821) */}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <GitCompare className="w-3.5 h-3.5 text-primary-500" />
            <select
              id="select-comparison-mode"
              aria-label="Chế độ so sánh kỳ"
              value={value.comparisonMode || 'prev_period'}
              onChange={(e) => handleComparisonModeChange(e.target.value as ComparisonMode)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary-500"
            >
              <option value="none">Không so sánh</option>
              <option value="prev_period">So kỳ liền trước</option>
              <option value="same_period_last_year">So cùng kỳ năm trước (YoY)</option>
            </select>
          </div>
        </div>

        {/* Apply Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="btn-apply-report-filters"
            onClick={onApply}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-700 active:scale-95 text-white transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Cập nhật báo cáo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
