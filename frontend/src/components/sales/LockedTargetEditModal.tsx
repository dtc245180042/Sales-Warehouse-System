import React, { useState } from 'react';
import { AlertTriangle, Lock, X, Check, FileEdit } from 'lucide-react';
import { SalesTarget } from '../../types/SalesTarget';
import { Button } from '../common/Button';
import { CurrencyInput } from '../common/CurrencyInput';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { salesTargetService } from '../../services/salesTargetService';
import { formatNumber } from '../../utils/formatters';

interface LockedTargetEditModalProps {
  target: SalesTarget;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LockedTargetEditModal: React.FC<LockedTargetEditModalProps> = ({
  target,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [newRevenue, setNewRevenue] = useState<number>(target.targetRevenue);
  const [newOrders, setNewOrders] = useState<number>(target.targetOrders || 0);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const isDifferent =
    newRevenue !== target.targetRevenue || newOrders !== (target.targetOrders || 0);
  const isReasonValid = reason.trim().length >= 20;
  const isRevenueValid = newRevenue > 0;
  const canSubmit = isDifferent && isReasonValid && isRevenueValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isRevenueValid) {
      showToast('Chỉ tiêu doanh số mới phải lớn hơn 0', 'error');
      return;
    }

    if (!isDifferent) {
      showToast('Giá trị mới phải khác với giá trị hiện tại', 'warning');
      return;
    }

    if (!isReasonValid) {
      showToast('Lý do chỉnh sửa chỉ tiêu đã khoá phải có tối thiểu 20 ký tự', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await salesTargetService.update(
        target.id,
        {
          targetRevenue: newRevenue,
          targetOrders: newOrders,
          reason: reason.trim(),
        },
        {
          id: user?.id,
          name: user?.name || user?.username,
          role: role,
        }
      );
      showToast(
        `Đã cập nhật chỉ tiêu kỳ ${target.period} và ghi nhận nhật ký kiểm toán!`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Có lỗi xảy ra khi cập nhật chỉ tiêu', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Warning Accent Banner */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Điều chỉnh chỉ tiêu đã khóa
              </h3>
              <p className="text-xs text-slate-500">
                Kỳ {target.period} • SCRUM-805
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Target Metadata overview */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Đối tượng:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {target.scope === 'individual' ? target.userName : target.territory}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Trạng thái:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-400">
                <Lock className="w-3 h-3 text-slate-400" />
                Đã khoá sổ
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Chỉ tiêu hiện tại:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(target.targetRevenue)} đ
              </span>
            </div>
          </div>

          {/* New Revenue Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Chỉ tiêu doanh số mới (VND) <span className="text-rose-500">*</span>
            </label>
            <CurrencyInput
              value={newRevenue}
              onChange={(val) => setNewRevenue(val)}
              suffix="VNĐ"
              placeholder="VD: 500.000.000"
              className="w-full px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          {/* New Orders Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Chỉ tiêu số đơn hàng mới
            </label>
            <input
              type="number"
              min={0}
              value={newOrders === 0 ? '' : newOrders}
              placeholder="VD: 100"
              onChange={(e) => {
                const val = e.target.value;
                setNewOrders(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          {/* Reason Textarea (Required >= 20 chars) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lý do chỉnh sửa kỳ đã khoá <span className="text-rose-500">*</span>
              </label>
              <span
                className={`text-[11px] font-medium ${
                  isReasonValid
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-500'
                }`}
              >
                {reason.trim().length}/20 ký tự tối thiểu
              </span>
            </div>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do bắt buộc tối thiểu 20 ký tự (ví dụ: Bổ sung chỉ tiêu hợp đồng dự án đột xuất theo quyết định của Ban Giám Đốc...)"
              className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!canSubmit}
              isLoading={submitting}
              leftIcon={<Check className="w-4 h-4" />}
            >
              Xác nhận sửa & Ghi audit
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
