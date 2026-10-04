import React from 'react';
import { Lock, Copy, X, ShieldAlert, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '../common/Button';
import { PriceList, CUSTOMER_GROUPS } from '../../services/priceListService';
import { formatDate } from '../../utils/formatters';

interface LockedPriceListAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  priceList: PriceList | null;
  onClone: (pl: PriceList) => void;
  onViewDetail: (id: number) => void;
}

export const LockedPriceListAlertModal: React.FC<LockedPriceListAlertModalProps> = ({
  isOpen,
  onClose,
  priceList,
  onClone,
  onViewDetail,
}) => {
  if (!isOpen || !priceList) return null;

  const grp = CUSTOMER_GROUPS.find((g) => g.value === priceList.customer_group);
  const nextVersion = (priceList.version || 1) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Bảng Giá Đã Bị Khóa Sửa Đổi
              </h3>
              <p className="text-xs text-slate-500">
                Chính sách bảo toàn lịch sử giao dịch & số liệu kế toán
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
        <div className="p-6 space-y-4 text-xs">
          {/* Target List Info */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {priceList.name}
              </span>
              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                {priceList.code} (v{priceList.version})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-slate-500 text-[11px]">
              <span>Áp dụng: <strong>{grp?.label || priceList.customer_group}</strong></span>
              <span>•</span>
              <span>Hiệu lực từ: {formatDate(priceList.valid_from)}</span>
            </div>
          </div>

          {/* Explanation Box */}
          <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2 text-purple-900 dark:text-purple-200">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Lock className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Lý do khóa thao tác trực tiếp:</span>
            </div>
            <p className="leading-relaxed">
              Bảng giá này đã phát sinh <strong>{priceList.orders_count} đơn hàng</strong> trong hệ thống.
              Nếu sửa đổi trực tiếp giá bán hoặc xóa dòng hàng, số liệu doanh thu và lịch sử đơn hàng cũ
              sẽ bị sai lệch.
            </p>
            <div className="p-2.5 rounded-xl bg-purple-100/60 dark:bg-purple-900/40 text-[11px] font-medium border border-purple-200/80 dark:border-purple-800 text-purple-800 dark:text-purple-200">
              📌 <strong>Quy tắc nghiệp vụ chuẩn (S2-10):</strong> <em>"Bảng giá đã phát sinh đơn thì không sửa, chỉ tạo phiên bản mới"</em>.
            </div>
          </div>

          {/* Solution Recommendation */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-2 text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Giải pháp chuẩn nghiệp vụ:</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              Hãy tạo một <strong>Phiên bản kế thừa mới (v{nextVersion})</strong>. Phiên bản mới sẽ sao chép toàn bộ
              mặt hàng từ bảng giá này, đồng thời cho phép bạn tự do điều chỉnh giá bán hoặc áp dụng tỷ lệ chiết khấu mới
              mà không ảnh hưởng đến các đơn hàng đã tạo trước đó.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewDetail(priceList.id);
            }}
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:underline flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5" /> Xem chi tiết bảng giá
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onClone(priceList);
              }}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 border-none shadow-md shadow-purple-600/20"
            >
              <Copy className="w-4 h-4" /> Tạo phiên bản v{nextVersion} ngay
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
