import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  keywords?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Chọn một mục',
  searchPlaceholder = 'Tìm kiếm...',
  required = false,
  disabled = false,
  className = '',
  emptyMessage = 'Không tìm thấy kết quả phù hợp',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Đóng dropdown khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Tự động focus ô tìm kiếm khi mở dropdown
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase().trim();
    return options.filter((opt) => {
      const matchLabel = opt.label?.toLowerCase().includes(term);
      const matchSub = opt.subLabel ? opt.subLabel.toLowerCase().includes(term) : false;
      const matchKeywords = opt.keywords ? opt.keywords.toLowerCase().includes(term) : false;
      return matchLabel || matchSub || matchKeywords;
    });
  }, [options, searchTerm]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Nút bấm hiển thị trạng thái chọn */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full px-3 py-2 bg-white dark:bg-slate-800 border ${
          isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-700'
        } rounded-xl text-xs sm:text-sm text-left flex items-center justify-between transition-all duration-150 ${
          disabled
            ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-900'
            : 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <span
          className={`truncate mr-2 ${
            value ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {selectedOption ? (
            <span>
              {selectedOption.label}{' '}
              {selectedOption.subLabel && (
                <span className="text-slate-400 font-normal">{selectedOption.subLabel}</span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-500' : ''
          }`}
        />
      </button>

      {/* Input ẩn phục vụ HTML5 form validation nếu cần */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          tabIndex={-1}
          className="sr-only"
          required
        />
      )}

      {/* Khung Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Thanh tìm kiếm bên trong thẻ option */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Danh sách các Option */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-50 dark:divide-slate-700/30">
            {/* Lựa chọn mặc định (bỏ 2 gạch --) */}
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs rounded-lg transition-colors flex items-center justify-between ${
                !value
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
              }`}
            >
              <span>{placeholder}</span>
              {!value && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs sm:text-sm rounded-lg transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {opt.label}
                      </span>
                      {opt.subLabel && (
                        <span className="text-[11px] text-slate-400">{opt.subLabel}</span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
