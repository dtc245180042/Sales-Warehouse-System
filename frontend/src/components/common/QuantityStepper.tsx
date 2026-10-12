import React, { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

/**
 * QuantityStepper – Bộ tăng giảm và nhập số lượng mượt mà, không bị nhảy giật:
 * 1. Cho phép xóa trắng ô (Backspace) để nhập số mới mà không bị ép về số cũ ngay lập tức.
 * 2. Tự động bôi đen (select all) khi click vào ô để gõ đè số mới tiện lợi.
 * 3. Chuẩn hóa về min/max khi onBlur.
 * 4. Nút - và + tự động disable khi đạt cận biên, không văng lỗi gián đoạn.
 * 5. Ẩn spinner mặc định của trình duyệt để tránh nhảy layout.
 */
export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  id,
}) => {
  const [inputVal, setInputVal] = useState<string>(String(value));

  useEffect(() => {
    setInputVal(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Cho phép rỗng hoặc chỉ toàn chữ số
    if (raw === '' || /^\d+$/.test(raw)) {
      setInputVal(raw);
      if (raw !== '') {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) {
          onChange(parsed);
        }
      }
    }
  };

  const handleBlur = () => {
    let num = parseInt(inputVal, 10);
    if (isNaN(num) || num < min) {
      num = min;
    } else if (max !== undefined && num > max) {
      num = max;
    }
    setInputVal(String(num));
    onChange(num);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleDecrement = () => {
    const curr = parseInt(inputVal, 10) || min;
    const next = Math.max(min, curr - 1);
    setInputVal(String(next));
    onChange(next);
  };

  const handleIncrement = () => {
    const curr = parseInt(inputVal, 10) || min;
    const next = max !== undefined ? Math.min(max, curr + 1) : curr + 1;
    setInputVal(String(next));
    onChange(next);
  };

  const isMin = value <= min;
  const isMax = max !== undefined && value >= max;

  const pyClass = size === 'sm' ? 'py-0.5 px-2 text-xs' : 'py-1 px-2.5 text-sm';
  const inputWidth = size === 'sm' ? 'w-12 py-0.5 text-xs' : 'w-14 py-1 text-sm';

  return (
    <div
      className={`inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-sm transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={isMin || disabled}
        className={`${pyClass} text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors select-none`}
        title="Giảm"
        aria-label="Giảm số lượng"
      >
        <Minus className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={inputVal}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        disabled={disabled}
        className={`${inputWidth} text-center font-bold font-mono bg-transparent border-x border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />

      <button
        type="button"
        onClick={handleIncrement}
        disabled={isMax || disabled}
        className={`${pyClass} text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors select-none`}
        title="Tăng"
        aria-label="Tăng số lượng"
      >
        <Plus className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>
    </div>
  );
};
