import React, { useState } from 'react';
import {
  Layers,
  Info,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Edit3,
} from 'lucide-react';
import {
  DiscountTier,
  volumeDiscountService,
} from '../../services/volumeDiscountService';
import { useToast } from '../../contexts/ToastContext';

interface VolumeDiscountPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPolicyUpdated?: (newTiers: DiscountTier[]) => void;
}

export const VolumeDiscountPolicyModal: React.FC<VolumeDiscountPolicyModalProps> = ({
  isOpen,
  onClose,
  onPolicyUpdated,
}) => {
  const { showToast } = useToast();
  const [tiers, setTiers] = useState<DiscountTier[]>(() => volumeDiscountService.getTiers());
  const [isEditing, setIsEditing] = useState(false);
  const [editList, setEditList] = useState<DiscountTier[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = () => {
    setEditList([...tiers].map((t) => ({ ...t })));
    setValidationError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setValidationError(null);
  };

  const handleAddTier = () => {
    const maxQty = editList.reduce((max, t) => Math.max(max, t.minQty), 0);
    const lastDiscount = editList.reduce((max, t) => Math.max(max, t.discountPct), 0);
    setEditList([
      ...editList,
      {
        minQty: maxQty + 50,
        discountPct: Math.min(100, lastDiscount + 3),
      },
    ]);
  };

  const handleRemoveTier = (index: number) => {
    if (editList[index].minQty === 1) {
      showToast('Không thể xóa mốc cơ bản (1 sp, 0%)', 'warning');
      return;
    }
    setEditList(editList.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, field: keyof DiscountTier, val: number) => {
    const updated = [...editList];
    updated[index] = {
      ...updated[index],
      [field]: val,
    };
    setEditList(updated);
  };

  const handleSavePolicy = () => {
    const validation = volumeDiscountService.validateTiers(editList);
    if (!validation.valid) {
      setValidationError(validation.error || 'Dữ liệu chính sách không hợp lệ');
      return;
    }

    setValidationError(null);
    const sorted = [...editList].sort((a, b) => a.minQty - b.minQty);
    volumeDiscountService.saveTiers(sorted);
    setTiers(sorted);
    setIsEditing(false);
    showToast('Đã lưu và kích hoạt chính sách chiết khấu theo sản lượng mới!', 'success');
    if (onPolicyUpdated) {
      onPolicyUpdated(sorted);
    }
  };

  const handleResetDefault = () => {
    const def = volumeDiscountService.resetToDefault();
    setTiers(def);
    setEditList(def.map((t) => ({ ...t })));
    setIsEditing(false);
    setValidationError(null);
    showToast('Đã khôi phục chính sách chiết khấu mặc định!', 'info');
    if (onPolicyUpdated) {
      onPolicyUpdated(def);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Chính Sách Chiết Khấu Theo Sản Lượng
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEditing ? 'Khai báo & chỉnh sửa các ngưỡng chiết khấu' : 'Tự động tính chiết khấu khi đạt ngưỡng số lượng'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Validation error alert */}
        {validationError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Content table */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {!isEditing ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2.5 px-3 text-left">Số lượng mua</th>
                  <th className="py-2.5 px-3 text-right">Chiết khấu (%)</th>
                  <th className="py-2.5 px-3 text-right">Mức áp dụng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tiers.map((tier, idx) => {
                  const nextTier = tiers[idx + 1];
                  const rangeLabel = nextTier
                    ? `${tier.minQty} – ${nextTier.minQty - 1} sp`
                    : `≥ ${tier.minQty} sp`;
                  const isActive = tier.discountPct === 0;
                  return (
                    <tr
                      key={tier.minQty}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 ${
                        !isActive ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''
                      }`}
                    >
                      <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {rangeLabel}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-black ${
                          tier.discountPct > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {tier.discountPct > 0 ? `${tier.discountPct}%` : '0%'}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {tier.discountPct === 0 ? 'Giá chuẩn' : `Giảm ${tier.discountPct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 px-1">
                <span className="col-span-5">Ngưỡng SL tối thiểu</span>
                <span className="col-span-5">Chiết khấu (%)</span>
                <span className="col-span-2 text-center">Xóa</span>
              </div>
              {editList.map((tier, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <div className="col-span-5 flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      disabled={idx === 0}
                      value={tier.minQty}
                      onChange={(e) =>
                        handleFieldChange(idx, 'minQty', parseInt(e.target.value) || 1)
                      }
                      className="w-full px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-xs font-bold disabled:opacity-50"
                    />
                    <span className="text-[11px] text-slate-400 shrink-0">sp</span>
                  </div>

                  <div className="col-span-5 flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={idx === 0}
                      value={tier.discountPct}
                      onChange={(e) =>
                        handleFieldChange(
                          idx,
                          'discountPct',
                          Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                        )
                      }
                      className="w-full px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-xs font-bold disabled:opacity-50 text-right"
                    />
                    <span className="text-[11px] text-slate-400 shrink-0">%</span>
                  </div>

                  <div className="col-span-2 text-center">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Xóa mốc"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddTier}
                className="w-full py-2 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm ngưỡng số lượng</span>
              </button>
            </div>
          )}
        </div>

        {/* Rule note */}
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 space-y-1 shrink-0">
          <div className="flex items-center gap-1 font-bold">
            <Info className="w-3.5 h-3.5" />
            <span>Quy tắc áp dụng</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Hệ thống tự động áp dụng bậc chiết khấu tương ứng ngay khi số lượng sản phẩm đạt mốc và trừ trực tiếp vào giá bán từng dòng hàng.
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={handleStartEdit}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Khai báo / Sửa chính sách</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
              >
                Đóng
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleResetDefault}
                className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 text-xs flex items-center gap-1"
                title="Khôi phục mặc định"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Mặc định</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSavePolicy}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 flex items-center gap-1 shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Lưu chính sách</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
