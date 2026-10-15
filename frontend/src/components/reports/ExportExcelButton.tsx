import React, { useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export interface ExportExcelButtonProps {
  id?: string;
  label?: string;
  onExport: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary' | 'outline';
}

export const ExportExcelButton: React.FC<ExportExcelButtonProps> = ({
  id = 'btn-export-excel',
  label = 'Xuất Excel',
  onExport,
  disabled = false,
  className = '',
  size = 'md',
  variant = 'outline',
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const { showToast } = useToast();

  const handleExport = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || status === 'loading') return;

    setStatus('loading');
    try {
      await onExport();
      setStatus('success');
      showToast('Đã xuất file báo cáo thành công!', 'success');
      setTimeout(() => {
        setStatus('idle');
      }, 2000);
    } catch (err: unknown) {
      console.error('[ExportExcelButton] Export failed:', err);
      setStatus('idle');
      const msg = err instanceof Error ? err.message : 'Xuất dữ liệu thất bại. Vui lòng thử lại!';
      showToast(msg, 'error');
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs gap-1.5'
      : 'px-3.5 py-2 text-sm gap-2';

  const variantClasses =
    variant === 'primary'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:bg-slate-300 dark:disabled:bg-slate-800'
      : variant === 'secondary'
      ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
      : 'border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900';

  const successClasses =
    status === 'success'
      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300'
      : '';

  return (
    <button
      id={id}
      type="button"
      onClick={handleExport}
      disabled={disabled || status === 'loading'}
      title={disabled ? 'Không có dữ liệu để xuất' : label}
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${successClasses} ${className}`}
    >
      {status === 'loading' ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
          <span>Đang xuất...</span>
        </>
      ) : status === 'success' ? (
        <>
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Đã tải xuống!</span>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};
