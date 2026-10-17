import React, { useState, useEffect, forwardRef } from 'react';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: number | null;
  onChange?: (value: number) => void;
  suffix?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className = '', placeholder = '0', suffix, disabled, ...rest }, ref) => {
    const [displayValue, setDisplayValue] = useState<string>(() =>
      value !== undefined && value !== null && value !== 0 ? formatCurrencyInput(value) : value === 0 ? '0' : ''
    );

    // Đồng bộ khi value từ props thay đổi (ví dụ reset form hoặc load dữ liệu từ ngoài)
    useEffect(() => {
      const currentParsed = parseCurrencyInput(displayValue);
      // Nếu giá trị parse hiện tại đã khớp với value (kể cả khi đang gõ hoặc đang xóa trắng), không ép re-format
      if (currentParsed === value && (displayValue !== '' || value === 0)) {
        return;
      }
      const formatted =
        value !== undefined && value !== null && !isNaN(value) && value !== 0
          ? formatCurrencyInput(value)
          : value === 0
          ? (displayValue === '' ? '' : '0')
          : '';
      setDisplayValue(formatted);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawDigits = e.target.value.replace(/\D/g, '');
      const formatted = formatCurrencyInput(rawDigits);
      setDisplayValue(formatted);
      const parsedNum = parseCurrencyInput(rawDigits);
      if (onChange) {
        onChange(parsedNum);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Khi click vào nếu giá trị là 0, tự động bôi đen để gõ đè tiện lợi
      if (displayValue === '0') {
        e.target.select();
      }
      rest.onFocus?.(e);
    };

    if (suffix) {
      return (
        <div className="relative w-full">
          <input
            {...rest}
            ref={ref}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            placeholder={placeholder}
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            className={`${className} ${suffix ? 'pr-12' : ''}`}
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none select-none">
            {suffix}
          </span>
        </div>
      );
    }

    return (
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        className={className}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
