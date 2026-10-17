import React, { useState, useMemo, useRef } from 'react';
import {
  DollarSign,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Upload,
  Image as ImageIcon,
  X,
  Eye,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { CollectionReceipt, CollectionStatus } from '../../types/CollectionReceipt';
import { initialCollectionReceipts } from '../../mock/collectionReceipts';
import { formatCurrency } from '../../utils/formatters';

// -------------------------------------------------------------
// Sub-components declared OUTSIDE main component (AGENTS.md rule)
// -------------------------------------------------------------

interface CollectionStatusBadgeProps {
  status: CollectionStatus;
}

const CollectionStatusBadge: React.FC<CollectionStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'submitted':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Chờ kế toán xác nhận
        </span>
      );
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Đã nhận tiền
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800">
          <XCircle className="w-3.5 h-3.5" />
          Bị từ chối
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          <Clock className="w-3.5 h-3.5" />
          Chờ nộp
        </span>
      );
  }
};

interface ImagePreviewModalProps {
  open: boolean;
  imageUrl?: string;
  receiptCode?: string;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  open,
  imageUrl,
  receiptCode,
  onClose,
}) => {
  if (!open || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary-600" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Ảnh biên lai: {receiptCode}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex items-center justify-center bg-slate-50 dark:bg-slate-950/50 min-h-[300px]">
          <img
            src={imageUrl}
            alt="Biên lai thanh toán"
            className="max-w-full max-h-[60vh] object-contain rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm"
          />
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

interface NewReceiptModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (receipt: Partial<CollectionReceipt>) => void;
}

const NewReceiptModal: React.FC<NewReceiptModalProps> = ({ open, onClose, onSubmit }) => {
  const [orderCode, setOrderCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [routeName, setRouteName] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (max 5MB)
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setFileError('Chỉ chấp nhận file hình ảnh định dạng JPG, PNG hoặc WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError('Kích thước ảnh tối đa là 5MB');
      return;
    }

    setFileError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderCode || !customerName || !amount || Number(amount) <= 0) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc và số tiền hợp lệ');
      return;
    }

    onSubmit({
      orderCode,
      orderId: `ORD-${Date.now().toString().slice(-4)}`,
      customerName,
      customerPhone: customerPhone || '0901 000 000',
      routeName: routeName || 'Tuyến mặc định',
      amount: Number(amount),
      note,
      receiptImageUrl: imagePreview || undefined,
      collectedBy: 'Nguyễn Văn Bán Hàng (Sales)',
      collectedAt: new Date().toISOString(),
      status: 'submitted',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Ghi Nhận Khoản Thu Mới Theo Tuyến
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã đơn hàng liên quan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
                placeholder="VD: DH-20261017-08"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tuyến đường giao/thu
              </label>
              <input
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="VD: Tuyến Q1 - Bến Nghé"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên khách hàng / Đại lý <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="VD: Đại lý Nguyễn Văn A"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="VD: 0908 123 456"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Số tiền thu (VNĐ) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min={1000}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              placeholder="VD: 5000000"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white font-mono font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú thu tiền
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Thu tiền mặt tại quầy, khách xin nợ lại 2 triệu..."
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          {/* Upload ảnh biên lai */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ảnh biên lai / Chuyển khoản (JPG, PNG, WEBP tối đa 5MB)
            </label>

            {imagePreview ? (
              <div className="relative border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                  />
                  <div>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block">
                      Đã tải ảnh lên thành công
                    </span>
                    <span className="text-xs text-slate-400">Có thể xem trước hoặc xóa để chọn lại</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary-500 dark:hover:border-primary-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/50"
              >
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nhấn để chọn ảnh biên lai hoặc chụp ảnh phiếu thu
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Định dạng hỗ trợ: JPG, PNG, WEBP (tối đa 5MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

            {fileError && (
              <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {fileError}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Lưu & Gửi kế toán
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Main CollectionReceiptPage Component (SCRUM-740)
// -------------------------------------------------------------

export const CollectionReceiptPage: React.FC = () => {
  const [receipts, setReceipts] = useState<CollectionReceipt[]>(initialCollectionReceipts);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewImageState, setPreviewImageState] = useState<{
    open: boolean;
    imageUrl?: string;
    receiptCode?: string;
  }>({ open: false });

  // Stats calculation
  const stats = useMemo(() => {
    const totalAmount = receipts.reduce((sum, r) => sum + r.amount, 0);
    const submittedCount = receipts.filter((r) => r.status === 'submitted').length;
    const confirmedCount = receipts.filter((r) => r.status === 'confirmed').length;
    const rejectedCount = receipts.filter((r) => r.status === 'rejected').length;
    return { totalAmount, submittedCount, confirmedCount, rejectedCount };
  }, [receipts]);

  // Unique routes
  const routes = useMemo(() => {
    return Array.from(new Set(receipts.map((r) => r.routeName)));
  }, [receipts]);

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((item) => {
      const matchSearch =
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.collectedBy.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchRoute = routeFilter === 'all' || item.routeName === routeFilter;

      return matchSearch && matchStatus && matchRoute;
    });
  }, [receipts, searchTerm, statusFilter, routeFilter]);

  const handleAddNewReceipt = (newReceipt: Partial<CollectionReceipt>) => {
    const code = `KT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${(
      receipts.length + 1
    )
      .toString()
      .padStart(3, '0')}`;

    const receipt: CollectionReceipt = {
      id: `CR-${Date.now()}`,
      code,
      orderId: newReceipt.orderId || 'ORD-000',
      orderCode: newReceipt.orderCode || 'DH-000',
      customerName: newReceipt.customerName || '',
      customerPhone: newReceipt.customerPhone || '',
      routeName: newReceipt.routeName || 'Tuyến mặc định',
      amount: newReceipt.amount || 0,
      collectedBy: newReceipt.collectedBy || 'Nhân viên kinh doanh',
      collectedAt: newReceipt.collectedAt || new Date().toISOString(),
      receiptImageUrl: newReceipt.receiptImageUrl,
      status: 'submitted',
      note: newReceipt.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setReceipts([receipt, ...receipts]);
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
      {/* Page Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <DollarSign className="w-7 h-7 text-emerald-600" />
            Ghi Nhận Khoản Thu Theo Tuyến
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ghi nhận các khoản thu tiền mặt/chuyển khoản từ khách hàng theo lộ trình và gửi ảnh biên lai đối soát
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-sm transition-all shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Ghi nhận khoản thu mới
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tổng số tiền đã ghi nhận
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {formatCurrency(stats.totalAmount)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Chờ kế toán xác nhận
            </span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/50 rounded-lg text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {stats.submittedCount}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Kế toán đã duyệt
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            {stats.confirmedCount}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Khoản thu bị từ chối
            </span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/50 rounded-lg text-rose-600">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">
            {stats.rejectedCount}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã thu, đơn hàng, khách hàng, nhân viên..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="submitted">Chờ kế toán xác nhận</option>
              <option value="confirmed">Đã nhận tiền</option>
              <option value="rejected">Bị từ chối</option>
              <option value="pending">Chờ nộp</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              <option value="all">Tất cả tuyến đường</option>
              {routes.map((rt) => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Mã khoản thu</th>
                <th className="py-3 px-4">Đơn hàng / Tuyến</th>
                <th className="py-3 px-4">Khách hàng</th>
                <th className="py-3 px-4 text-right">Số tiền thu</th>
                <th className="py-3 px-4">Nhân viên thu</th>
                <th className="py-3 px-4 text-center">Ảnh biên lai</th>
                <th className="py-3 px-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Không tìm thấy khoản thu nào
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
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 dark:text-white block text-xs">
                        {r.orderCode}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {r.routeName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-900 dark:text-white block">
                        {r.customerName}
                      </span>
                      <span className="text-xs text-slate-500">{r.customerPhone}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200 block">
                        {r.collectedBy}
                      </span>
                      {r.confirmedBy && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                          Duyệt bởi: {r.confirmedBy}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {r.receiptImageUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewImageState({
                              open: true,
                              imageUrl: r.receiptImageUrl,
                              receiptCode: r.code,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-primary-600" />
                          Xem ảnh
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Chưa có</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <CollectionStatusBadge status={r.status} />
                      {r.status === 'rejected' && r.rejectedReason && (
                        <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 max-w-xs truncate" title={r.rejectedReason}>
                          Lý do: {r.rejectedReason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal New Receipt */}
      <NewReceiptModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddNewReceipt}
      />

      {/* Modal Image Preview */}
      <ImagePreviewModal
        open={previewImageState.open}
        imageUrl={previewImageState.imageUrl}
        receiptCode={previewImageState.receiptCode}
        onClose={() => setPreviewImageState({ open: false })}
      />
    </div>
  );
};
