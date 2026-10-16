import React from 'react';

export interface TurnoverRatioBarProps {
  ratio: number;
  maxRatio?: number;
  size?: 'sm' | 'md';
  showText?: boolean;
  className?: string;
}

export const TurnoverRatioBar: React.FC<TurnoverRatioBarProps> = ({
  ratio,
  maxRatio = 36, // ~3 times per month is high velocity
  size = 'md',
  showText = true,
  className = '',
}) => {
  const boundedRatio = Math.max(0, ratio);
  const percentage = Math.min(100, Math.round((boundedRatio / maxRatio) * 100));

  let colorClass = 'bg-rose-500';
  let badgeText = 'Chậm';
  let badgeColor = 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400';

  if (boundedRatio >= 24) {
    colorClass = 'bg-indigo-500';
    badgeText = 'Xuất sắc';
    badgeColor = 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400';
  } else if (boundedRatio >= 12) {
    colorClass = 'bg-emerald-500';
    badgeText = 'Tốt';
    badgeColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400';
  } else if (boundedRatio >= 4) {
    colorClass = 'bg-amber-500';
    badgeText = 'Bình thường';
    badgeColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400';
  }

  const barHeight = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={`space-y-1 ${className}`}>
      {showText && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
            {boundedRatio.toFixed(1)} <span className="font-normal text-[11px] text-slate-400">lần/năm</span>
          </span>
          <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${badgeColor}`}>
            {badgeText}
          </span>
        </div>
      )}
      <div className={`w-full bg-slate-100 dark:bg-slate-800 rounded-full ${barHeight} overflow-hidden`}>
        <div
          className={`${colorClass} ${barHeight} rounded-full transition-all duration-500`}
          style={{ width: `${Math.max(percentage, 3)}%` }}
        />
      </div>
    </div>
  );
};
