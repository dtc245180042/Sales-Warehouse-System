import React from 'react';
import { ArrowRight, Scale } from 'lucide-react';
import { UnitConversion } from '../../types/Product';

/**
 * UnitQtySelector – Component dùng chung cho Phiếu Nhập / Xuất Kho.
 *
 * Cho phép người dùng:
 * 1. Chọn đơn vị nhập/xuất (ví dụ: Thùng, Lốc, Chiếc) từ danh sách đã cấu hình
 * 2. Nhập số lượng theo đơn vị đó
 * 3. Xem ngay số lượng quy đổi về đơn vị cơ sở bên cạnh
 */

export interface UnitQtySelectorValue {
  quantity: number;
  unitName: string;
  unitRatio: number;
  baseQty: number;
}

interface UnitQtySelectorProps {
  /** Danh sách đơn vị của sản phẩm (từ ProductUnitConfig.units) */
  units: UnitConversion[];
  /** Tên đơn vị cơ sở để hiển thị label */
  baseUnit: string;
  /** Giá trị hiện tại */
  value: UnitQtySelectorValue;
  /** Callback khi thay đổi */
  onChange: (val: UnitQtySelectorValue) => void;
  /** Giới hạn tối đa (tuỳ chọn – dùng cho xuất kho) */
  maxBaseQty?: number;
  /** Label cho ô số lượng */
  label?: string;
  /** ID prefix cho các input (accessibility) */
  idPrefix?: string;
}

export const UnitQtySelector: React.FC<UnitQtySelectorProps> = ({
  units,
  baseUnit,
  value,
  onChange,
  maxBaseQty,
  label = 'Số lượng',
  idPrefix = 'uqs',
}) => {
  const selectedUnit = units.find((u) => u.unitName === value.unitName) ?? units[0];

  const handleUnitChange = (unitName: string) => {
    const unit = units.find((u) => u.unitName === unitName);
    if (!unit) return;
    const newBaseQty = value.quantity * unit.ratio;
    onChange({
      quantity: value.quantity,
      unitName: unit.unitName,
      unitRatio: unit.ratio,
      baseQty: newBaseQty,
    });
  };

  const handleQtyChange = (rawQty: number) => {
    const qty = Math.max(1, rawQty || 1);
    const newBaseQty = qty * (selectedUnit?.ratio ?? 1);
    // Nếu có giới hạn tồn kho, cap lại
    const finalBaseQty = maxBaseQty !== undefined ? Math.min(newBaseQty, maxBaseQty) : newBaseQty;
    const finalQty = maxBaseQty !== undefined
      ? Math.min(qty, Math.floor(maxBaseQty / (selectedUnit?.ratio ?? 1)))
      : qty;

    onChange({
      quantity: finalQty,
      unitName: value.unitName,
      unitRatio: selectedUnit?.ratio ?? 1,
      baseQty: finalBaseQty,
    });
  };

  const isBaseUnit = selectedUnit?.isBase ?? true;
  const showConversionBadge = !isBaseUnit;

  // Màu badge theo loại: nhập = indigo, xuất tính theo maxBaseQty
  const overLimit = maxBaseQty !== undefined && value.baseQty > maxBaseQty;

  return (
    <div className="space-y-1.5">
      {/* Row: số lượng + đơn vị */}
      <div className="flex gap-2 items-end">
        {/* Qty input */}
        <div className="flex-1 min-w-0">
          <label
            className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
            htmlFor={`${idPrefix}-qty`}
          >
            {label} *
          </label>
          <input
            id={`${idPrefix}-qty`}
            type="number"
            min={1}
            max={maxBaseQty !== undefined ? Math.floor(maxBaseQty / (selectedUnit?.ratio ?? 1)) : undefined}
            value={value.quantity}
            onChange={(e) => handleQtyChange(Number(e.target.value))}
            className={`w-full px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold focus:ring-1 focus:ring-indigo-500 outline-none transition
              ${overLimit
                ? 'border-rose-400 dark:border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
              }`}
          />
        </div>

        {/* Unit selector */}
        <div className="w-28 shrink-0">
          <label
            className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
            htmlFor={`${idPrefix}-unit`}
          >
            Đơn vị
          </label>
          {units.length > 1 ? (
            <select
              id={`${idPrefix}-unit`}
              value={value.unitName}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {units.map((u) => (
                <option key={u.id} value={u.unitName}>
                  {u.unitName}{u.isBase ? ' ★' : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              {value.unitName}
            </div>
          )}
        </div>
      </div>

      {/* Conversion display badge */}
      {showConversionBadge && (
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            overLimit
              ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900'
          }`}
        >
          <Scale className="w-3 h-3 shrink-0" />
          <span>
            {value.quantity} <strong>{value.unitName}</strong>
          </span>
          <ArrowRight className="w-3 h-3 shrink-0 opacity-60" />
          <span>
            <strong className="text-sm">{value.baseQty}</strong> {baseUnit}
          </span>
          {overLimit && (
            <span className="ml-1 text-rose-600 dark:text-rose-400 font-bold">
              (Vượt tồn kho!)
            </span>
          )}
        </div>
      )}

      {/* Max stock hint for non-base units */}
      {maxBaseQty !== undefined && !isBaseUnit && (
        <p className="text-[10px] text-slate-400 pl-1">
          Tồn kho: <strong>{maxBaseQty}</strong> {baseUnit}
          {' → '} tối đa <strong>{Math.floor(maxBaseQty / (selectedUnit?.ratio ?? 1))}</strong> {value.unitName}
        </p>
      )}
    </div>
  );
};
