import React, { useState } from 'react';
import { ShieldCheck, X, AlertTriangle, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
import { Button } from '../common/Button';
import { PriceList, priceListService, CUSTOMER_GROUPS } from '../../services/priceListService';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PriceListApproveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  priceList: PriceList | null;
}

export const PriceListApproveModal: React.FC<PriceListApproveModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  priceList,
}) => {
  const { showToast } = useToast();
  const [note, setNote] = useState('');
  const [autoResolveOverlap, setAutoResolveOverlap] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !priceList) return null;

  const subFloorItems = (priceList.items || []).filter((it) => it.sale_price < it.floor_price);
  const grp = CUSTOMER_GROUPS.find((g) => g.value === priceList.customer_group);

  const handleExecute = async (approved: boolean) => {
    setSubmitting(true);
    try {
      await priceListService.approve(
        priceList.id,
        approved,
        note.trim() || undefined,
        autoResolveOverlap
      );

      showToast(
        approved
          ? `Đã phê duyệt và kích hoạt áp dụng bảng giá "${priceList.code}" thành công!`
          : `Đã từ chối phê duyệt bảng giá "${priceList.code}".`,
        approved ? 'success' : 'info'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.data?.detail || err.message || 'Lỗi xử lý phê duyệt bảng giá';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Xét Duyệt Bảng Giá
              </h3>
              <p className="text-xs text-slate-500">
                Thẩm quyền: Quản lý kinh doanh / Giám đốc / Quản trị viên
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

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          {/* Target Price List Info */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {priceList.name}
              </span>
              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                {priceList.code} (v{priceList.version})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-slate-500 text-[11px]">
              <span>Áp dụng: <strong>{grp?.label || priceList.customer_group}</strong></span>
              <span>•</span>
              <span>Hiệu lực: {formatDate(priceList.valid_from)} {priceList.valid_to ? `→ ${formatDate(priceList.valid_to)}` : '→ Vô thời hạn'}</span>
            </div>
          </div>

          {/* Sub-floor alert */}
          {subFloorItems.length > 0 ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Có {subFloorItems.length} sản phẩm bán thấp hơn giá sàn quy định:</span>
              </div>
              <div className="space-y-1 pl-6">
                {subFloorItems.slice(0, 3).map((it) => (
                  <div key={it.id || it.product_id} className="text-amber-900 dark:text-amber-200 text-[11px] flex justify-between">
                    <span>• {it.product_name}</span>
                    <span className="tabular-nums font-semibold">
                      {formatCurrency(it.sale_price)} &lt; Sàn {formatCurrency(it.floor_price)}
                    </span>
                  </div>
                ))}
                {subFloorItems.length > 3 && (
                  <span className="text-[11px] text-amber-700 italic block">
                    ...và {subFloorItems.length - 3} sản phẩm khác dưới sàn
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Toàn bộ giá bán đều đạt chuẩn và cao hơn hoặc bằng giá sàn tối thiểu.</span>
            </div>
          )}

          {/* Auto resolve overlap */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-3">
            <input
              type="checkbox"
              id="autoResolveOverlap"
              checked={autoResolveOverlap}
              onChange={(e) => setAutoResolveOverlap(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="autoResolveOverlap" className="text-slate-700 dark:text-slate-300 cursor-pointer">
              <span className="font-bold text-indigo-900 dark:text-indigo-200">
                Tự động ngắt ngày kết thúc bảng giá cũ cùng nhóm (Chống chồng lấn)
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Nếu có bảng giá khác cùng nhóm đang áp dụng và trùng ngày hiệu lực, hệ thống sẽ tự động cập nhật
                ngày kết thúc của bảng giá đó để bảng giá mới này có hiệu lực ngay lập tức.
              </p>
            </label>
          </div>

          {/* Note Input */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Ghi chú phê duyệt / Lý do từ chối
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhập lý do phê duyệt đặc cách hoặc nguyên nhân từ chối..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExecute(false)}
              disabled={submitting}
              className="text-rose-600 hover:bg-rose-50 border-rose-200 hover:border-rose-300"
            >
              Từ chối duyệt
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleExecute(true)}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 border-none shadow-md shadow-emerald-600/20"
            >
              {submitting ? 'Đang xử lý...' : 'Phê duyệt áp dụng'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
