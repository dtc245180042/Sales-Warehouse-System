import React, { useState, useEffect } from 'react';
import {
  FileEdit,
  Trash2,
  Clock,
  ArrowRight,
  Package,
  ShoppingBag,
} from 'lucide-react';
import { orderService } from '../../services/orderService';
import { Order } from '../../types/Order';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';

interface DraftOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDraft: (order: Order) => void;
}

export const DraftOrdersModal: React.FC<DraftOrdersModalProps> = ({
  isOpen,
  onClose,
  onSelectDraft,
}) => {
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const all = await orderService.getAll();
      const pendingDrafts = all.filter((o) => o.status === 'pending');
      setDrafts(pendingDrafts);
    } catch {
      showToast('Lỗi khi tải danh sách đơn nháp', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDrafts();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await orderService.cancelOrder(id);
      showToast('Đã xóa đơn nháp thành công', 'success');
      loadDrafts();
    } catch {
      showToast('Lỗi khi xóa đơn nháp', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <FileEdit className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Danh Sách Đơn Nháp
              </h3>
              <p className="text-[11px] text-slate-400">Chọn một đơn nháp để tiếp tục soạn và gửi đơn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Đang tải danh sách đơn nháp...</div>
          ) : drafts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-300 stroke-[1.2]" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Không có đơn nháp nào</p>
              <p className="text-[11px] text-slate-400">Khi bấm &quot;Lưu nháp&quot;, đơn sẽ xuất hiện tại đây để mở lại sau.</p>
            </div>
          ) : (
            drafts.map((draft) => (
              <div
                key={draft.id}
                onClick={() => {
                  onSelectDraft(draft);
                  onClose();
                }}
                className="group p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 hover:border-indigo-500 dark:hover:border-indigo-500 cursor-pointer transition shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                      {draft.code}
                    </span>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {draft.customerName}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(draft.id, e)}
                    className="p-1 text-slate-400 hover:text-rose-500 transition"
                    title="Xóa đơn nháp"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDate(draft.createdAt)}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    {draft.items.length} mặt hàng
                  </span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(draft.total)}
                  </span>
                </div>

                <div className="flex items-center justify-end text-[11px] font-bold text-indigo-600 group-hover:underline gap-1 pt-0.5">
                  <span>Mở lại đơn này</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
