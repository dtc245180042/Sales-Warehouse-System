import React from 'react';

interface ProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showText?: boolean;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  percentage,
  size = 100,
  strokeWidth = 10,
  className = '',
  showText = true,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Cap visual circle at 100% stroke, though percentage can exceed 100%
  const normalizedPercentage = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (normalizedPercentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= 100) return 'text-emerald-500';
    if (percentage >= 75) return 'text-blue-500';
    if (percentage >= 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getBgColor = () => {
    if (percentage >= 100) return 'text-emerald-100 dark:text-emerald-950/40';
    if (percentage >= 75) return 'text-blue-100 dark:text-blue-950/40';
    if (percentage >= 50) return 'text-amber-100 dark:text-amber-950/40';
    return 'text-rose-100 dark:text-rose-950/40';
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          className={getBgColor()}
        />
        {/* Progress bar */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          className={`${getColor()} transition-all duration-700 ease-out`}
        />
      </svg>
      {showText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 leading-none">
            {percentage}%
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">đạt</span>
        </div>
      )}
    </div>
  );
};
