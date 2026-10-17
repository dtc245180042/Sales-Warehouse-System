import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  Ban,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { ApprovalOrder, OrderViolation, ViolationSeverity } from '../../types/OrderApproval';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Button } from '../common/Button';

// ─── Sub-components ngoài hàm render chính (Tuân thủ AGENTS.md) ───

interface SeverityBadgeProps {
  severity: ViolationSeverity;
}

const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  switch (severity) {
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <AlertTriangle className="w-3 h-3" />
          Nghiêm trọng (Critical)
        </span>
      );
    case 'high':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
          <AlertTriangle className="w-3 h-3" />
          Cao (High)
        </span>
      );
    case 'medium':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          Trung bình (Medium)
        </span>
      );
    case 'low':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
          Thấp (Low)
        </span>
      );
  }
};

interface ViolationCardProps {
  violation: OrderViolation;
}

const ViolationCard: React.FC<ViolationCardProps> = ({ violation }) => {
  return (
    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
            {violation.title}
          </h5>
        </div>
        <SeverityBadge severity={violation.severity} />
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
        {violation.description}
      </p>

      {/* So sánh giá trị vi phạm */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
        <div className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80">
          <span className="text-[11px] text-slate-400 block">Thực tế / Đơn hàng:</span>
          <strong className="text-rose-600 dark:text-rose-400 block mt-0.5 break-all">
            {violation.currentValue}
          </strong>
        </div>

        <div className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80">
          <span className="text-[11px] text-slate-400 block">Hạn mức / Quy định:</span>
          <strong className="text-slate-700 dark:text-slate-300 block mt-0.5 break-all">
            {violation.limitValue}
          </strong>
        </div>

        <div className="p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80">
          <span className="text-[11px] text-slate-400 block">Mức độ chênh lệch:</span>
          <strong className="text-amber-600 dark:text-amber-400 block mt-0.5 break-all">
            {violation.differenceValue || 'Vượt chính sách'}
          </strong>
        </div>
      </div>

      {/* Danh sách mặt hàng bị ảnh hưởng nếu có */}
      {violation.affectedItems && violation.affectedItems.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Mặt hàng ảnh hưởng ({violation.affectedItems.length} sản phẩm):
          </span>
          <div className="space-y-1.5">
            {violation.affectedItems.map((item) => (
              <div
                key={item.productId}
                className="p-2 bg-white dark:bg-slate-900 rounded-lg text-xs flex items-center justify-between gap-2 border border-slate-100 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    SKU: {item.sku} · SL: <strong>{item.quantity}</strong>
                  </p>
                </div>
                <div className="text-right shrink-0 text-[11px]">
                  {item.floorPrice && (
                    <p className="text-rose-600 dark:text-rose-400 font-bold">
                      Giá bán: {formatCurrency(item.unitPrice)} (Sàn: {formatCurrency(item.floorPrice)})
                    </p>
                  )}
                  {item.stockAvailable !== undefined && (
                    <p className="text-amber-600 dark:text-amber-400 font-bold">
                      Thiếu {item.quantity - item.stockAvailable} chiếc (Kho: {item.stockAvailable})
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Modal Chính ────────────────────────────────────────────────────────────

interface ApprovalDetailModalProps {
  order: ApprovalOrder | null;
  isOpen: boolean;
  canApprove: boolean;
  onClose: () => void;
  onApprove: (orderId: string, notes?: string) => void;
  onReject: (orderId: string, reason: string) => void;
  onReturnForEdit?: (orderId: string, notes: string) => void;
}

export const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  order,
  isOpen,
  canApprove,
  onClose,
  onApprove,
  onReject,
  onReturnForEdit,
}) => {
  const [actionNotes, setActionNotes] = useState('');
  const [activeAction, setActiveAction] = useState<'none' | 'approve' | 'revision' | 'reject'>('none');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !order) return null;

  const handleApproveConfirm = () => {
    onApprove(order.id, actionNotes.trim());
    setActionNotes('');
    setActiveAction('none');
    setErrorMsg('');
  };

  const handleRejectConfirm = () => {
    if (!actionNotes.trim()) {
      setErrorMsg('Vui lòng nhập lý do từ chối đơn hàng trước khi gửi.');
      return;
    }
    setErrorMsg('');
    onReject(order.id, actionNotes.trim());
    setActionNotes('');
    setActiveAction('none');
  };

  const handleReturnForEditConfirm = () => {
    if (!actionNotes.trim()) {
      setErrorMsg('Vui lòng nhập ý kiến / hướng dẫn sửa đổi gửi nhân viên kinh doanh.');
      return;
    }
    setErrorMsg('');
    if (onReturnForEdit) {
      onReturnForEdit(order.id, actionNotes.trim());
    }
    setActionNotes('');
    setActiveAction('none');
  };

  const handleCancelAction = () => {
    setActiveAction('none');
    setActionNotes('');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] space-y-4">
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-2 shrink-0 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Chi Tiết Vi Phạm Đơn Hàng: {order.orderCode}
                </h3>
                <SeverityBadge severity={order.highestSeverity} />
              </div>
              <p className="text-[11px] text-slate-400">
                Tạo lúc: {formatDate(order.createdAt)} · Nhân viên tạo: <strong>{order.createdStaffName}</strong>
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

        {/* Nội dung cuộn được */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Thông tin đại lý & Đơn hàng */}
          <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <span className="text-slate-400 text-[11px] block">Khách hàng / Đại lý:</span>
              <p className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                {order.customerName}
              </p>
              <p className="text-[11px] text-slate-500">
                SĐT: {order.customerPhone} {order.customerGroup && `· Nhóm: ${order.customerGroup}`}
              </p>
            </div>
            <div className="sm:text-right">
              <span className="text-slate-400 text-[11px] block">Tổng giá trị đơn hàng:</span>
              <p className="font-black text-indigo-600 dark:text-indigo-400 text-base mt-0.5">
                {formatCurrency(order.totalAmount)}
              </p>
              {order.customerAddress && (
                <p className="text-[11px] text-slate-500 truncate" title={order.customerAddress}>
                  Địa chỉ: {order.customerAddress}
                </p>
              )}
            </div>
          </div>

          {/* Danh sách các lý do vi phạm */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Các chính sách bị vi phạm ({order.violations.length} lỗi)</span>
              </h4>
            </div>

            <div className="space-y-2.5">
              {order.violations.map((vio) => (
                <ViolationCard key={vio.id} violation={vio} />
              ))}
            </div>
          </div>

          {/* Thông tin trạng thái đã duyệt */}
          {order.approvalStatus === 'approved' && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Đơn hàng đã được phê duyệt</span>
              </div>
              <p className="text-emerald-700/80 dark:text-emerald-400">
                Người duyệt: <strong>{order.approvedBy}</strong> ({formatDate(order.approvedAt || '')})
              </p>
              {order.approverNotes && (
                <p className="text-slate-600 dark:text-slate-300 mt-1 italic">
                  &quot;{order.approverNotes}&quot;
                </p>
              )}
            </div>
          )}

          {/* Thông tin trạng thái yêu cầu sửa đổi (SCRUM-569) */}
          {order.approvalStatus === 'revision' && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>Đơn hàng đã được trả lại yêu cầu chỉnh sửa</span>
              </div>
              <p className="text-amber-700/80 dark:text-amber-400">
                Người trả lại: <strong>{order.returnedBy}</strong> ({formatDate(order.returnedAt || '')})
              </p>
              {order.revisionNotes && (
                <p className="text-amber-900 dark:text-amber-200 font-semibold mt-1">
                  Ý kiến hướng dẫn: &quot;{order.revisionNotes}&quot;
                </p>
              )}
            </div>
          )}

          {/* Thông tin trạng thái đã từ chối */}
          {order.approvalStatus === 'rejected' && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-800 dark:text-rose-300">
                <Ban className="w-4 h-4 text-rose-600" />
                <span>Đơn hàng đã bị từ chối phê duyệt</span>
              </div>
              <p className="text-rose-700/80 dark:text-rose-400">
                Người từ chối: <strong>{order.rejectedBy}</strong> ({formatDate(order.rejectedAt || '')})
              </p>
              {order.rejectedReason && (
                <p className="text-rose-900 dark:text-rose-200 font-semibold mt-1">
                  Lý do từ chối: &quot;{order.rejectedReason}&quot;
                </p>
              )}
            </div>
          )}

          {/* Ô nhập ghi chú khi đơn đang pending và quản lý đang thực hiện hành động */}
          {order.approvalStatus === 'pending' && canApprove && activeAction !== 'none' && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {activeAction === 'approve' && 'Ý kiến phê duyệt ngoại lệ (Tùy chọn):'}
                  {activeAction === 'revision' && (
                    <span>
                      Ý kiến / Hướng dẫn sửa đổi gửi Sales (Bắt buộc) <span className="text-amber-500">*</span>:
                    </span>
                  )}
                  {activeAction === 'reject' && (
                    <span>
                      Lý do từ chối đơn hàng (Bắt buộc) <span className="text-rose-500">*</span>:
                    </span>
                  )}
                </label>
                <span className="text-[11px] text-slate-400">{actionNotes.length} ký tự</span>
              </div>

              <textarea
                value={actionNotes}
                onChange={(e) => {
                  setActionNotes(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                rows={3}
                placeholder={
                  activeAction === 'approve'
                    ? 'Nhập căn cứ chấp thuận ngoại lệ (VD: Đại lý cam kết thanh toán trong 7 ngày, Quản lý bảo lãnh...)'
                    : activeAction === 'revision'
                    ? 'Nhập hướng dẫn cụ thể gửi nhân viên sửa đơn (VD: Điều chỉnh đơn giá >= giá sàn, giảm chiết khấu về 15%...)'
                    : 'Nhập lý do cụ thể từ chối đơn hàng (VD: Nợ quá hạn chưa thanh toán, vượt quá trần hạn mức...)'
                }
                className={`w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border rounded-xl focus:outline-none focus:ring-2 resize-none ${
                  errorMsg
                    ? 'border-rose-500 focus:ring-rose-500'
                    : activeAction === 'approve'
                    ? 'border-slate-200 dark:border-slate-700 focus:ring-emerald-500'
                    : activeAction === 'revision'
                    ? 'border-slate-200 dark:border-slate-700 focus:ring-amber-500'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-rose-500'
                }`}
              />

              {errorMsg && <p className="text-[11px] text-rose-500 font-bold">{errorMsg}</p>}
            </div>
          )}
        </div>

        {/* Footer thao tác */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Đóng
          </Button>

          {order.approvalStatus === 'pending' && canApprove && (
            <div className="flex items-center gap-2 ml-auto">
              {activeAction === 'none' ? (
                <>
                  {/* Nút 1: Trả lại sửa (SCRUM-569) */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAction('revision');
                      setActionNotes('');
                      setErrorMsg('');
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900 rounded-xl transition flex items-center gap-1.5 border border-amber-200 dark:border-amber-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Trả lại sửa</span>
                  </button>

                  {/* Nút 2: Từ chối (SCRUM-569) */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAction('reject');
                      setActionNotes('');
                      setErrorMsg('');
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900 rounded-xl transition flex items-center gap-1.5 border border-rose-200 dark:border-rose-800"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Từ chối</span>
                  </button>

                  {/* Nút 3: Phê duyệt */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAction('approve');
                      setActionNotes('');
                      setErrorMsg('');
                    }}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Phê duyệt đơn</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancelAction}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                  >
                    Hủy bỏ
                  </button>

                  {activeAction === 'approve' && (
                    <button
                      type="button"
                      onClick={handleApproveConfirm}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Xác nhận duyệt đơn</span>
                    </button>
                  )}

                  {activeAction === 'revision' && (
                    <button
                      type="button"
                      onClick={handleReturnForEditConfirm}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Xác nhận trả lại sửa</span>
                    </button>
                  )}

                  {activeAction === 'reject' && (
                    <button
                      type="button"
                      onClick={handleRejectConfirm}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Xác nhận từ chối</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {order.approvalStatus === 'pending' && !canApprove && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold italic">
              Đơn hàng đang chờ Quản lý kinh doanh phê duyệt
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovalDetailModal;
