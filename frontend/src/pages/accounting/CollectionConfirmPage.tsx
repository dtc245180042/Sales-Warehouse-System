import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Filter,
  DollarSign,
  Clock,
  AlertCircle,
  Check,
  X,
  ShieldCheck,
  Calendar,
  Image as ImageIcon,
} from 'lucide-react';
import { CollectionReceipt, CollectionStatus } from '../../types/CollectionReceipt';
import { initialCollectionReceipts } from '../../mock/collectionReceipts';
import { formatCurrency } from '../../utils/formatters';

// -------------------------------------------------------------
// Sub-components declared OUTSIDE main component (AGENTS.md rule)
// -------------------------------------------------------------

interface ConfirmStatusBadgeProps {
  status: CollectionStatus;
}

const ConfirmStatusBadge: React.FC<ConfirmStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'submitted':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 animate-pulse">
          <Clock className="w-3.5 h-3.5" />
          Chờ xác nhận
        </span>
      );
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Đã xác nhận nhận tiền
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800">
          <XCircle className="w-3.5 h-3.5" />
          Đã từ chối
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          Chờ nộp
        </span>
      );
  }
};

interface RejectReasonModalProps {
  open: boolean;
  receiptCode?: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

const RejectReasonModal: React.FC<RejectReasonModalProps> = ({
  open,
  receiptCode,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Vui lòng nêu rõ lý do từ chối khoản thu');
      return;
    }
    onSubmit(reason.trim());
    setReason('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-600">
            <XCircle className="w-5 h-5" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Từ Chối Khoản Thu: {receiptCode}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do từ chối (bắt buộc) <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="VD: Ảnh biên lai bị mờ thông tin, số tiền nộp không khớp với sao kê ngân hàng..."
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-white"
            />
            {error && (
              <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Xác nhận từ chối
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ReceiptImageModalProps {
  open: boolean;
  receipt?: CollectionReceipt;
  onClose: () => void;
}

const ReceiptImageModal: React.FC<ReceiptImageModalProps> = ({ open, receipt, onClose }) => {
  if (!open || !receipt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary-600" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Biên lai khoản thu: {receipt.code} ({receipt.customerName})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Quick info summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-xs">
            <div>
              <span className="text-slate-400 block">Số tiền thu:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono">
                {formatCurrency(receipt.amount)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Đơn hàng:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {receipt.orderCode}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Người thu:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {receipt.collectedBy}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Tuyến đường:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {receipt.routeName}
              </span>
            </div>
          </div>

          {/* Image */}
          <div className="flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950/60 rounded-xl">
            {receipt.receiptImageUrl ? (
              <img
                src={receipt.receiptImageUrl}
                alt="Biên lai chứng từ"
                className="max-h-[50vh] object-contain rounded-lg border border-slate-200 dark:border-slate-800 shadow"
              />
            ) : (
              <div className="py-12 text-slate-400 italic">Không có ảnh biên lai đính kèm</div>
            )}
          </div>

          {receipt.note && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200">
              <strong>Ghi chú từ nhân viên:</strong> {receipt.note}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Main CollectionConfirmPage Component (SCRUM-741)
// -------------------------------------------------------------

export const CollectionConfirmPage: React.FC = () => {
  const [receipts, setReceipts] = useState<CollectionReceipt[]>(initialCollectionReceipts);
  const [activeTab, setActiveTab] = useState<'all' | 'submitted' | 'confirmed' | 'rejected'>('submitted');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<CollectionReceipt | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [rejectModalState, setRejectModalState] = useState<{
    open: boolean;
    receiptId?: string;
    receiptCode?: string;
  }>({ open: false });

  // Counts
  const counts = useMemo(() => {
    return {
      all: receipts.length,
      submitted: receipts.filter((r) => r.status === 'submitted').length,
      confirmed: receipts.filter((r) => r.status === 'confirmed').length,
      rejected: receipts.filter((r) => r.status === 'rejected').length,
    };
  }, [receipts]);

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      const matchTab = activeTab === 'all' || r.status === activeTab;
      const matchSearch =
        r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.collectedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.routeName.toLowerCase().includes(searchTerm.toLowerCase());

      return matchTab && matchSearch;
    });
  }, [receipts, activeTab, searchTerm]);

  // Accountant actions
  const handleConfirm = (id: string) => {
    if (window.confirm('Bạn có chắc chắn xác nhận đã nhận đủ số tiền của khoản thu này?')) {
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: 'confirmed',
                confirmedBy: 'Ngô Kế Toán (Accountant)',
                confirmedAt: new Date().toISOString(),
                rejectedReason: undefined,
              }
            : r
        )
      );
    }
  };

  const handleOpenRejectModal = (id: string, code: string) => {
    setRejectModalState({
      open: true,
      receiptId: id,
      receiptCode: code,
    });
  };

  const handleConfirmReject = (reason: string) => {
    if (!rejectModalState.receiptId) return;

    setReceipts((prev) =>
      prev.map((r) =>
        r.id === rejectModalState.receiptId
          ? {
              ...r,
              status: 'rejected',
              rejectedReason: reason,
              confirmedBy: 'Ngô Kế Toán (Accountant)',
              confirmedAt: new Date().toISOString(),
            }
            : r
      )
    );

    setRejectModalState({ open: false });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--/--/----';
    const d = new Date(isoString);
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-primary-600" />
            Kế Toán Xác Nhận Khoản Thu
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kiểm tra đối soát hình ảnh biên lai thanh toán và phê duyệt ghi nhận tiền vào sổ quỹ
          </p>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('submitted')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'submitted'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          Chờ xác nhận
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === 'submitted' ? 'bg-amber-800/60 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {counts.submitted}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('confirmed')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'confirmed'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Đã nhận tiền
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === 'confirmed' ? 'bg-emerald-800/60 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {counts.confirmed}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'rejected'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Đã từ chối
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === 'rejected' ? 'bg-rose-800/60 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {counts.rejected}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'all'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          Tất cả ({counts.all})
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã thu, đơn hàng, khách hàng, người thu..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Mã thu & Thời gian</th>
                <th className="py-3 px-4">Đơn hàng liên quan</th>
                <th className="py-3 px-4">Khách hàng & Tuyến</th>
                <th className="py-3 px-4 text-right">Số tiền thu</th>
                <th className="py-3 px-4">Người nộp thu</th>
                <th className="py-3 px-4 text-center">Biên lai</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-center">Thao tác kế toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Không có khoản thu nào trong danh mục này
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white text-xs">
                      {r.code}
                      <span className="block text-[11px] text-slate-400 font-sans font-normal mt-0.5">
                        {formatDate(r.collectedAt)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white text-xs">
                      {r.orderCode}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-900 dark:text-white block">
                        {r.customerName}
                      </span>
                      <span className="text-xs text-slate-500">{r.routeName}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white text-base">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200 block">
                        {r.collectedBy}
                      </span>
                      {r.confirmedAt && (
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Duyệt: {formatDate(r.confirmedAt)}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {r.receiptImageUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReceipt(r);
                            setIsImageModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-300 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Xem ảnh
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Không có</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <ConfirmStatusBadge status={r.status} />
                      {r.status === 'rejected' && r.rejectedReason && (
                        <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 max-w-xs" title={r.rejectedReason}>
                          <strong>Lý do:</strong> {r.rejectedReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {r.status === 'submitted' ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleConfirm(r.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 transition-colors shadow-sm"
                            title="Xác nhận đã nhận tiền"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Xác nhận
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRejectModal(r.id, r.code)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1 transition-colors"
                            title="Từ chối khoản thu"
                          >
                            <X className="w-3.5 h-3.5" />
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Đã hoàn tất</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal View Receipt Details */}
      <ReceiptImageModal
        open={isImageModalOpen}
        receipt={selectedReceipt || undefined}
        onClose={() => {
          setIsImageModalOpen(false);
          setSelectedReceipt(null);
        }}
      />

      {/* Modal Reject Reason */}
      <RejectReasonModal
        open={rejectModalState.open}
        receiptCode={rejectModalState.receiptCode}
        onClose={() => setRejectModalState({ open: false })}
        onSubmit={handleConfirmReject}
      />
    </div>
  );
};
