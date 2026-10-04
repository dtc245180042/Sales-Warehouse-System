import React, { useState, useEffect } from 'react';
import { Copy, X, Calendar, Percent, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '../common/Button';
import { PriceList, PriceListCloneRequest, priceListService, CUSTOMER_GROUPS } from '../../services/priceListService';
import { useToast } from '../../contexts/ToastContext';

interface CloneVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPriceList: PriceList) => void;
  parentPriceList: PriceList | null;
}

export const CloneVersionModal: React.FC<CloneVersionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  parentPriceList,
}) => {
  const { showToast } = useToast();

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [priceAdjustmentPercent, setPriceAdjustmentPercent] = useState<number | ''>(0);
  const [autoCloseParent, setAutoCloseParent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (parentPriceList) {
      const nextVersion = (parentPriceList.version || 1) + 1;
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Format suggested code: remove existing version suffix if present, then add new version
      const baseCode = parentPriceList.code.replace(/-V\d+$/i, '');
      setNewCode(`${baseCode}-V${nextVersion}`);
      setNewName(`${parentPriceList.name} (Phiên bản ${nextVersion})`);
      setValidFrom(today);
      setValidTo(nextMonth);
      setPriceAdjustmentPercent(0);
      setAutoCloseParent(true);
    }
  }, [parentPriceList]);

  if (!isOpen || !parentPriceList) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validFrom) {
      showToast('Vui lòng chọn ngày bắt đầu hiệu lực cho phiên bản mới', 'warning');
      return;
    }

    if (validTo && validTo < validFrom) {
      showToast('Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload: PriceListCloneRequest = {
        new_code: newCode.trim() || undefined,
        new_name: newName.trim() || undefined,
        valid_from: new Date(validFrom).toISOString(),
        valid_to: validTo ? new Date(validTo).toISOString() : null,
        copy_items: true,
        price_adjustment_percent: priceAdjustmentPercent !== '' ? Number(priceAdjustmentPercent) : 0,
        auto_close_parent: autoCloseParent,
      };

      const result = await priceListService.cloneVersion(parentPriceList.id, payload);
      showToast(
        `Đã tạo thành công phiên bản mới "${result.code}" (v${result.version}). Bạn có thể tùy ý điều chỉnh giá các mặt hàng!`,
        'success'
      );
      onSuccess(result);
      onClose();
    } catch (err: any) {
      const msg = err.data?.detail || err.message || 'Lỗi tạo phiên bản kế thừa';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const grp = CUSTOMER_GROUPS.find((g) => g.value === parentPriceList.customer_group);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tạo Phiên Bản Kế Thừa (v{(parentPriceList.version || 1) + 1})
              </h3>
              <p className="text-xs text-slate-500">
                Nhân bản toàn bộ danh mục mặt hàng để cập nhật chính sách giá mới
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
            {/* Parent Info Box */}
            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  {parentPriceList.name}
                </span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  {parentPriceList.code} (v{parentPriceList.version})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-slate-500">
                <span>Nhóm: <strong>{grp?.label || parentPriceList.customer_group}</strong></span>
                <span>•</span>
                <span>Mặt hàng: <strong>{parentPriceList.items_count || parentPriceList.items?.length || 0} sản phẩm</strong></span>
                <span>•</span>
                <span>Đơn hàng: <strong>{parentPriceList.orders_count} đơn đã phát sinh</strong></span>
              </div>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mã phiên bản mới *
                </label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên phiên bản mới *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Effective Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Ngày bắt đầu hiệu lực *
                </label>
                <input
                  type="date"
                  required
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Ngày kết thúc hiệu lực
                </label>
                <input
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Bulk price adjustment percent */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Điều chỉnh giá bán đồng loạt theo % (Tùy chọn)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.5"
                    value={priceAdjustmentPercent}
                    onChange={(e) =>
                      setPriceAdjustmentPercent(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="VD: 5 để tăng 5%, -3 để giảm 3%"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                  <Percent className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPriceAdjustmentPercent(5)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold"
                  >
                    +5%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceAdjustmentPercent(10)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold"
                  >
                    +10%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceAdjustmentPercent(-5)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold"
                  >
                    -5%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceAdjustmentPercent(0)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold"
                  >
                    Giữ nguyên
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Hệ thống sẽ tự động nhân giá bán các mặt hàng với tỷ lệ này và tự động làm tròn.
              </p>
            </div>

            {/* Auto Close Parent Checkbox */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60">
              <input
                type="checkbox"
                id="autoCloseParent"
                checked={autoCloseParent}
                onChange={(e) => setAutoCloseParent(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="autoCloseParent" className="text-slate-700 dark:text-slate-300 cursor-pointer">
                <span className="font-bold text-amber-800 dark:text-amber-300">
                  Tự động đóng ngày hiệu lực của phiên bản cũ (Khuyên dùng)
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Ngày kết thúc (valid_to) của phiên bản v{parentPriceList.version} sẽ được cập nhật trùng thời điểm
                  bắt đầu của phiên bản mới để tránh bị chồng lấn bảng giá trong cùng nhóm.
                </p>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting}
              className="gap-1.5 shadow-md shadow-indigo-500/20"
            >
              <Copy className="w-4 h-4" />
              {submitting ? 'Đang tạo...' : `Xác nhận tạo phiên bản v${(parentPriceList.version || 1) + 1}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
