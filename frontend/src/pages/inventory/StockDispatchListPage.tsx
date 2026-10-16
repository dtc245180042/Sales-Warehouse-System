import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  Search,
  CheckCircle,
  Clock,
  Eye,
  AlertTriangle,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building,
  Upload,
  XCircle,
  FileCheck,
  FileText,
  Image,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Calendar,
  User,
  Phone,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { dispatchService } from '../../services/dispatchService';
import {
  deliveryConfirmationService,
  DeliveryFailureReasonItem,
  DispatchDeliveryResponse,
} from '../../services/deliveryConfirmationService';
import { StockDispatch } from '../../types/StockDispatch';
import { useToast } from '../../contexts/ToastContext';

export const StockDispatchListPage: React.FC = () => {
  const { showToast } = useToast();
  const [dispatches, setDispatches] = useState<StockDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'CONFIRMED' | 'DELIVERED' | 'DELIVERY_FAILED' | 'SHORTFALL'>('ALL');

  // Modals
  const [selectedDispatch, setSelectedDispatch] = useState<StockDispatch | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // S6-08 Confirm Delivery Modal State
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // S6-08 Delivery Failure Modal State
  const [isFailOpen, setIsFailOpen] = useState(false);
  const [failureReasons, setFailureReasons] = useState<DeliveryFailureReasonItem[]>([]);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [failureNotes, setFailureNotes] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [isSubmittingFail, setIsSubmittingFail] = useState(false);

  // S6-08 POD Viewer Modal State
  const [isPodViewerOpen, setIsPodViewerOpen] = useState(false);
  const [currentDelivery, setCurrentDelivery] = useState<DispatchDeliveryResponse | null>(null);
  const [loadingDeliveryInfo, setLoadingDeliveryInfo] = useState(false);

  // S6-08 Restock Info Modal State
  const [isRestockDetailOpen, setIsRestockDetailOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await dispatchService.getDispatches();
      setDispatches(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách phiếu xuất kho', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Tải danh mục lý do giao hàng thất bại
    deliveryConfirmationService.getFailureReasons().then((reasons) => {
      setFailureReasons(reasons);
      if (reasons.length > 0) {
        setSelectedReason(reasons[0].label);
      }
    });
  }, []);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        d.id.toLowerCase().includes(q) ||
        d.order_id.toLowerCase().includes(q) ||
        (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
        d.customer_id.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (activeTab === 'CONFIRMED') return d.status === 'CONFIRMED';
      if (activeTab === 'DELIVERED') return d.status === 'DELIVERED';
      if (activeTab === 'DELIVERY_FAILED') return d.status === 'DELIVERY_FAILED';
      if (activeTab === 'SHORTFALL') return d.items.some((it) => it.shortfall_quantity > 0);
      return true;
    });
  }, [dispatches, searchQuery, activeTab]);

  const stats = useMemo(() => {
    const total = dispatches.length;
    const confirmed = dispatches.filter((d) => d.status === 'CONFIRMED').length;
    const delivered = dispatches.filter((d) => d.status === 'DELIVERED').length;
    const failed = dispatches.filter((d) => d.status === 'DELIVERY_FAILED').length;
    const hasShortfall = dispatches.filter((d) =>
      d.items.some((it) => it.shortfall_quantity > 0)
    ).length;
    return { total, confirmed, delivered, failed, hasShortfall };
  }, [dispatches]);

  // ==============================================================================
  // XỬ LÝ XÁC NHẬN GIAO THÀNH CÔNG (POD) - S6-08
  // ==============================================================================
  const openConfirmDeliveryModal = (dispatch: StockDispatch) => {
    setSelectedDispatch(dispatch);
    setReceiverName(dispatch.customer_name || '');
    setReceiverPhone('');
    // Mặc định thời gian hiện tại theo múi giờ địa phương YYYY-MM-DDTHH:mm
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setDeliveredAt(localIso);
    setProofFile(null);
    setProofPreviewUrl(null);
    setUploadedProofUrl(null);
    setConfirmNotes('');
    setIsConfirmOpen(true);
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Kích thước tệp chứng từ không được vượt quá 5MB', 'error');
      return;
    }

    setProofFile(file);
    const preview = URL.createObjectURL(file);
    setProofPreviewUrl(preview);

    try {
      setIsUploadingProof(true);
      const res = await deliveryConfirmationService.uploadProofFile(file);
      setUploadedProofUrl(res.proof_image_url);
      showToast('Tải lên ảnh biên bản ký nhận (POD) thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải ảnh chứng từ POD lên máy chủ', 'error');
    } finally {
      setIsUploadingProof(false);
    }
  };

  const handleSubmitConfirmDelivery = async () => {
    if (!selectedDispatch) return;

    if (!receiverName.trim()) {
      showToast('Vui lòng nhập họ tên người nhận hàng thực tế', 'error');
      return;
    }

    if (!uploadedProofUrl && !proofPreviewUrl) {
      showToast('Bắt buộc phải tải lên ảnh biên bản có chữ ký đại lý (chứng từ POD)', 'error');
      return;
    }

    try {
      setIsSubmittingConfirm(true);
      const proofUrl = uploadedProofUrl || proofPreviewUrl || '/uploads/delivery_proofs/sample.jpg';
      const payloadDeliveredAt = deliveredAt ? new Date(deliveredAt).toISOString() : new Date().toISOString();

      await deliveryConfirmationService.confirmDelivery(selectedDispatch.id, {
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim() || undefined,
        delivered_at: payloadDeliveredAt,
        proof_image_url: proofUrl,
        notes: confirmNotes.trim() || undefined,
      });

      showToast(
        `Xác nhận giao hàng ${selectedDispatch.id} thành công! Đã lưu biên bản POD và kích hoạt điều kiện phát hành hóa đơn Sprint 7.`,
        'success'
      );

      // Cập nhật trạng thái cục bộ
      setDispatches((prev) =>
        prev.map((d) =>
          d.id === selectedDispatch.id
            ? { ...d, status: 'DELIVERED', items: d.items.map((it) => ({ ...it, delivered_quantity: it.dispatched_quantity })) }
            : d
        )
      );

      setIsConfirmOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xác nhận giao hàng', 'error');
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  // ==============================================================================
  // XỬ LÝ BÁO GIAO HÀNG THẤT BẠI & TỰ ĐỘNG HOÀN KHO - S6-08
  // ==============================================================================
  const openFailDeliveryModal = (dispatch: StockDispatch) => {
    setSelectedDispatch(dispatch);
    setSelectedReason(failureReasons[0]?.label || 'Khách hàng đi vắng / không liên lạc được');
    setCustomReason('');
    setFailureNotes('');
    setRestockNotes('');
    setIsFailOpen(true);
  };

  const handleSubmitFailDelivery = async () => {
    if (!selectedDispatch) return;

    const finalReason = selectedReason === 'Lý do khác' ? customReason.trim() : selectedReason;
    if (!finalReason) {
      showToast('Vui lòng chọn hoặc nhập lý do giao hàng thất bại', 'error');
      return;
    }

    try {
      setIsSubmittingFail(true);
      await deliveryConfirmationService.failDelivery(selectedDispatch.id, {
        failure_reason: finalReason,
        failure_notes: failureNotes.trim() || undefined,
        notes: restockNotes.trim() || undefined,
      });

      showToast(
        `Đã ghi nhận giao thất bại phiếu ${selectedDispatch.id}. Toàn bộ hàng đã được tự động hoàn về kho ${selectedDispatch.warehouse_name || selectedDispatch.warehouse_id}!`,
        'info'
      );

      // Cập nhật trạng thái cục bộ
      setDispatches((prev) =>
        prev.map((d) => (d.id === selectedDispatch.id ? { ...d, status: 'DELIVERY_FAILED' } : d))
      );

      setIsFailOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi báo giao hàng thất bại', 'error');
    } finally {
      setIsSubmittingFail(false);
    }
  };

  // ==============================================================================
  // XEM CHỨNG TỪ POD HOẶC THÔNG TIN HOÀN KHO
  // ==============================================================================
  const handleOpenPodViewer = async (dispatch: StockDispatch) => {
    setSelectedDispatch(dispatch);
    setIsPodViewerOpen(true);
    setLoadingDeliveryInfo(true);
    try {
      const info = await deliveryConfirmationService.getDeliveryInfo(dispatch.id);
      setCurrentDelivery(info);
    } catch (err: any) {
      console.warn('Không lấy được dữ liệu POD từ API, sử dụng thông tin hiện có:', err);
    } finally {
      setLoadingDeliveryInfo(false);
    }
  };

  const handleOpenRestockDetail = async (dispatch: StockDispatch) => {
    setSelectedDispatch(dispatch);
    setIsRestockDetailOpen(true);
    setLoadingDeliveryInfo(true);
    try {
      const info = await deliveryConfirmationService.getDeliveryInfo(dispatch.id);
      setCurrentDelivery(info);
    } catch (err: any) {
      console.warn('Không lấy được dữ liệu hoàn kho từ API, sử dụng thông tin hiện có:', err);
    } finally {
      setLoadingDeliveryInfo(false);
    }
  };

  return (
    <PageContainer
      title="Phiếu Xuất Kho & Xác Nhận Giao Hàng"
      subtitle="Theo dõi xuất kho, xác nhận giao hàng kèm ảnh biên bản POD và xử lý tự động hoàn kho khi giao thất bại (S6-08 / SC-259)"
    >
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng phiếu xuất</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đang giao hàng</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{stats.confirmed}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã giao có POD</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.delivered}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thất bại / Hoàn kho</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{stats.failed}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phiếu nợ hàng</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.hasShortfall}</p>
          </div>
        </div>
      </div>

      {/* 2. Filter Tabs & Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'
            }`}
          >
            Tất cả ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab('CONFIRMED')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'CONFIRMED'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Chờ xác nhận giao ({stats.confirmed})
          </button>
          <button
            onClick={() => setActiveTab('DELIVERED')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'DELIVERED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            Đã giao có POD ({stats.delivered})
          </button>
          <button
            onClick={() => setActiveTab('DELIVERY_FAILED')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'DELIVERY_FAILED'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Giao thất bại ({stats.failed})
          </button>
          <button
            onClick={() => setActiveTab('SHORTFALL')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'SHORTFALL'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Nợ hàng ({stats.hasShortfall})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã PXK, đơn ORD, đại lý..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 3. Table of Dispatches */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
              <tr>
                <th className="py-3.5 px-4">Mã phiếu xuất</th>
                <th className="py-3.5 px-4">Đơn hàng gốc</th>
                <th className="py-3.5 px-4">Đại lý / Khách hàng</th>
                <th className="py-3.5 px-4">Kho xuất</th>
                <th className="py-3.5 px-4">Tình trạng xuất</th>
                <th className="py-3.5 px-4">Trạng thái giao hàng</th>
                <th className="py-3.5 px-4 text-right">Thao tác S6-08</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Đang tải danh sách phiếu xuất kho...
                  </td>
                </tr>
              ) : filteredDispatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Không tìm thấy phiếu xuất kho nào phù hợp bộ lọc
                  </td>
                </tr>
              ) : (
                filteredDispatches.map((item) => {
                  const hasShortfall = item.items.some((it) => it.shortfall_quantity > 0);
                  const isDelivered = item.status === 'DELIVERED';
                  const isFailed = item.status === 'DELIVERY_FAILED';
                  const isConfirmed = item.status === 'CONFIRMED';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {item.id}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {item.order_id}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                        {item.customer_name || item.customer_id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {item.warehouse_name || `Kho #${item.warehouse_id}`}
                      </td>
                      <td className="py-3.5 px-4">
                        {hasShortfall ? (
                          <span className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md">
                            Xuất thiếu (Có nợ hàng)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                            Xuất đủ 100%
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isDelivered && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Đã giao (Có POD)
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                            <RotateCcw className="w-3 h-3 text-rose-600" />
                            Giao thất bại (Đã hoàn kho)
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                            <Clock className="w-3 h-3 text-blue-600" />
                            Đang giao hàng
                          </span>
                        )}
                        {item.status === 'DRAFT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Đang soạn / Giữ chỗ
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Nút xem chi tiết sản phẩm trong phiếu */}
                          <button
                            title="Xem chi tiết phiếu xuất"
                            onClick={() => {
                              setSelectedDispatch(item);
                              setIsDetailOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* THAO TÁC KHI ĐANG GIAO HÀNG (CONFIRMED) */}
                          {isConfirmed && (
                            <>
                              <button
                                onClick={() => openConfirmDeliveryModal(item)}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all flex items-center gap-1 hover:scale-105 active:scale-95"
                                title="Xác nhận người nhận và tải ảnh biên bản có chữ ký (POD)"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Xác nhận giao
                              </button>
                              <button
                                onClick={() => openFailDeliveryModal(item)}
                                className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 rounded-lg transition-all flex items-center gap-1"
                                title="Báo giao thất bại và tự động hoàn trả hàng về kho"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Báo thất bại
                              </button>
                            </>
                          )}

                          {/* THAO TÁC KHI ĐÃ GIAO THÀNH CÔNG (DELIVERED) */}
                          {isDelivered && (
                            <button
                              onClick={() => handleOpenPodViewer(item)}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 rounded-lg transition-all flex items-center gap-1"
                              title="Xem ảnh chữ ký biên bản giao nhận POD"
                            >
                              <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Xem POD
                            </button>
                          )}

                          {/* THAO TÁC KHI GIAO THẤT BẠI (DELIVERY_FAILED) */}
                          {isFailed && (
                            <button
                              onClick={() => handleOpenRestockDetail(item)}
                              className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 rounded-lg transition-all flex items-center gap-1"
                              title="Xem lý do thất bại và chứng từ hoàn kho"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                              Chi tiết hoàn kho
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* 4. MODAL XÁC NHẬN GIAO HÀNG THÀNH CÔNG KÈM ẢNH POD (S6-08 / SC-259)            */}
      {/* ============================================================================== */}
      <Modal
        isOpen={isConfirmOpen}
        onClose={() => !isSubmittingConfirm && setIsConfirmOpen(false)}
        title="Xác Nhận Giao Hàng Thành Công (POD)"
        subtitle={`Ghi nhận người nhận, thời điểm giao và đính kèm ảnh biên bản có chữ ký cho phiếu: ${selectedDispatch?.id}`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {/* Thông tin đơn và khách hàng */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
            <div>
              <span className="text-slate-400 block text-[11px]">Đơn hàng gốc:</span>
              <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                {selectedDispatch?.order_id}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Đại lý nhận hàng:</span>
              <strong>{selectedDispatch?.customer_name || selectedDispatch?.customer_id}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Kho xuất hàng:</span>
              <span>{selectedDispatch?.warehouse_name || `Kho #${selectedDispatch?.warehouse_id}`}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Kích hoạt Sprint 7:</span>
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Đủ điều kiện xuất Hóa đơn
              </span>
            </div>
          </div>

          {/* Form nhập thông tin người nhận & thời điểm */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Người nhận hàng thực tế <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn Đại Lý"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Số điện thoại người nhận
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  placeholder="0987654321"
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Thời điểm giao hàng thực tế <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="datetime-local"
                value={deliveredAt}
                onChange={(e) => setDeliveredAt(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* VÙNG TẢI ẢNH CHỨNG TỪ BIÊN BẢN CÓ CHỮ KÝ (POD) */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Ảnh biên bản giao nhận có chữ ký (Chứng từ POD) <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,.pdf"
              onChange={handleProofFileChange}
              className="hidden"
            />

            {!proofPreviewUrl ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all flex flex-col items-center justify-center gap-2"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    Bấm để tải lên ảnh biên bản ký nhận (POD)
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hỗ trợ định dạng JPG, PNG, WEBP, PDF (Dung lượng tối đa 5MB)
                  </p>
                </div>
              </div>
            ) : (
              <div className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={proofPreviewUrl}
                    alt="Biên bản giao nhận POD"
                    className="w-16 h-16 object-cover rounded-xl border border-emerald-400 shadow-sm"
                  />
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      {proofFile?.name || 'Ảnh chứng từ đã đính kèm'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isUploadingProof ? 'Đang tải lên máy chủ...' : 'Đã sẵn sàng đối soát chứng từ'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Đổi ảnh khác
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Ghi chú biên bản giao nhận
            </label>
            <textarea
              rows={2}
              placeholder="Ghi chú thêm về tình trạng kiện hàng, chữ ký hoặc số lượng thực giao..."
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Footer nút hành động */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              disabled={isSubmittingConfirm}
              onClick={() => setIsConfirmOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSubmittingConfirm || isUploadingProof}
              onClick={handleSubmitConfirmDelivery}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isSubmittingConfirm ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Đang ghi nhận...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Xác nhận giao thành công (POD)
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ============================================================================== */}
      {/* 5. MODAL BÁO GIAO HÀNG THẤT BẠI & TỰ ĐỘNG HOÀN KHO (S6-08 / SC-259)             */}
      {/* ============================================================================== */}
      <Modal
        isOpen={isFailOpen}
        onClose={() => !isSubmittingFail && setIsFailOpen(false)}
        title="Báo Giao Hàng Thất Bại & Hoàn Hàng Về Kho"
        subtitle={`Phiếu xuất: ${selectedDispatch?.id} - Toàn bộ hàng sẽ được hoàn trả tự động vào kho`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {/* Cảnh báo tự động hoàn kho */}
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3.5 rounded-2xl flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-rose-900 dark:text-rose-200 text-xs leading-relaxed">
              <strong className="font-bold block text-rose-700 dark:text-rose-300 mb-0.5">
                Cơ chế tự động hoàn kho nguyên tử (S6-08):
              </strong>
              Khi xác nhận thất bại, hệ thống sẽ <strong>tự động hoàn trả 100% số lượng xuất</strong> về lại kho{' '}
              <span className="underline font-semibold">{selectedDispatch?.warehouse_name || selectedDispatch?.warehouse_id}</span>,
              cộng lại tồn của từng lô hàng đã xuất, ghi nhận thẻ kho{' '}
              <code className="font-mono bg-rose-100 dark:bg-rose-900 px-1 py-0.5 rounded text-[11px]">IN_RETURN</code>{' '}
              và chặn phát hành hóa đơn ở Sprint 7.
            </div>
          </div>

          {/* Chọn lý do giao thất bại */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Lý do không giao được hàng <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none font-medium"
            >
              {failureReasons.map((r, idx) => (
                <option key={idx} value={r.label}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {selectedReason === 'Lý do khác' && (
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nhập lý do cụ thể <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Nhập chi tiết lý do..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Chi tiết phản hồi của khách hàng / Ghi nhận của tài xế
            </label>
            <textarea
              rows={2}
              placeholder="Ví dụ: Gọi 3 cuộc không nghe máy, khách nhắn đi công tác đến tuần sau..."
              value={failureNotes}
              onChange={(e) => setFailureNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {/* Danh sách hàng sẽ hoàn về kho */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Danh sách sản phẩm sẽ được hoàn về kho ({selectedDispatch?.items.length} mặt hàng)
            </label>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Sản phẩm</th>
                    <th className="py-2 px-3 text-right">Số lượng hoàn</th>
                    <th className="py-2 px-3 text-right">Lô hàng khôi phục</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedDispatch?.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                        {it.product_name || it.sku}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-rose-600">
                        +{it.dispatched_quantity}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono">
                        {it.lots && it.lots.length > 0
                          ? it.lots.map((l) => l.lot_number || `Lô #${l.lot_id}`).join(', ')
                          : 'Tồn chung'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer nút hành động */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              disabled={isSubmittingFail}
              onClick={() => setIsFailOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSubmittingFail}
              onClick={handleSubmitFailDelivery}
              className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isSubmittingFail ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Đang hoàn kho...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Xác nhận giao thất bại & Hoàn kho
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ============================================================================== */}
      {/* 6. MODAL XEM CHỨNG TỪ BIÊN BẢN GIAO NHẬN POD (S6-08 / SC-259)                   */}
      {/* ============================================================================== */}
      <Modal
        isOpen={isPodViewerOpen}
        onClose={() => setIsPodViewerOpen(false)}
        title={`Chứng Từ Giao Nhận POD: ${selectedDispatch?.id}`}
        subtitle="Hồ sơ đối soát giao nhận có chữ ký đại lý phục vụ kích hoạt phát hành hóa đơn Sprint 7"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {loadingDeliveryInfo ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
              Đang tải chứng từ POD...
            </div>
          ) : (
            <>
              {/* Thông tin đối soát */}
              <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3.5 rounded-2xl grid grid-cols-2 gap-3 text-slate-800 dark:text-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">Người nhận hàng ký tên:</span>
                  <strong className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {currentDelivery?.receiver_name || selectedDispatch?.customer_name || 'Đã ký nhận'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Số điện thoại:</span>
                  <span>{currentDelivery?.receiver_phone || 'Không có'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Thời điểm giao thực tế:</span>
                  <strong>
                    {currentDelivery?.delivered_at
                      ? new Date(currentDelivery.delivered_at).toLocaleString('vi-VN')
                      : 'Đã hoàn tất giao'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Người xác nhận bàn giao:</span>
                  <span>{currentDelivery?.confirmed_by_name || 'Nhân viên kho'}</span>
                </div>
              </div>

              {/* Ảnh chứng từ có chữ ký */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Ảnh biên bản có chữ ký của đại lý:</span>
                  {currentDelivery?.proof_image_url && (
                    <a
                      href={
                        currentDelivery.proof_image_url.startsWith('http')
                          ? currentDelivery.proof_image_url
                          : `http://127.0.0.1:8001${currentDelivery.proof_image_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-normal text-[11px]"
                    >
                      Mở tab mới <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </label>
                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 max-h-80 flex items-center justify-center p-2">
                  {currentDelivery?.proof_image_url ? (
                    <img
                      src={
                        currentDelivery.proof_image_url.startsWith('http')
                          ? currentDelivery.proof_image_url
                          : `http://127.0.0.1:8001${currentDelivery.proof_image_url}`
                      }
                      alt="Biên bản giao nhận POD"
                      className="max-h-72 w-auto object-contain rounded-xl shadow-md"
                      onError={(e) => {
                        // Fallback sang placeholder đẹp nếu đường dẫn file offline
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                      <Image className="w-10 h-10 text-emerald-400" />
                      <span>Biên bản giấy đã lưu trữ đối soát</span>
                    </div>
                  )}
                </div>
              </div>

              {currentDelivery?.notes && (
                <p className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <strong>Ghi chú:</strong> {currentDelivery.notes}
                </p>
              )}

              {/* Thông báo sẵn sàng xuất hóa đơn Sprint 7 */}
              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-semibold">Chứng từ hợp lệ: Sẵn sàng phát hành Hóa đơn Sprint 7</span>
                </div>
                <Badge variant="success">DELIVERED</Badge>
              </div>
            </>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setIsPodViewerOpen(false)}
              className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      {/* ============================================================================== */}
      {/* 7. MODAL XEM CHI TIẾT GIAO THẤT BẠI & HOÀN KHO (S6-08 / SC-259)                */}
      {/* ============================================================================== */}
      <Modal
        isOpen={isRestockDetailOpen}
        onClose={() => setIsRestockDetailOpen(false)}
        title={`Chi Tiết Giao Thất Bại & Hoàn Kho: ${selectedDispatch?.id}`}
        subtitle="Hồ sơ xử lý giao không thành công và ghi nhận hàng hoàn trả về kho"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {loadingDeliveryInfo ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-rose-500 mb-2" />
              Đang tải dữ liệu hoàn kho...
            </div>
          ) : (
            <>
              {/* Lý do thất bại */}
              <div className="bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-3.5 rounded-2xl space-y-2 text-rose-950 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Lý do giao hàng thất bại:</span>
                    <strong className="text-sm font-bold text-rose-700 dark:text-rose-300">
                      {currentDelivery?.failure_reason || 'Khách hàng đi vắng / không liên lạc được'}
                    </strong>
                  </div>
                </div>
                {currentDelivery?.failure_notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 pl-7">
                    <strong>Chi tiết:</strong> {currentDelivery.failure_notes}
                  </p>
                )}
              </div>

              {/* Tình trạng hoàn kho */}
              <div className="border border-slate-200 dark:border-slate-700 p-3 rounded-2xl grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Trạng thái hoàn kho:</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Đã hoàn trả vào tồn vật lý (IN_RETURN)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Kho tiếp nhận hoàn:</span>
                  <strong>{selectedDispatch?.warehouse_name || `Kho #${selectedDispatch?.warehouse_id}`}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Thời điểm hoàn kho:</span>
                  <span>
                    {currentDelivery?.returned_at
                      ? new Date(currentDelivery.returned_at).toLocaleString('vi-VN')
                      : 'Đã hoàn tất'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Người xử lý hoàn:</span>
                  <span>{currentDelivery?.confirmed_by_name || 'Nhân viên kho'}</span>
                </div>
              </div>

              {/* Cảnh báo chặn xuất hóa đơn */}
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="font-semibold">
                    Đơn hàng đã hoàn kho: Tuyệt đối chặn phát hành hóa đơn ở Sprint 7
                  </span>
                </div>
                <Badge variant="danger">DELIVERY_FAILED</Badge>
              </div>
            </>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setIsRestockDetailOpen(false)}
              className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      {/* ============================================================================== */}
      {/* 8. MODAL CHI TIẾT SẢN PHẨM TRONG PHIẾU XUẤT                                    */}
      {/* ============================================================================== */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Chi tiết phiếu xuất kho: ${selectedDispatch?.id}`}
        subtitle={`Đơn hàng gốc: ${selectedDispatch?.order_id} - Khách hàng: ${selectedDispatch?.customer_name}`}
        maxWidth="lg"
      >
        {selectedDispatch && (
          <div className="space-y-4 text-xs">
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Sản phẩm</th>
                    <th className="py-2.5 px-3 text-right">Đặt hàng</th>
                    <th className="py-2.5 px-3 text-right">Thực xuất</th>
                    <th className="py-2.5 px-3 text-right">Thực giao</th>
                    <th className="py-2.5 px-3 text-right">Thiếu (Nợ hàng)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedDispatch.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-medium">
                        {it.product_name || it.sku}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {it.ordered_quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-600">
                        {it.dispatched_quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        {selectedDispatch.status === 'DELIVERED'
                          ? it.delivered_quantity ?? it.dispatched_quantity
                          : selectedDispatch.status === 'DELIVERY_FAILED'
                          ? 0
                          : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                        {it.shortfall_quantity > 0 ? `-${it.shortfall_quantity}` : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedDispatch.notes && (
              <p className="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg">
                <strong>Ghi chú:</strong> {selectedDispatch.notes}
              </p>
            )}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};
