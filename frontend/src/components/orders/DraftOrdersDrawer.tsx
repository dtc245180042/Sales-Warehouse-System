import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bookmark,
  X,
  Trash2,
  FileText,
} from 'lucide-react';
import { Order } from '../../types/Order';
import { orderService } from '../../services/orderService';
import { formatCurrency } from '../../utils/formatters';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

interface DraftOrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: Order[];
  onSelectDraft: (draft: Order) => void;
  onDraftsChange: (updatedDrafts: Order[]) => void;
  currentDraftId?: string | null;
  onCurrentDraftDeleted?: () => void;
}

export const DraftOrdersDrawer: React.FC<DraftOrdersDrawerProps> = ({
  isOpen,
  onClose,
  drafts,
  onSelectDraft,
  onDraftsChange,
  currentDraftId,
  onCurrentDraftDeleted,
}) => {
  const { showToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  // Modal confirm states
  const [singleDeleteDraft, setSingleDeleteDraft] = useState<Order | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Đồng bộ trạng thái checkbox indeterminate
  const isAllSelected = useMemo(() => {
    return drafts.length > 0 && selectedIds.length === drafts.length;
  }, [drafts.length, selectedIds.length]);

  const isIndeterminate = useMemo(() => {
    return selectedIds.length > 0 && selectedIds.length < drafts.length;
  }, [selectedIds.length, drafts.length]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  // Đóng bằng phím Esc (trừ khi đang mở confirm modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !singleDeleteDraft && !isBulkDeleteModalOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, singleDeleteDraft, isBulkDeleteModalOpen, onClose]);

  // Chọn / bỏ chọn 1 draft
  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Chọn tất cả / Bỏ chọn tất cả
  const handleToggleSelectAll = () => {
    if (isAllSelected || isIndeterminate) {
      setSelectedIds([]);
    } else {
      setSelectedIds(drafts.map((d) => d.id));
    }
  };

  // Xóa 1 draft với Optimistic Update & Rollback
  const handleConfirmSingleDelete = async () => {
    if (!singleDeleteDraft) return;
    const target = singleDeleteDraft;
    const targetId = target.id;
    const targetCode = target.code || target.id;
    const prevDrafts = [...drafts];

    // Optimistic Update: Xóa khỏi danh sách ngay lập tức
    const updated = drafts.filter((d) => d.id !== targetId);
    onDraftsChange(updated);
    setSelectedIds((prev) => prev.filter((id) => id !== targetId));
    setSingleDeleteDraft(null);

    // Kiểm tra nếu đơn đang mở trong form chính là đơn bị xóa
    if (currentDraftId && (currentDraftId === targetId || currentDraftId === targetCode)) {
      onCurrentDraftDeleted?.();
      showToast(`Đơn nháp [${targetCode}] đang mở đã bị xóa. Form đã được đặt lại.`, 'info');
    }

    try {
      setIsDeleting(true);
      await orderService.deleteDraft(targetId);
      showToast(`Đã xóa đơn nháp [${targetCode}] thành công.`, 'success');
    } catch (err: any) {
      // Rollback về trạng thái ban đầu nếu lỗi
      onDraftsChange(prevDrafts);
      showToast(`Lỗi khi xóa đơn nháp [${targetCode}]: ${err.message || 'Không thể xóa'}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Xóa hàng loạt với Optimistic Update & Rollback từng phần
  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const countToDelete = selectedIds.length;
    const idsToDelete = [...selectedIds];
    const prevDrafts = [...drafts];

    // Optimistic Update: Xóa khỏi danh sách ngay
    const remainingDrafts = drafts.filter((d) => !idsToDelete.includes(d.id));
    onDraftsChange(remainingDrafts);
    setSelectedIds([]);
    setIsBulkDeleteModalOpen(false);

    // Kiểm tra nếu form đang mở 1 trong các draft bị xóa
    if (currentDraftId && idsToDelete.includes(currentDraftId)) {
      onCurrentDraftDeleted?.();
      showToast('Đơn nháp bạn đang mở nằm trong danh sách đã xóa. Form đã được đặt lại.', 'info');
    }

    try {
      setIsDeleting(true);
      const { succeeded, failed } = await orderService.deleteDrafts(idsToDelete);

      if (failed.length > 0) {
        // Rollback các item bị thất bại
        const restored = prevDrafts.filter((d) => failed.includes(d.id));
        onDraftsChange([...remainingDrafts, ...restored]);
        showToast(
          `Đã xóa thành công ${succeeded.length}/${countToDelete} đơn nháp. Thất bại ${failed.length} đơn.`,
          'warning'
        );
      } else {
        showToast(`Đã xóa vĩnh viễn ${succeeded.length} đơn nháp thành công.`, 'success');
      }
    } catch (err: any) {
      // Rollback toàn bộ nếu crash hoàn toàn
      onDraftsChange(prevDrafts);
      showToast(`Lỗi khi xóa hàng loạt: ${err.message || 'Thao tác không thành công'}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drafts-drawer-title"
      >
        {/* Backdrop click to close */}
        <div
          className="fixed inset-0"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-md sm:max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 animate-fade-in border-l border-slate-200 dark:border-slate-800">
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400">
                <Bookmark className="w-4 h-4" />
              </div>
              <div>
                <h3 id="drafts-drawer-title" className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                  Đơn Hàng Đang Soạn Dở ({drafts.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Danh sách đơn nháp tự động lưu của bạn
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Đóng ngăn kéo đơn nháp (Phím Esc)"
              title="Đóng (Esc)"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Bulk Selection Bar (Khi có danh sách) */}
          {drafts.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  aria-label="Chọn tất cả đơn nháp"
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-700 cursor-pointer"
                />
                <span>
                  {isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'} ({drafts.length})
                </span>
              </label>

              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 animate-fade-in">
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    Đã chọn {selectedIds.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteModalOpen(true)}
                    aria-label={`Xóa ${selectedIds.length} đơn nháp đã chọn`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-xs active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa đã chọn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
                  >
                    Bỏ chọn
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Drawer Body - Smooth Scrolling List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scroll-smooth divide-y-0">
            {drafts.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                  Chưa có đơn nháp nào
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Khi đang tạo đơn, nhấn nút "Lưu nháp" để lưu lại tiến trình và tiếp tục chỉnh sửa bất cứ lúc nào.
                </p>
              </div>
            ) : (
              drafts.map((draft) => {
                const isSelected = selectedIds.includes(draft.id);
                const isCurrent = currentDraftId === draft.id || currentDraftId === draft.code;

                return (
                  <div
                    key={draft.id}
                    className={`relative p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 shadow-xs ring-1 ring-blue-400/30'
                        : isCurrent
                        ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
                        : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Selection Checkbox */}
                      <div className="pt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(draft.id)}
                          aria-label={`Chọn đơn nháp ${draft.code || draft.id}`}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 dark:bg-slate-700 cursor-pointer"
                        />
                      </div>

                      {/* Draft Card Information */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-xs text-slate-900 dark:text-white font-mono truncate">
                              {draft.code || draft.id}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500 text-white shrink-0">
                                Đang mở
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {draft.updatedAt || draft.createdAt}
                          </span>
                        </div>

                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          Đại lý: <strong className="font-semibold text-slate-900 dark:text-white">{draft.customerName || 'Chưa chọn'}</strong>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            {draft.items.length} món &bull;{' '}
                            <strong className="text-blue-600 dark:text-blue-400 font-semibold">
                              {formatCurrency(draft.total)}
                            </strong>
                          </span>

                          {/* Card Actions: Xóa & Tiếp tục gõ */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSingleDeleteDraft(draft)}
                              aria-label={`Xóa nháp ${draft.code || draft.id}`}
                              title="Xóa nháp"
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors active:scale-95 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onSelectDraft(draft)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-2xs transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              Tiếp tục gõ
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog: Xóa 1 nháp */}
      <ConfirmDialog
        isOpen={Boolean(singleDeleteDraft)}
        onClose={() => setSingleDeleteDraft(null)}
        onConfirm={handleConfirmSingleDelete}
        title="Xóa đơn nháp"
        message={`Bạn có chắc muốn xóa nháp ${singleDeleteDraft?.code || singleDeleteDraft?.id}? Hành động này không thể hoàn tác.`}
        confirmText="Xóa nháp"
        cancelText="Hủy bỏ"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Confirmation Dialog: Xóa hàng loạt nháp */}
      <ConfirmDialog
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title="Xác nhận xóa nhiều đơn nháp"
        message={`Xóa vĩnh viễn ${selectedIds.length} đơn nháp đã chọn? Hành động này không thể hoàn tác.`}
        confirmText={`Xóa ${selectedIds.length} đơn`}
        cancelText="Hủy bỏ"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
};
