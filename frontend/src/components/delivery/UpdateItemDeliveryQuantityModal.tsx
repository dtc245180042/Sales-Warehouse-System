import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { OrderItem } from '../../types/Order';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface UpdateItemDeliveryQuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: OrderItem[];
  currentResolution?: string;
  onSave: (
    updates: { productId: string; deliveredQuantity: number; shortageReason?: string }[],
    resolutionNote: string
  ) => Promise<void>;
}

const COMMON_REASONS = [
  'Tạm hết hàng tại kho xuất',
  'Hàng lỗi bao bì khi kiểm đếm',
  'Vỡ hỏng khi bốc xếp',
  'Đại lý yêu cầu giao trước một phần',
  'Tách đợt vận chuyển chuyên dụng',
];

export const UpdateItemDeliveryQuantityModal: React.FC<UpdateItemDeliveryQuantityModalProps> = ({
  isOpen,
  onClose,
  items,
  currentResolution = '',
  onSave,
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    items.forEach((it) => {
      init[it.productId] = it.deliveredQuantity !== undefined ? it.deliveredQuantity : it.quantity;
    });
    return init;
  });

  const [reasons, setReasons] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.shortageReason) init[it.productId] = it.shortageReason;
    });
    return init;
  });

  const [resolution, setResolution] = useState(currentResolution);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleQuantityChange = (productId: string, val: number, maxQty: number) => {
    const clamped = Math.max(0, Math.min(maxQty, isNaN(val) ? 0 : val));
    setQuantities((prev) => ({ ...prev, [productId]: clamped }));
  };

  const handleSetReason = (productId: string, reasonText: string) => {
    setReasons((prev) => ({ ...prev, [productId]: reasonText }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const updates = items.map((it) => {
        const delivered = quantities[it.productId] ?? it.quantity;
        const shortage = delivered < it.quantity;
        return {
          productId: it.productId,
          deliveredQuantity: delivered,
          shortageReason: shortage ? (reasons[it.productId]?.trim() || 'Chưa ghi nhận lý do') : undefined,
        };
      });

      await onSave(updates, resolution.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasAnyShortage = items.some(
    (it) => (quantities[it.productId] ?? it.quantity) < it.quantity
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cập Nhật Số Lượng Thực Giao Cho Từng Dòng Hàng"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nhập số lượng thực tế thủ kho đã đóng gói & giao cho đại lý. Nếu có dòng giao thiếu, vui lòng nêu rõ lý do để đại lý nắm bắt.
        </p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {items.map((it) => {
            const currentDelivered = quantities[it.productId] ?? it.quantity;
            const isShortage = currentDelivered < it.quantity;

            return (
              <div
                key={it.productId}
                className={`p-4 rounded-xl border transition-colors ${
                  isShortage
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {it.name}
                    </p>
                    <span className="text-[11px] text-slate-400 font-mono">
                      SKU: {it.sku} | Đơn vị: {it.unit || 'Cái'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-xs">
                      <span className="text-slate-400 block">Số lượng đặt:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{it.quantity}</strong>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Thực giao:
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={it.quantity}
                        value={currentDelivered}
                        onChange={(e) =>
                          handleQuantityChange(it.productId, parseInt(e.target.value, 10), it.quantity)
                        }
                        className="w-20 px-2.5 py-1.5 text-xs font-bold text-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Khu vực nhập lý do giao thiếu */}
                {isShortage && (
                  <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Giao thiếu {it.quantity - currentDelivered} {it.unit || 'sản phẩm'}. Vui lòng nhập lý do:
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleSetReason(it.productId, r)}
                          className="px-2 py-0.5 text-[10px] rounded-md bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100"
                        >
                          {r}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      placeholder="Nhập lý do cụ thể..."
                      value={reasons[it.productId] || ''}
                      onChange={(e) => handleSetReason(it.productId, e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Phương án xử lý tổng thể nếu có giao thiếu */}
        {hasAnyShortage && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-1.5">
            <label className="block text-xs font-bold text-amber-900 dark:text-amber-200">
              Phương án xử lý giao thiếu cho đại lý:
            </label>
            <textarea
              rows={2}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Ví dụ: Kho xuất bù đợt 2 vào ngày mai; Hoặc cấn trừ tiền hàng vào công nợ tháng..."
              className="w-full text-xs px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
            Lưu số lượng thực giao
          </Button>
        </div>
      </form>
    </Modal>
  );
};
