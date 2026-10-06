import React, { useRef, useCallback, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpCircle,
  PlusCircle,
  X,
  FileDown,
  Loader2,
  Info,
  Eye,
  EyeOff,
  Clock,
  FileText,
  TrendingUp,
  SkipForward,
  BarChart3,
  Table2,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useExcelImport } from '../../hooks/useExcelImport';
import { ImportRow, ImportStep, ImportReport, ImportReportRow } from '../../types/ExcelImport';
import { formatCurrency } from '../../utils/formatters';

// ─────────────────────────────────────────────
// Sub-components (defined OUTSIDE the parent)
// ─────────────────────────────────────────────

interface StepIndicatorProps {
  currentStep: ImportStep;
}

const STEPS: { key: ImportStep; label: string; icon: React.ReactNode }[] = [
  { key: 'upload', label: 'Tải lên', icon: <Upload className="w-3.5 h-3.5" /> },
  { key: 'preview', label: 'Xem trước', icon: <Eye className="w-3.5 h-3.5" /> },
  { key: 'importing', label: 'Đang nhập', icon: <Loader2 className="w-3.5 h-3.5" /> },
  { key: 'done', label: 'Hoàn tất', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
];

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                  ${done ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/40' : ''}
                  ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 ring-4 ring-indigo-100 dark:ring-indigo-900/50' : ''}
                  ${!done && !active ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' : ''}
                `}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-indigo-600 dark:text-indigo-400' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 rounded-full transition-colors duration-300 ${idx < currentIdx ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────

interface SummaryBadgeProps {
  count: number;
  label: string;
  color: 'green' | 'blue' | 'red' | 'amber' | 'slate';
  icon: React.ReactNode;
}

const SummaryBadge: React.FC<SummaryBadgeProps> = ({ count, label, color, icon }) => {
  const colorMap = {
    green: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    blue: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    red: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    slate: 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${colorMap[color]}`}>
      <span className="shrink-0">{icon}</span>
      <div>
        <div className="text-lg font-bold leading-none">{count}</div>
        <div className="text-[10px] opacity-80 mt-0.5 whitespace-nowrap">{label}</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Error detail panel (expanded under a row)
// ─────────────────────────────────────────────

interface RowDetailPanelProps {
  row: ImportRow;
}

const RowDetailPanel: React.FC<RowDetailPanelProps> = ({ row }) => {
  const hasIssues = row.errors.length > 0 || row.warnings.length > 0;
  if (!hasIssues) return null;

  return (
    <div className="mt-1 ml-8 space-y-1">
      {row.errors.map((e, i) => (
        <div key={`err-${i}`} className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">[{e.field}]</strong> {e.message}
          </span>
        </div>
      ))}
      {row.warnings.map((w, i) => (
        <div key={`warn-${i}`} className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">[{w.field}]</strong> {w.message}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Preview Row — List mode
// ─────────────────────────────────────────────

interface PreviewRowProps {
  row: ImportRow;
}

const PreviewRow: React.FC<PreviewRowProps> = ({ row }) => {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    new: {
      bg: 'bg-emerald-50/60 dark:bg-emerald-950/20 border-l-emerald-400',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
      label: 'TẠO MỚI',
      icon: <PlusCircle className="w-3 h-3" />,
    },
    update: {
      bg: 'bg-indigo-50/60 dark:bg-indigo-950/20 border-l-indigo-400',
      badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',
      label: 'CẬP NHẬT',
      icon: <ArrowUpCircle className="w-3 h-3" />,
    },
    error: {
      bg: 'bg-rose-50/60 dark:bg-rose-950/20 border-l-rose-400',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',
      label: 'LỖI',
      icon: <XCircle className="w-3 h-3" />,
    },
    warning: {
      bg: 'bg-amber-50/60 dark:bg-amber-950/20 border-l-amber-400',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
      label: 'CẢNH BÁO',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  };

  const cfg = statusConfig[row.status];
  const hasIssues = row.errors.length > 0 || row.warnings.length > 0;

  return (
    <div className={`border-l-[3px] ${cfg.bg} rounded-r-xl mb-1.5 overflow-hidden transition-all duration-200`}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 ${hasIssues ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-110' : ''}`}
        onClick={() => hasIssues && setExpanded((v) => !v)}
      >
        <span className="text-[10px] font-mono text-slate-400 w-6 text-right shrink-0">#{row.rowIndex}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide shrink-0 ${cfg.badge}`}>
          {cfg.icon}
          {cfg.label}
        </span>
        <code className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
          {row.data.sku || <span className="text-rose-400 italic">Thiếu SKU</span>}
        </code>
        <span className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate flex-1 min-w-0">
          {row.data.name || <span className="text-slate-400 italic">Chưa có tên</span>}
        </span>
        <div className="hidden sm:flex items-center gap-3 text-xs shrink-0">
          {typeof row.data.salePrice === 'number' ? (
            <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(row.data.salePrice)}</span>
          ) : (
            <span className="text-rose-500 font-mono text-[10px]">{String(row.data.salePrice)}</span>
          )}
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="text-slate-500 text-[10px]">{row.data.stock} {row.data.unit}</span>
        </div>
        {hasIssues && (
          <span className="text-slate-400 shrink-0">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
      {expanded && hasIssues && (
        <div className="px-3 pb-2.5">
          <RowDetailPanel row={row} />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Preview Table — Table mode (SCRUM-405)
// ─────────────────────────────────────────────

interface PreviewTableProps {
  rows: ImportRow[];
}

const STATUS_ROW_CLASSES: Record<ImportRow['status'], string> = {
  new: 'bg-emerald-50/50 dark:bg-emerald-950/10 hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
  update: 'bg-indigo-50/50 dark:bg-indigo-950/10 hover:bg-indigo-50 dark:hover:bg-indigo-950/20',
  error: 'bg-rose-50/60 dark:bg-rose-950/15 hover:bg-rose-50 dark:hover:bg-rose-950/25',
  warning: 'bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/20',
};

const STATUS_BADGE: Record<ImportRow['status'], { label: string; cls: string; icon: React.ReactNode }> = {
  new: { label: 'TẠO MỚI', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', icon: <PlusCircle className="w-2.5 h-2.5" /> },
  update: { label: 'CẬP NHẬT', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300', icon: <ArrowUpCircle className="w-2.5 h-2.5" /> },
  error: { label: 'LỖI', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', icon: <XCircle className="w-2.5 h-2.5" /> },
  warning: { label: 'CẢNH BÁO', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', icon: <AlertTriangle className="w-2.5 h-2.5" /> },
};

const PreviewTableRow: React.FC<{ row: ImportRow }> = ({ row }) => {
  const [expanded, setExpanded] = useState(false);
  const badge = STATUS_BADGE[row.status];
  const hasIssues = row.errors.length > 0 || row.warnings.length > 0;

  return (
    <>
      <tr
        className={`${STATUS_ROW_CLASSES[row.status]} transition-colors duration-150 ${hasIssues ? 'cursor-pointer' : ''}`}
        onClick={() => hasIssues && setExpanded((v) => !v)}
      >
        {/* # row */}
        <td className="py-2 pl-3 pr-2 text-center">
          <span className="text-[10px] font-mono text-slate-400">#{row.rowIndex}</span>
        </td>
        {/* Status */}
        <td className="py-2 px-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${badge.cls}`}>
            {badge.icon}
            {badge.label}
          </span>
        </td>
        {/* SKU */}
        <td className="py-2 px-2">
          <code className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {row.data.sku || <span className="text-rose-400 italic">—</span>}
          </code>
        </td>
        {/* Name */}
        <td className="py-2 px-2 max-w-[140px]">
          <span className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate block" title={row.data.name}>
            {row.data.name || <span className="text-slate-400 italic text-[11px]">Chưa có tên</span>}
          </span>
          {row.data.category && (
            <span className="text-[10px] text-slate-400 truncate block">{row.data.category}</span>
          )}
        </td>
        {/* Cost price */}
        <td className="py-2 px-2 text-right hidden md:table-cell">
          {typeof row.data.costPrice === 'number' ? (
            <span className="text-xs text-slate-600 dark:text-slate-300">{formatCurrency(row.data.costPrice)}</span>
          ) : (
            <span className="text-[10px] text-rose-500 font-mono">{String(row.data.costPrice) || '—'}</span>
          )}
        </td>
        {/* Sale price */}
        <td className="py-2 px-2 text-right">
          {typeof row.data.salePrice === 'number' ? (
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(row.data.salePrice)}</span>
          ) : (
            <span className="text-[10px] text-rose-500 font-mono">{String(row.data.salePrice) || '—'}</span>
          )}
        </td>
        {/* Stock */}
        <td className="py-2 px-2 text-right hidden sm:table-cell">
          <span className="text-xs text-slate-600 dark:text-slate-300">{row.data.stock}</span>
          <span className="text-[10px] text-slate-400 ml-1">{row.data.unit}</span>
        </td>
        {/* Errors / expand */}
        <td className="py-2 pl-2 pr-3 text-right">
          <div className="flex items-center justify-end gap-1">
            {row.errors.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                <XCircle className="w-3 h-3" />{row.errors.length}
              </span>
            )}
            {row.warnings.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                <AlertTriangle className="w-3 h-3" />{row.warnings.length}
              </span>
            )}
            {hasIssues && (
              <span className="text-slate-400 ml-0.5">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasIssues && (
        <tr className={STATUS_ROW_CLASSES[row.status]}>
          <td colSpan={8} className="pb-2.5 pl-12 pr-3">
            <div className="space-y-1">
              {row.errors.map((e, i) => (
                <div key={`te-${i}`} className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                  <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span><strong>[{e.field}]</strong> {e.message}</span>
                </div>
              ))}
              {row.warnings.map((w, i) => (
                <div key={`tw-${i}`} className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span><strong>[{w.field}]</strong> {w.message}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const PreviewTable: React.FC<PreviewTableProps> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        Không có dòng nào phù hợp bộ lọc
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2 pl-3 pr-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-center w-8">#</th>
            <th className="py-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-24">Trạng thái</th>
            <th className="py-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Mã SKU</th>
            <th className="py-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Tên / Danh mục</th>
            <th className="py-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right hidden md:table-cell">Giá nhập</th>
            <th className="py-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right">Giá bán</th>
            <th className="py-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right hidden sm:table-cell">Tồn kho</th>
            <th className="py-2 pl-2 pr-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right w-16">Lỗi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <PreviewTableRow key={row.rowIndex} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────
// Filter tab bar (in preview step)
// ─────────────────────────────────────────────

type FilterTab = 'all' | 'new' | 'update' | 'error' | 'warning';

interface FilterTabBarProps {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  counts: Record<FilterTab, number>;
}

const FilterTabBar: React.FC<FilterTabBarProps> = ({ active, onChange, counts }) => {
  const tabs: {
    key: FilterTab;
    label: string;
    color: string;
    activeColor: string;
    activeBadge: string;
    inactiveBadge: string;
  }[] = [
    {
      key: 'all',
      label: 'Tất cả',
      color: 'text-slate-500',
      activeColor: 'text-slate-900 dark:text-white border-b-2 border-indigo-600',
      activeBadge: 'bg-indigo-600 text-white',
      inactiveBadge: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
    },
    {
      key: 'new',
      label: 'Tạo mới',
      color: 'text-emerald-600',
      activeColor: 'text-emerald-700 dark:text-emerald-300 border-b-2 border-emerald-500',
      activeBadge: 'bg-emerald-500 text-white',
      inactiveBadge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600',
    },
    {
      key: 'update',
      label: 'Cập nhật',
      color: 'text-indigo-600',
      activeColor: 'text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500',
      activeBadge: 'bg-indigo-500 text-white',
      inactiveBadge: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600',
    },
    {
      key: 'error',
      label: 'Lỗi',
      color: 'text-rose-500',
      activeColor: 'text-rose-700 dark:text-rose-300 border-b-2 border-rose-500',
      activeBadge: 'bg-rose-500 text-white',
      inactiveBadge: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600',
    },
    {
      key: 'warning',
      label: 'Cảnh báo',
      color: 'text-amber-500',
      activeColor: 'text-amber-700 dark:text-amber-300 border-b-2 border-amber-500',
      activeBadge: 'bg-amber-500 text-white',
      inactiveBadge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600',
    },
  ];

  return (
    <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-700 mb-3">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors -mb-px
            ${active === tab.key ? tab.activeColor : `${tab.color} hover:text-slate-700 dark:hover:text-slate-300`}
          `}
        >
          {tab.label}
          {counts[tab.key] > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none
                ${active === tab.key ? tab.activeBadge : tab.inactiveBadge}
              `}
            >
              {counts[tab.key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Report Row (in done step)
// ─────────────────────────────────────────────

interface ReportRowItemProps {
  row: ImportReportRow;
}

const ReportRowItem: React.FC<ReportRowItemProps> = ({ row }) => {
  const [expanded, setExpanded] = useState(false);

  const outcomeConfig = {
    created: {
      border: 'border-l-emerald-400',
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
      label: 'ĐÃ TẠO',
      icon: <PlusCircle className="w-3 h-3" />,
    },
    updated: {
      border: 'border-l-indigo-400',
      bg: 'bg-indigo-50/50 dark:bg-indigo-950/20',
      badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
      label: 'ĐÃ CẬP NHẬT',
      icon: <ArrowUpCircle className="w-3 h-3" />,
    },
    skipped_error: {
      border: 'border-l-rose-400',
      bg: 'bg-rose-50/50 dark:bg-rose-950/20',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
      label: 'BỎ QUA (LỖI)',
      icon: <XCircle className="w-3 h-3" />,
    },
    skipped_warning: {
      border: 'border-l-amber-400',
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      label: 'BỎ QUA (CẢNH BÁO)',
      icon: <SkipForward className="w-3 h-3" />,
    },
  };

  const cfg = outcomeConfig[row.outcome];
  const hasIssues = row.errors.length > 0 || row.warnings.length > 0;

  return (
    <div className={`border-l-[3px] ${cfg.border} ${cfg.bg} rounded-r-xl mb-1.5 overflow-hidden`}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 ${hasIssues ? 'cursor-pointer' : ''}`}
        onClick={() => hasIssues && setExpanded((v) => !v)}
      >
        <span className="text-[10px] font-mono text-slate-400 w-6 text-right shrink-0">#{row.rowIndex}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide shrink-0 ${cfg.badge}`}>
          {cfg.icon}
          {cfg.label}
        </span>
        <code className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
          {row.sku || <span className="text-rose-400 italic">Thiếu SKU</span>}
        </code>
        <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1 min-w-0">
          {row.name || <span className="text-slate-400 italic">Chưa có tên</span>}
        </span>
        <div className="hidden sm:flex items-center gap-2 text-xs shrink-0 text-slate-500">
          {typeof row.salePrice === 'number' && (
            <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(row.salePrice)}</span>
          )}
          {row.stock !== undefined && (
            <span className="text-[10px]">{row.stock} {row.unit}</span>
          )}
        </div>
        {hasIssues && (
          <span className="text-slate-400 shrink-0">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
      {expanded && hasIssues && (
        <div className="px-3 pb-2.5 space-y-1">
          {row.errors.map((e, i) => (
            <div key={`re-${i}`} className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span><strong>[{e.field}]</strong> {e.message}</span>
            </div>
          ))}
          {row.warnings.map((w, i) => (
            <div key={`rw-${i}`} className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span><strong>[{w.field}]</strong> {w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Download template helper
// ─────────────────────────────────────────────

function downloadTemplate() {
  const headers = ['Mã SKU', 'Tên sản phẩm', 'Danh mục', 'Mã vạch', 'Giá nhập', 'Giá bán', 'Tồn kho', 'Tồn kho tối thiểu', 'Đơn vị', 'Nhà cung cấp', 'Mô tả'];
  const exampleRow = ['SP-NEW-001', 'Tên sản phẩm mẫu', 'Phụ Kiện Công Nghệ', '8938501XXXXX', '500000', '750000', '50', '10', 'Chiếc', 'Nhà Cung Cấp ABC', 'Mô tả ngắn sản phẩm'];
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, exampleRow].map((r) => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = encodeURI(csvContent);
  a.download = 'template_nhap_san_pham.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportReportCSV(report: ImportReport) {
  const headers = ['Dòng', 'Kết quả', 'Mã SKU', 'Tên sản phẩm', 'Giá bán', 'Tồn kho', 'Đơn vị', 'Lỗi / Cảnh báo'];
  const outcomeLabel: Record<string, string> = {
    created: 'Đã tạo mới',
    updated: 'Đã cập nhật',
    skipped_error: 'Bỏ qua (Lỗi)',
    skipped_warning: 'Bỏ qua (Cảnh báo)',
  };
  const rows = report.rows.map((r) => [
    r.rowIndex,
    outcomeLabel[r.outcome] ?? r.outcome,
    r.sku,
    `"${r.name.replace(/"/g, '""')}"`,
    typeof r.salePrice === 'number' ? r.salePrice : r.salePrice,
    r.stock,
    r.unit,
    `"${[...r.errors.map((e) => `[${e.field}] ${e.message}`), ...r.warnings.map((w) => `⚠ [${w.field}] ${w.message}`)].join('; ')}"`,
  ]);
  const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].map((r) => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = encodeURI(csv);
  a.download = `bao_cao_nhap_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─────────────────────────────────────────────
// Main ExcelImportModal
// ─────────────────────────────────────────────

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (validCount: number) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose, onImportSuccess }) => {
  const {
    step,
    setStep,
    importResult,
    importReport,
    setImportReport,
    buildReport,
    isDragging,
    setIsDragging,
    isProcessing,
    parseError,
    processFile,
    reset,
  } = useExcelImport();

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table');
  const [reportTab, setReportTab] = useState<'created' | 'updated' | 'skipped'>('created');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    reset();
    setFilterTab('all');
    setShowOnlyErrors(false);
    setViewMode('table');
    setReportTab('created');
    onClose();
  }, [reset, onClose]);

  const handleFileSelect = useCallback(
    (file: File) => {
      const allowed = ['.xlsx', '.xls', '.csv'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowed.includes(ext)) {
        alert('Chỉ hỗ trợ tệp Excel (.xlsx, .xls) hoặc CSV (.csv)');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('Tệp quá lớn. Giới hạn tối đa 10MB.');
        return;
      }
      processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect, setIsDragging],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    },
    [setIsDragging],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, [setIsDragging]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      e.target.value = '';
    },
    [handleFileSelect],
  );

  // ── Import confirmation with real report generation ──
  const handleConfirmImport = useCallback(async () => {
    if (!importResult) return;
    const startedAt = new Date().toISOString();
    setStep('importing');
    // Simulate processing time proportional to row count (min 1.2s, max 3s)
    const delay = Math.min(3000, Math.max(1200, importResult.rows.length * 80));
    await new Promise((r) => setTimeout(r, delay));
    const finishedAt = new Date().toISOString();
    const report = buildReport(importResult, startedAt, finishedAt);
    setImportReport(report);
    setStep('done');
    onImportSuccess?.(importResult.summary.validRows);
  }, [importResult, setStep, buildReport, setImportReport, onImportSuccess]);

  // ── Computed filter counts ──
  const filterCounts: Record<FilterTab, number> = importResult
    ? {
        all: importResult.rows.length,
        new: importResult.summary.newRows,
        update: importResult.summary.updateRows,
        error: importResult.summary.errorRows,
        warning: importResult.summary.warningRows,
      }
    : { all: 0, new: 0, update: 0, error: 0, warning: 0 };

  const filteredRows = importResult
    ? importResult.rows.filter((r) => {
        if (showOnlyErrors) return r.status === 'error' || r.status === 'warning';
        if (filterTab === 'all') return true;
        return r.status === filterTab;
      })
    : [];

  // ── Determine modal size by step ──
  const modalWidth = step === 'preview' || step === 'done' ? '4xl' : 'lg';

  // ── Render step content ──
  const renderContent = () => {
    // UPLOAD STEP
    if (step === 'upload') {
      return (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 group
              ${isDragging
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 scale-[1.01]'
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInputChange} />
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Đang phân tích tệp...</p>
                <p className="text-xs text-slate-400">Xin chờ trong giây lát</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30'}`}>
                  <FileSpreadsheet className={`w-8 h-8 transition-colors ${isDragging ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                    {isDragging ? 'Thả tệp vào đây' : 'Kéo thả tệp hoặc nhấn để chọn'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Hỗ trợ XLSX, XLS, CSV · Tối đa 10MB</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-lg">
                  <Upload className="w-3.5 h-3.5" />
                  Chọn tệp
                </div>
              </div>
            )}
          </div>

          {parseError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {parseError}
            </div>
          )}

          {/* Template download */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/40 dark:from-slate-800/60 dark:to-indigo-950/30 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                <FileDown className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tệp mẫu nhập sản phẩm</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tải về và điền dữ liệu theo đúng định dạng cột để tránh lỗi khi nhập.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} leftIcon={<Download className="w-3.5 h-3.5" />}>
              Tải mẫu
            </Button>
          </div>

          {/* Column guide */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-3">
              <Info className="w-3.5 h-3.5 text-indigo-500" />
              Cột bắt buộc trong tệp
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { name: 'Mã SKU', required: true },
                { name: 'Tên sản phẩm', required: true },
                { name: 'Giá bán', required: true },
                { name: 'Đơn vị', required: true },
                { name: 'Danh mục', required: false },
                { name: 'Giá nhập', required: false },
                { name: 'Tồn kho', required: false },
                { name: 'Mã vạch', required: false },
              ].map((col) => (
                <div key={col.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.required ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  {col.name}
                  {col.required && <span className="text-rose-500 text-[9px] font-bold">*</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // PREVIEW STEP (SCRUM-405)
    if (step === 'preview' && importResult) {
      const { summary } = importResult;
      return (
        <div className="space-y-4">
          {/* Summary badges */}
          <div className="grid grid-cols-5 gap-2">
            <SummaryBadge count={summary.totalRows} label="Tổng dòng" color="slate" icon={<FileSpreadsheet className="w-4 h-4" />} />
            <SummaryBadge count={summary.newRows} label="Tạo mới" color="green" icon={<PlusCircle className="w-4 h-4" />} />
            <SummaryBadge count={summary.updateRows} label="Cập nhật" color="blue" icon={<ArrowUpCircle className="w-4 h-4" />} />
            <SummaryBadge count={summary.errorRows} label="Lỗi" color="red" icon={<XCircle className="w-4 h-4" />} />
            <SummaryBadge count={summary.warningRows} label="Cảnh báo" color="amber" icon={<AlertTriangle className="w-4 h-4" />} />
          </div>

          {/* Error notice */}
          {summary.errorRows > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>{summary.errorRows} dòng có lỗi</strong> sẽ bị bỏ qua khi nhập. Chỉ{' '}
                <strong>{summary.validRows} dòng hợp lệ</strong> sẽ được xử lý.
              </span>
            </div>
          )}

          {/* Filter + view mode toggle */}
          <div className="flex items-center justify-between gap-2">
            <FilterTabBar
              active={filterTab}
              onChange={(t) => { setFilterTab(t); setShowOnlyErrors(false); }}
              counts={filterCounts}
            />
            <div className="flex items-center gap-1 shrink-0">
              {/* View mode toggle */}
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  title="Dạng bảng"
                  className={`p-1.5 transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  title="Dạng danh sách"
                  className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Error only toggle */}
              <button
                onClick={() => setShowOnlyErrors((v) => !v)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap
                  ${showOnlyErrors ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}
                `}
              >
                {showOnlyErrors ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showOnlyErrors ? 'Tất cả' : 'Chỉ lỗi & cảnh báo'}
              </button>
            </div>
          </div>

          {/* Preview content — list or table */}
          <div className="max-h-[360px] overflow-y-auto pr-0.5">
            {viewMode === 'table' ? (
              <PreviewTable rows={filteredRows} />
            ) : (
              filteredRows.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Không có dòng nào phù hợp bộ lọc</div>
              ) : (
                filteredRows.map((row) => <PreviewRow key={row.rowIndex} row={row} />)
              )
            )}
          </div>

          {/* File info footer */}
          <div className="flex items-center gap-2 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="font-medium">{importResult.fileName}</span>
            <span>·</span>
            <span>{(importResult.fileSize / 1024).toFixed(1)} KB</span>
            <span>·</span>
            <span>{summary.totalRows} dòng dữ liệu</span>
            {summary.validRows > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">{summary.validRows} dòng sẽ được nhập</span>
              </>
            )}
          </div>
        </div>
      );
    }

    // IMPORTING STEP
    if (step === 'importing') {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
              <FileSpreadsheet className="w-10 h-10 text-indigo-500" />
            </div>
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin absolute -bottom-2 -right-2 bg-white dark:bg-slate-900 rounded-full p-1" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Đang nhập dữ liệu...</p>
            <p className="text-sm text-slate-500">Vui lòng không đóng cửa sổ này</p>
          </div>
          <div className="w-48 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: '85%', transition: 'width 2.5s ease-out' }} />
          </div>
        </div>
      );
    }

    // DONE STEP — Detailed Import Report (SCRUM-406)
    if (step === 'done' && importReport) {
      const createdRows = importReport.rows.filter((r) => r.outcome === 'created');
      const updatedRows = importReport.rows.filter((r) => r.outcome === 'updated');
      const skippedRows = importReport.rows.filter((r) => r.outcome === 'skipped_error' || r.outcome === 'skipped_warning');

      const successRate = importReport.totalProcessed > 0
        ? Math.round(((importReport.created + importReport.updated) / importReport.totalProcessed) * 100)
        : 0;

      const reportRows: ImportReportRow[] =
        reportTab === 'created' ? createdRows : reportTab === 'updated' ? updatedRows : skippedRows;

      return (
        <div className="space-y-5">
          {/* Hero banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-700 dark:to-teal-800 p-5 text-white">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-2 right-6 w-24 h-24 rounded-full bg-white/20 blur-2xl" />
              <div className="absolute bottom-0 left-10 w-32 h-16 rounded-full bg-white/10 blur-xl" />
            </div>
            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold leading-tight">Nhập hàng loạt hoàn tất!</p>
                <p className="text-emerald-100 text-sm mt-0.5">
                  Xử lý <strong className="text-white">{importReport.totalProcessed}</strong> dòng từ{' '}
                  <strong className="text-white truncate">{importReport.fileName}</strong>
                </p>
                {/* Quick summary inline */}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {importReport.created > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 px-2 py-0.5 rounded-full font-medium">
                      <PlusCircle className="w-3 h-3" /> {importReport.created} tạo mới
                    </span>
                  )}
                  {importReport.updated > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 px-2 py-0.5 rounded-full font-medium">
                      <ArrowUpCircle className="w-3 h-3" /> {importReport.updated} SKU cập nhật
                    </span>
                  )}
                  {importReport.skippedError > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-rose-400/30 px-2 py-0.5 rounded-full font-medium">
                      <XCircle className="w-3 h-3" /> {importReport.skippedError} dòng lỗi
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-auto text-right shrink-0">
                <div className="text-3xl font-black">{successRate}%</div>
                <div className="text-[11px] text-emerald-100">tỷ lệ thành công</div>
              </div>
            </div>
          </div>

          {/* KPI cards row */}
          <div className="grid grid-cols-4 gap-2.5">
            {/* Created */}
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
              <PlusCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{importReport.created}</div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Sản phẩm tạo mới</div>
            </div>
            {/* Updated */}
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3 text-center">
              <TrendingUp className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{importReport.updated}</div>
              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">SKU được cập nhật</div>
            </div>
            {/* Skipped error */}
            <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-center">
              <XCircle className="w-5 h-5 text-rose-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{importReport.skippedError}</div>
              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">Dòng lỗi bỏ qua</div>
            </div>
            {/* Duration */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-center">
              <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <div className="text-2xl font-black text-slate-700 dark:text-slate-200">
                {importReport.durationMs < 1000
                  ? `${importReport.durationMs}ms`
                  : `${(importReport.durationMs / 1000).toFixed(1)}s`}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">Thời gian xử lý</div>
            </div>
          </div>

          {/* Timestamp + file info */}
          <div className="flex items-center gap-4 text-[11px] text-slate-400 px-1">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>{importReport.fileName}</span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span>{(importReport.fileSize / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {new Date(importReport.finishedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                {' '}–{' '}
                {new Date(importReport.finishedAt).toLocaleDateString('vi-VN')}
              </span>
            </div>
          </div>

          {/* Detail tabs */}
          <div>
            {/* Tab nav */}
            <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-700 mb-3">
              {([
                { key: 'created', label: 'Đã tạo mới', count: importReport.created, color: 'emerald' },
                { key: 'updated', label: 'Đã cập nhật', count: importReport.updated, color: 'indigo' },
                { key: 'skipped', label: 'Bỏ qua / Lỗi', count: importReport.skippedError + importReport.skippedWarning, color: 'rose' },
              ] as const).map((t) => {
                const colorMap = {
                  emerald: { active: 'text-emerald-700 dark:text-emerald-300 border-b-2 border-emerald-500', badge: 'bg-emerald-500 text-white', inactiveBadge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600' },
                  indigo: { active: 'text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500', badge: 'bg-indigo-500 text-white', inactiveBadge: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600' },
                  rose: { active: 'text-rose-700 dark:text-rose-300 border-b-2 border-rose-500', badge: 'bg-rose-500 text-white', inactiveBadge: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600' },
                };
                const cm = colorMap[t.color];
                const isActive = reportTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setReportTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors -mb-px
                      ${isActive ? cm.active : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}
                    `}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none ${isActive ? cm.badge : cm.inactiveBadge}`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row list */}
            <div className="max-h-[260px] overflow-y-auto pr-0.5">
              {reportRows.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  {reportTab === 'created' && 'Không có sản phẩm nào được tạo mới'}
                  {reportTab === 'updated' && 'Không có sản phẩm nào được cập nhật'}
                  {reportTab === 'skipped' && 'Không có dòng nào bị bỏ qua'}
                </div>
              ) : (
                reportRows.map((row) => <ReportRowItem key={row.rowIndex} row={row} />)
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // ── Footer buttons per step ──
  const renderFooter = () => {
    if (step === 'upload') {
      return <Button variant="secondary" onClick={handleClose}>Đóng</Button>;
    }

    if (step === 'preview') {
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => { reset(); setFilterTab('all'); setShowOnlyErrors(false); setViewMode('table'); }}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Chọn lại tệp
          </Button>
          <Button variant="secondary" onClick={handleClose}>Hủy bỏ</Button>
          {importResult && importResult.summary.validRows > 0 && (
            <Button variant="primary" onClick={handleConfirmImport} leftIcon={<CheckCircle2 className="w-4 h-4" />}>
              Nhập {importResult.summary.validRows} dòng hợp lệ
            </Button>
          )}
        </>
      );
    }

    if (step === 'importing') {
      return <Button variant="secondary" disabled>Đang xử lý...</Button>;
    }

    if (step === 'done' && importReport) {
      return (
        <>
          <Button
            variant="outline"
            onClick={() => exportReportCSV(importReport)}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất báo cáo CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => { reset(); setFilterTab('all'); setShowOnlyErrors(false); setViewMode('table'); setReportTab('created'); }}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            Nhập thêm tệp
          </Button>
          <Button variant="primary" onClick={handleClose} leftIcon={<X className="w-4 h-4" />}>
            Đóng & Làm mới
          </Button>
        </>
      );
    }

    return null;
  };

  const stepTitleMap: Record<ImportStep, string> = {
    upload: 'Nhập dữ liệu sản phẩm từ Excel',
    preview: 'Xem trước & Kiểm tra dữ liệu',
    importing: 'Đang nhập dữ liệu...',
    done: 'Báo cáo kết quả nhập hàng loạt',
  };

  const stepSubtitleMap: Record<ImportStep, string> = {
    upload: 'Tải lên tệp XLSX hoặc CSV để nhập hàng loạt sản phẩm',
    preview: `${importResult?.fileName ?? ''} — ${importResult?.summary.totalRows ?? 0} dòng dữ liệu`,
    importing: 'Hệ thống đang xử lý, vui lòng chờ...',
    done: importReport
      ? `${importReport.created} tạo mới · ${importReport.updated} SKU cập nhật · ${importReport.skippedError + importReport.skippedWarning} bỏ qua`
      : 'Dữ liệu đã được cập nhật vào hệ thống',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={stepTitleMap[step]}
      subtitle={stepSubtitleMap[step]}
      maxWidth={modalWidth}
      footer={renderFooter()}
    >
      <StepIndicator currentStep={step} />
      {renderContent()}
    </Modal>
  );
};
