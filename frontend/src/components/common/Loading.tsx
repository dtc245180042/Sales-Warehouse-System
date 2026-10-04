import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
  text?: string;
  fullPage?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({ text = 'Đang tải dữ liệu...', fullPage = false }) => {
  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-600">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 animate-pulse">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{text}</span>
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 6 }) => {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-8 bg-slate-100 dark:bg-slate-800/60 rounded flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
};
