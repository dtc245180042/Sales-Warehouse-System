import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export interface DeltaCellProps {
  delta?: number;
  pct?: number;
  format?: 'currency' | 'number' | 'percent';
  size?: 'sm' | 'md';
  showIcon?: boolean;
  showAbsolute?: boolean;
  isPercentagePoints?: boolean; // pp instead of % (e.g. +2.5 pp for margin)
  className?: string;
}

export const DeltaCell: React.FC<DeltaCellProps> = ({
  delta = 0,
  pct = 0,
  format = 'currency',
  size = 'sm',
  showIcon = true,
  showAbsolute = true,
  isPercentagePoints = false,
  className = '',
}) => {
  const isPositive = delta > 0.0001;
  const isNegative = delta < -0.0001;

  const colorClass = isPositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : isNegative
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-slate-400 dark:text-slate-500';

  const bgClass = isPositive
    ? 'bg-emerald-50 dark:bg-emerald-950/30'
    : isNegative
    ? 'bg-rose-50 dark:bg-rose-950/30'
    : 'bg-slate-50 dark:bg-slate-800/40';

  const formatDeltaValue = (val: number) => {
    const sign = val > 0 ? '+' : '';
    if (format === 'currency') return `${sign}${formatCurrency(val)}`;
    if (format === 'percent') return `${sign}${val.toFixed(1)}%`;
    return `${sign}${formatNumber(val)}`;
  };

  const formatPctValue = (p: number) => {
    const sign = p > 0 ? '+' : '';
    const unit = isPercentagePoints ? ' pp' : '%';
    return `${sign}${p.toFixed(1)}${unit}`;
  };

  const textSizes = size === 'sm' ? 'text-xs' : 'text-sm';
  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-medium ${bgClass} ${colorClass} ${textSizes} ${className}`}
      title={`Chênh lệch: ${formatDeltaValue(delta)} (${formatPctValue(pct)})`}
    >
      {showIcon && (
        <span className="shrink-0">
          {isPositive ? (
            <TrendingUp className={iconSizes} />
          ) : isNegative ? (
            <TrendingDown className={iconSizes} />
          ) : (
            <Minus className={iconSizes} />
          )}
        </span>
      )}

      {showAbsolute && (
        <span className="font-mono font-semibold">
          {formatDeltaValue(delta)}
        </span>
      )}

      <span className="opacity-80 font-mono">
        ({formatPctValue(pct)})
      </span>
    </div>
  );
};
