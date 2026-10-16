import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Warehouse,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  Flame,
  CalendarX,
  FileQuestion,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { stockAdjustService } from '../../services/stockAdjustService';
import { StockAdjustVoucher, AdjustType, AdjustStatus } from '../../types/StockAdjust';
import { formatNumber, formatDateTime } from '../../utils/formatters';

const TYPE_CONFIG: Record<
  AdjustType,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  damaged: {
    label: 'Hàng hỏng / Móp bể',
    bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400',
    text: 'text-orange-700 dark:text-orange-400',
    icon: <Flame className="w-4 h-4" />,
  },
  expired: {
    label: 'Hàng hết hạn',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <CalendarX className="w-4 h-4" />,
  },
  lost: {
    label: 'Hao hụt / Mất mát',
    bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <FileQuestion className="w-4 h-4" />,
  },
};

const STATUS_CONFIG: Record<
  AdjustStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Chờ Quản lý kho duyệt',
    bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <Clock className="w-4 h-4" />,
  },
  approved: {
    label: 'Đã duyệt (Đã trừ kho)',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  rejected: {
    label: 'Bị từ chối',
    bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <XCircle className="w-4 h-4" />,
  },
};

export const StockAdjustDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [voucher, setVoucher] = useState<StockAdjustVoucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Reject Modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Approve Confirm Modal
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);

  const canReview = ['Admin', 'WarehouseManager', 'Director', 'Manager'].includes(role || '');

  const loadVoucher = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await stockAdjustService.getById(id);
      setVoucher(data);
    } catch {
      showToast('Không thể tải chi tiết phiếu điều chỉnh', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVoucher();
  }, [id]);

  const handleApprove = async () => {
    if (!voucher) return;
    setActionLoading(true);
    try {
      const updated = await stockAdjustService.approve(
        voucher.id,
        user?.name || user?.username || 'Quản lý kho'
      );
      setVoucher(updated);
      setIsApproveConfirmOpen(false);
      showToast('Đã phê duyệt phiếu điều chỉnh tồn kho thành công!', 'success');
    } catch {
      showToast('Phê duyệt thất bại. Vui lòng thử lại.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!voucher) return;
    if (rejectReason.trim().length < 5) {
      showToast('Vui lòng nhập lý do từ chối tối thiểu 5 ký tự', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const updated = await stockAdjustService.reject(
        voucher.id,
        rejectReason.trim(),
        user?.name || user?.username || 'Quản lý kho'
      );
      setVoucher(updated);
      setIsRejectModalOpen(false);
      setRejectReason('');
      showToast('Đã từ chối phiếu điều chỉnh', 'warning');
    } catch {
      showToast('Thao tác thất bại. Vui lòng thử lại.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="Chi tiết phiếu điều chỉnh">
        <div className="py-20 text-center text-slate-500">
          <Clock className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
          Đang tải dữ liệu phiếu điều chỉnh...
        </div>
      </PageContainer>
    );
  }

  if (!voucher) {
    return (
      <PageContainer title="Không tìm thấy phiếu">
        <div className="py-20 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Không tìm thấy phiếu điều chỉnh
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            Phiếu điều chỉnh không tồn tại hoặc đã bị xóa khỏi hệ thống.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            onClick={() => navigate('/inventory/adjustments')}
          >
            Quay lại danh sách
          </Button>
        </div>
      </PageContainer>
    );
  }

  const typeCfg = TYPE_CONFIG[voucher.adjustType] || TYPE_CONFIG.damaged;
  const statusCfg = STATUS_CONFIG[voucher.status] || STATUS_CONFIG.pending;

  return (
    <PageContainer
      title={`Phiếu điều chỉnh: ${voucher.code}`}
      description="Chi tiết biên bản điều chỉnh giảm tồn kho & quy trình duyệt (SCRUM-794)"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            In phiếu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/inventory/adjustments')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Danh sách
          </Button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Banner Alert for Pending status */}
        {voucher.status === 'pending' && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                  Phiếu đang chờ Quản lý kho xem xét và phê duyệt
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Sau khi duyệt, số lượng sản phẩm sẽ được tự động trừ khỏi sổ tồn kho và ghi nhận chi phí hao hụt.
                </p>
              </div>
            </div>

            {canReview && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsApproveConfirmOpen(true)}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Duyệt phiếu
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsRejectModalOpen(true)}
                  leftIcon={<XCircle className="w-4 h-4" />}
                >
                  Từ chối
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Banner for Rejected */}
        {voucher.status === 'rejected' && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-rose-900 dark:text-rose-200 text-sm">
                Phiếu điều chỉnh đã bị từ chối phê duyệt
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">
                Lý do từ chối: <strong>{voucher.rejectReason || 'Không có lý do cụ thể'}</strong>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Người từ chối: {voucher.reviewedByName || 'Quản lý kho'} • Ngày:{' '}
                {voucher.reviewedAt ? formatDateTime(voucher.reviewedAt) : ''}
              </p>
            </div>
          </div>
        )}

        {/* Card 1: Header Voucher Info */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs font-mono font-medium text-slate-500">MÃ PHIẾU ĐIỀU CHỈNH</span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {voucher.code}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${typeCfg.bg}`}
              >
                {typeCfg.icon}
                {typeCfg.label}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg}`}
              >
                {statusCfg.icon}
                {statusCfg.label}
              </span>
            </div>
          </div>

          {/* Grid Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5 text-sm">
            <div>
              <span className="text-xs text-slate-400 block">Kho hàng</span>
              <div className="flex items-center gap-1.5 mt-1 font-medium text-slate-800 dark:text-slate-200">
                <Warehouse className="w-4 h-4 text-slate-400" />
                {voucher.warehouse}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Ngày ghi nhận</span>
              <div className="flex items-center gap-1.5 mt-1 font-medium text-slate-800 dark:text-slate-200">
                <Calendar className="w-4 h-4 text-slate-400" />
                {voucher.adjustDate}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Người lập phiếu</span>
              <div className="flex items-center gap-1.5 mt-1 font-medium text-slate-800 dark:text-slate-200">
                <User className="w-4 h-4 text-slate-400" />
                {voucher.createdByName}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Thời điểm tạo</span>
              <div className="flex items-center gap-1.5 mt-1 font-medium text-slate-800 dark:text-slate-200">
                <Clock className="w-4 h-4 text-slate-400" />
                {formatDateTime(voucher.createdAt)}
              </div>
            </div>
          </div>

          {/* Reason section */}
          <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
              Lý do điều chỉnh
            </span>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {voucher.reason}
            </p>
          </div>
        </div>

        {/* Card 2: Items Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
              Danh sách hàng hóa điều chỉnh giảm
            </h3>
            <span className="text-xs text-slate-500">
              {voucher.items.length} mặt hàng
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3.5 text-center w-12">STT</th>
                  <th className="px-4 py-3.5">Mã SKU</th>
                  <th className="px-4 py-3.5">Tên sản phẩm</th>
                  <th className="px-4 py-3.5 text-center">Tồn trước ĐC</th>
                  <th className="px-4 py-3.5 text-center">SL giảm</th>
                  <th className="px-4 py-3.5 text-right">Giá vốn</th>
                  <th className="px-4 py-3.5 text-right">Giá trị tổn thất</th>
                  <th className="px-4 py-3.5">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {voucher.items.map((item, idx) => (
                  <tr
                    key={item.productId || idx}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3.5 text-center text-slate-400 text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {item.sku}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                      {item.name}
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-600 dark:text-slate-400">
                      {formatNumber(item.currentStock)}
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-rose-600 dark:text-rose-400">
                      -{formatNumber(item.adjustQty)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-600 dark:text-slate-400">
                      {formatNumber(item.costPrice)} đ
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-rose-600 dark:text-rose-400">
                      {formatNumber(item.lossValue)} đ
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 italic">
                      {item.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Summary Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-500">
              Biên bản này được hệ thống lập tự động và có hiệu lực kế toán khi hoàn tất duyệt.
            </div>

            <div className="flex items-center gap-8 text-right">
              <div>
                <span className="text-xs text-slate-400 block">Tổng số lượng giảm</span>
                <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {formatNumber(voucher.totalLossQty)} chiếc
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Tổng giá trị tổn thất</span>
                <span className="text-xl font-extrabold text-rose-600 dark:text-rose-400">
                  {formatNumber(voucher.totalLossValue)} đ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Timeline & Audit History */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-500" />
            Nhật ký xử lý phiếu
          </h3>

          <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {/* Step 1: Created */}
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-primary-500 border-2 border-white dark:border-slate-900" />
              <div>
                <div className="text-xs text-slate-400">{formatDateTime(voucher.createdAt)}</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  Lập phiếu điều chỉnh tồn kho
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Thực hiện bởi: <strong>{voucher.createdByName}</strong>
                </div>
              </div>
            </div>

            {/* Step 2: Reviewed */}
            {voucher.reviewedAt ? (
              <div className="relative">
                <div
                  className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${
                    voucher.status === 'approved' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <div>
                  <div className="text-xs text-slate-400">{formatDateTime(voucher.reviewedAt)}</div>
                  <div
                    className={`text-sm font-semibold mt-0.5 ${
                      voucher.status === 'approved'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {voucher.status === 'approved'
                      ? 'Đã phê duyệt phiếu điều chỉnh'
                      : 'Đã từ chối phiếu điều chỉnh'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Quản lý duyệt: <strong>{voucher.reviewedByName || 'Quản lý kho'}</strong>
                  </div>
                  {voucher.rejectReason && (
                    <div className="mt-1 text-xs text-rose-600 dark:text-rose-400 italic">
                      Lý do: "{voucher.rejectReason}"
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-white dark:border-slate-900 animate-pulse" />
                <div>
                  <div className="text-xs text-amber-500 font-medium">Hiện tại</div>
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-0.5">
                    Đang đợi Quản lý kho xem xét và phê duyệt
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Confirm Approve */}
      {isApproveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Xác nhận duyệt phiếu điều chỉnh?
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thao tác này sẽ tự động giảm trừ tồn kho của {voucher.items.length} sản phẩm.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1 text-slate-600 dark:text-slate-300">
              <div>Mã phiếu: <strong>{voucher.code}</strong></div>
              <div>Kho áp dụng: <strong>{voucher.warehouse}</strong></div>
              <div>Tổng tổn thất: <strong className="text-rose-600">{formatNumber(voucher.totalLossValue)} đ</strong></div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsApproveConfirmOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={actionLoading}
                onClick={handleApprove}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Xác nhận duyệt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reject with Reason */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Từ chối phiếu điều chỉnh
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vui lòng cung cấp lý do từ chối để người lập phiếu biết nguyên nhân.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Lý do từ chối <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do chi tiết (ví dụ: cần trích xuất camera an ninh, chứng từ chưa đủ...)"
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <div className="text-[11px] text-slate-400 mt-1">
                Tối thiểu 5 ký tự ({rejectReason.trim().length}/5)
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectModalOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={actionLoading}
                onClick={handleReject}
                disabled={rejectReason.trim().length < 5}
                leftIcon={<XCircle className="w-4 h-4" />}
              >
                Xác nhận từ chối
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
