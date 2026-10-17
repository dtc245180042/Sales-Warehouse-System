import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Ban,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  ApprovalOrder,
  ApprovalActionType,
  ViolationSeverity,
} from '../../types/OrderApproval';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../common/Button';

// ─── Sub-components tách rời ngoài hàm render chính (Tuân thủ AGENTS.md) ───

interface SeverityTagProps {
  severity: ViolationSeverity;
}

const SeverityTag: React.FC<SeverityTagProps> = ({ severity }) => {
  switch (severity) {
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <AlertTriangle className="w-2.5 h-2.5" />
          Critical
        </span>
      );
    case 'high':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
          High
        </span>
      );
    case 'medium':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          Medium
        </span>
      );
    case 'low':
    default:
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
          Low
        </span>
      );
  }
};

const APPROVE_PRESETS = [
  'Đại lý uy tín lâu năm, cam kết thanh toán đúng hạn trong 7 ngày',
  'Đã được Ban Giám đốc phê duyệt chính sách ưu đãi riêng',
  'Đã đối chiếu công nợ, duyệt xuất hàng theo hạn mức ngoại lệ',
];

const REVISION_PRESETS = [
  'Yêu cầu điều chỉnh lại đơn giá bán về bằng hoặc cao hơn giá sàn quy định',
  'Vui lòng giảm tỷ lệ chiết khấu về mức trần tối đa của nhân viên (15%)',
  'Đề nghị đôn đốc đại lý thanh toán bớt nợ cũ quá hạn trước khi tạo lại đơn',
  'Cần điều chỉnh số lượng đặt phù hợp với tồn kho thực tế khả dụng',
];

const REJECT_PRESETS = [
  'Đại lý có nợ quá hạn nghiêm trọng chưa thanh toán, không đủ điều kiện tín dụng',
  'Tổng dư nợ vượt quá xa hạn mức tối đa cho phép',
  'Đơn giá bán dưới giá sàn tối thiểu và không được ban quản lý chấp thuận',
  'Mức chiết khấu không hợp lệ với chính sách thương mại hiện hành',
];

export interface OrderApprovalActionModalProps {
  isOpen: boolean;
  orders: ApprovalOrder[];
  initialAction?: ApprovalActionType;
  onClose: () => void;
  onConfirm: (action: ApprovalActionType, notes: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

export const OrderApprovalActionModal: React.FC<OrderApprovalActionModalProps> = ({
  isOpen,
  orders,
  initialAction = 'approve',
  onClose,
  onConfirm,
  isSubmitting = false,
}) => {
  const [action, setAction] = useState<ApprovalActionType>(initialAction);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Đồng bộ action khi modal mở lên hoặc initialAction đổi
  useEffect(() => {
    if (isOpen) {
      setAction(initialAction);
      setNotes('');
      setError('');
    }
  }, [isOpen, initialAction]);

  if (!isOpen || orders.length === 0) return null;

  const isSingle = orders.length === 1;
  const targetOrder = orders[0];

  const handleActionChange = (newAction: ApprovalActionType) => {
    setAction(newAction);
    setError('');
  };

  const handleApplyPreset = (text: string) => {
    setNotes(text);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = notes.trim();

    // Kiểm tra validation bắt buộc theo yêu cầu Jira SCRUM-569
    if (action === 'reject') {
      if (!trimmed) {
        setError('Vui lòng nhập lý do từ chối đơn hàng trước khi gửi.');
        return;
      }
    } else if (action === 'revision') {
      if (!trimmed) {
        setError('Vui lòng nhập ý kiến / hướng dẫn sửa đổi gửi nhân viên kinh doanh.');
        return;
      }
    }

    setError('');
    await onConfirm(action, trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] space-y-4">
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-2 shrink-0 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                action === 'approve'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : action === 'revision'
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                  : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
              }`}
            >
              {action === 'approve' && <ShieldCheck className="w-6 h-6" />}
              {action === 'revision' && <RotateCcw className="w-6 h-6" />}
              {action === 'reject' && <Ban className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Xử Lý Phê Duyệt Đơn Hàng
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSingle ? (
                  <span>
                    Đơn: <strong>{targetOrder.orderCode}</strong> · {targetOrder.customerName}
                  </span>
                ) : (
                  <span>
                    Đang chọn <strong>{orders.length}</strong> đơn hàng chờ duyệt
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Thông tin vắn tắt đơn hàng vi phạm */}
          {isSingle && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Tổng tiền:</span>
                  <span className="font-black text-slate-900 dark:text-white">
                    {formatCurrency(targetOrder.totalAmount)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Mức độ vi phạm:</span>
                  <SeverityTag severity={targetOrder.highestSeverity} />
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Chính sách vi phạm ({targetOrder.violations.length} lỗi):
                </span>
                <div className="space-y-1">
                  {targetOrder.violations.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300"
                    >
                      <span>• {v.title}</span>
                      {v.differenceValue && (
                        <span className="text-rose-600 dark:text-rose-400 font-bold shrink-0">
                          {v.differenceValue}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3 Lựa chọn hành động: Duyệt / Trả lại sửa / Từ chối (SCRUM-569) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Chọn hành động xử lý:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Nút 1: Duyệt */}
              <button
                type="button"
                onClick={() => handleActionChange('approve')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 ${
                  action === 'approve'
                    ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    action === 'approve'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Duyệt Đơn</span>
                <span className="text-[10px] text-slate-400 leading-none">Chấp thuận</span>
              </button>

              {/* Nút 2: Trả lại sửa */}
              <button
                type="button"
                onClick={() => handleActionChange('revision')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 ${
                  action === 'revision'
                    ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    action === 'revision'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Trả Lại Sửa</span>
                <span className="text-[10px] text-slate-400 leading-none">Yêu cầu sửa</span>
              </button>

              {/* Nút 3: Từ chối */}
              <button
                type="button"
                onClick={() => handleActionChange('reject')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 ${
                  action === 'reject'
                    ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    action === 'reject'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Từ Chối</span>
                <span className="text-[10px] text-slate-400 leading-none">Hủy bỏ đơn</span>
              </button>
            </div>
          </div>

          {/* Ô nhập ý kiến / lý do */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                {action === 'approve' && (
                  <>
                    <span>Ý kiến phê duyệt ngoại lệ:</span>
                    <span className="text-[11px] font-normal text-slate-400">(Tùy chọn)</span>
                  </>
                )}
                {action === 'revision' && (
                  <>
                    <span>Ý kiến / Hướng dẫn sửa đổi gửi Sales:</span>
                    <span className="text-[11px] font-bold text-amber-500">* Bắt buộc</span>
                  </>
                )}
                {action === 'reject' && (
                  <>
                    <span>Lý do từ chối đơn hàng:</span>
                    <span className="text-[11px] font-bold text-rose-500">* Bắt buộc</span>
                  </>
                )}
              </label>

              <span className="text-[11px] text-slate-400">{notes.length} ký tự</span>
            </div>

            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (error) setError('');
              }}
              rows={3}
              placeholder={
                action === 'approve'
                  ? 'Nhập căn cứ chấp thuận ngoại lệ chính sách (không bắt buộc)...'
                  : action === 'revision'
                  ? 'Nhập chi tiết yêu cầu nhân viên kinh doanh sửa lại (VD: Cần điều chỉnh lại đơn giá >= giá sàn, thu bớt nợ cũ...)'
                  : 'Nhập lý do cụ thể từ chối đơn hàng để thông báo đến nhân viên kinh doanh...'
              }
              className={`w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border rounded-2xl focus:outline-none focus:ring-2 resize-none transition ${
                error
                  ? 'border-rose-500 focus:ring-rose-500/20'
                  : action === 'approve'
                  ? 'border-slate-200 dark:border-slate-700 focus:ring-emerald-500/20 focus:border-emerald-500'
                  : action === 'revision'
                  ? 'border-slate-200 dark:border-slate-700 focus:ring-amber-500/20 focus:border-amber-500'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-rose-500/20 focus:border-rose-500'
              }`}
            />

            {/* Thông báo lỗi validation */}
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 font-semibold animate-fadeIn">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Gợi ý mẫu nhanh (Quick presets) */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Mẫu gợi ý nhanh:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(action === 'approve'
                  ? APPROVE_PRESETS
                  : action === 'revision'
                  ? REVISION_PRESETS
                  : REJECT_PRESETS
                ).map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition text-left"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer nút thao tác */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Hủy bỏ
            </Button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 text-xs sm:text-sm font-bold text-white rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                action === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : action === 'revision'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {action === 'approve' && (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isSingle
                      ? 'Xác nhận phê duyệt đơn'
                      : `Phê duyệt ${orders.length} đơn hàng`}
                  </span>
                </>
              )}
              {action === 'revision' && (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>
                    {isSingle
                      ? 'Gửi yêu cầu trả lại sửa'
                      : `Trả lại ${orders.length} đơn để sửa`}
                  </span>
                </>
              )}
              {action === 'reject' && (
                <>
                  <Ban className="w-4 h-4" />
                  <span>
                    {isSingle
                      ? 'Xác nhận từ chối đơn'
                      : `Từ chối ${orders.length} đơn hàng`}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OrderApprovalActionModal;
