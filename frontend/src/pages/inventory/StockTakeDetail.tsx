import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ClipboardCheck,
  ArrowLeft,
  Warehouse,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Save,
  Lock,
  Search,
  Filter,
  Printer,
  TrendingDown,
  TrendingUp,
  FileText,
  User,
  ShieldAlert,
  HelpCircle,
  RefreshCw,
  Plus,
  Minus,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { stockTakeService } from '../../services/stockTakeService';
import {
  StockTake,
  StockTakeItem,
  StockTakeStatus,
  StockTakeItemCountInput,
} from '../../types/StockTake';
import { formatNumber, formatDateTime } from '../../utils/formatters';

const STATUS_CONFIG: Record<
  StockTakeStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'Bản nháp',
    bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    icon: <Clock className="w-4 h-4" />,
  },
  in_progress: {
    label: 'Đang kiểm đếm',
    bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <Clock className="w-4 h-4 animate-spin" />,
  },
  completed: {
    label: 'Đã chốt kiểm kê',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  cancelled: {
    label: 'Đã hủy',
    bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <XCircle className="w-4 h-4" />,
  },
};

export const StockTakeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [stockTake, setStockTake] = useState<StockTake | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCounts, setSavingCounts] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);

  // Trạng thái cục bộ khi người dùng đang nhập số đếm (map theo itemId)
  const [countsMap, setCountsMap] = useState<
    Record<number, { actual: number | string; note: string; touched: boolean }>
  >({});

  // Lọc hiển thị mặt hàng
  const [search, setSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<
    'all' | 'discrepancy' | 'uncounted' | 'counted'
  >('all');

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');
  const [adjustmentReasonError, setAdjustmentReasonError] = useState<string>('');

  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Kiểm tra quyền Quản lý kho (SCRUM-585)
  const isWarehouseManager = useMemo(() => {
    if (role === 'WarehouseManager' || role === 'Admin' || role === 'Director' || role === 'Manager') {
      return true;
    }
    const roleLower = (user?.role || '').toLowerCase();
    return (
      roleLower.includes('wh manager') ||
      roleLower.includes('wh_manager') ||
      roleLower.includes('quản lý kho') ||
      roleLower.includes('admin')
    );
  }, [role, user]);

  const fetchDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await stockTakeService.getStockTakeById(id);
      setStockTake(data);

      // Khởi tạo map đếm
      const initialMap: Record<
        number,
        { actual: number | string; note: string; touched: boolean }
      > = {};
      data.items.forEach((it) => {
        initialMap[it.id] = {
          actual: it.actual_quantity !== null && it.actual_quantity !== undefined ? it.actual_quantity : '',
          note: it.note || '',
          touched: it.is_counted,
        };
      });
      setCountsMap(initialMap);
    } catch (err: any) {
      showToast(err.message || 'Không thể tải thông tin phiếu kiểm kê', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const isReadOnly =
    stockTake?.status === 'completed' || stockTake?.status === 'cancelled';

  // Xử lý thay đổi số đếm thực tế (SCRUM-587)
  const handleActualChange = (itemId: number, value: string) => {
    if (isReadOnly) return;
    setCountsMap((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        actual: value === '' ? '' : Math.max(0, parseInt(value, 10) || 0),
        touched: true,
      },
    }));
  };

  const handleQuickStep = (itemId: number, delta: number) => {
    if (isReadOnly) return;
    setCountsMap((prev) => {
      const current = prev[itemId]?.actual;
      const num = current === '' || current === undefined ? 0 : Number(current);
      const nextVal = Math.max(0, num + delta);
      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          actual: nextVal,
          touched: true,
        },
      };
    });
  };

  const handleMatchSystem = (itemId: number, systemQty: number) => {
    if (isReadOnly) return;
    setCountsMap((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        actual: systemQty,
        touched: true,
      },
    }));
  };

  const handleMatchAllUncounted = () => {
    if (isReadOnly || !stockTake) return;
    setCountsMap((prev) => {
      const nextMap = { ...prev };
      stockTake.items.forEach((it) => {
        if (!nextMap[it.id]?.touched || nextMap[it.id]?.actual === '') {
          nextMap[it.id] = {
            actual: it.system_quantity,
            note: nextMap[it.id]?.note || '',
            touched: true,
          };
        }
      });
      return nextMap;
    });
    showToast('Đã điền số thực đếm bằng tồn sổ cho các mặt hàng chưa kiểm đếm.', 'info');
  };

  const handleNoteChange = (itemId: number, note: string) => {
    if (isReadOnly) return;
    setCountsMap((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        note,
      },
    }));
  };

  // Tính toán thống kê theo thời gian thực từ state countsMap
  const computedSummary = useMemo(() => {
    if (!stockTake)
      return {
        totalSystem: 0,
        totalActual: 0,
        totalDiff: 0,
        countedCount: 0,
        hasDiscrepancy: false,
        discrepancyItemsCount: 0,
      };

    let totalSystem = 0;
    let totalActual = 0;
    let countedCount = 0;
    let discrepancyItemsCount = 0;

    stockTake.items.forEach((it) => {
      totalSystem += it.system_quantity;
      const row = countsMap[it.id];
      const actualVal =
        row && row.actual !== '' ? Number(row.actual) : it.actual_quantity;

      if (actualVal !== null && actualVal !== undefined) {
        totalActual += actualVal;
        countedCount += 1;
        if (actualVal !== it.system_quantity) {
          discrepancyItemsCount += 1;
        }
      }
    });

    const totalDiff = totalActual - totalSystem;
    const hasDiscrepancy = discrepancyItemsCount > 0;

    return {
      totalSystem,
      totalActual,
      totalDiff,
      countedCount,
      hasDiscrepancy,
      discrepancyItemsCount,
    };
  }, [stockTake, countsMap]);

  // Lưu tạm số đếm
  const handleSaveCounts = async () => {
    if (!id || !stockTake || isReadOnly) return;

    try {
      setSavingCounts(true);
      const itemsPayload: StockTakeItemCountInput[] = [];

      stockTake.items.forEach((it) => {
        const row = countsMap[it.id];
        if (row && row.actual !== '') {
          itemsPayload.push({
            id: it.id,
            actual_quantity: Number(row.actual),
            note: row.note || undefined,
          });
        }
      });

      if (itemsPayload.length === 0) {
        showToast('Chưa có dòng nào được nhập số đếm.', 'warning');
        return;
      }

      const updated = await stockTakeService.updateCountedItems(id, {
        items: itemsPayload,
      });
      setStockTake(updated);
      showToast('Đã lưu số đếm thực tế thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu số đếm', 'error');
    } finally {
      setSavingCounts(false);
    }
  };

  // Mở modal chốt kiểm kê: tự động lưu số đếm trước rồi mở modal
  const handleOpenConfirmModal = async () => {
    if (!isWarehouseManager) {
      showToast('Chỉ Quản lý kho hoặc Quản trị viên mới có quyền chốt phiếu kiểm kê.', 'error');
      return;
    }
    if (!id || !stockTake) return;

    // Tự động lưu số đếm thực tế trước khi hiển thị modal chốt
    try {
      setSavingCounts(true);
      const itemsPayload: StockTakeItemCountInput[] = [];
      stockTake.items.forEach((it) => {
        const row = countsMap[it.id];
        if (row && row.actual !== '') {
          itemsPayload.push({
            id: it.id,
            actual_quantity: Number(row.actual),
            note: row.note || undefined,
          });
        }
      });

      if (itemsPayload.length > 0) {
        const updated = await stockTakeService.updateCountedItems(id, {
          items: itemsPayload,
        });
        setStockTake(updated);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu số đếm trước khi chốt', 'error');
      return;
    } finally {
      setSavingCounts(false);
    }

    setAdjustmentReasonError('');
    setShowConfirmModal(true);
  };

  // Xác nhận chốt kiểm kê (SCRUM-583, SCRUM-584, SCRUM-585)
  const handleConfirmStockTake = async () => {
    if (!id) return;

    // Trước khi chốt, tự động lưu lại các số đếm chưa lưu nếu có
    if (computedSummary.hasDiscrepancy && !adjustmentReason.trim()) {
      setAdjustmentReasonError(
        'Bắt buộc phải nhập lý do điều chỉnh khi có chênh lệch tồn kho.'
      );
      return;
    }

    try {
      setConfirming(true);

      // Lưu lại số đếm trước
      const itemsPayload: StockTakeItemCountInput[] = [];
      stockTake?.items.forEach((it) => {
        const row = countsMap[it.id];
        if (row && row.actual !== '') {
          itemsPayload.push({
            id: it.id,
            actual_quantity: Number(row.actual),
            note: row.note || undefined,
          });
        }
      });
      if (itemsPayload.length > 0) {
        await stockTakeService.updateCountedItems(id, { items: itemsPayload });
      }

      // Thực hiện chốt kiểm kê
      const completedTake = await stockTakeService.confirmStockTake(id, {
        adjustment_reason: adjustmentReason.trim() || undefined,
      });

      setStockTake(completedTake);
      setShowConfirmModal(false);
      showToast(`Đã chốt kiểm kê ${completedTake.code} và cân bằng tồn kho thành công!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi chốt phiếu kiểm kê', 'error');
    } finally {
      setConfirming(false);
    }
  };

  // Hủy phiếu kiểm kê
  const handleCancelStockTake = async () => {
    if (!id) return;
    try {
      const cancelledTake = await stockTakeService.cancelStockTake(id, {
        cancel_reason: cancelReason.trim() || undefined,
      });
      setStockTake(cancelledTake);
      setShowCancelModal(false);
      showToast(`Đã hủy phiếu kiểm kê ${cancelledTake.code}.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi hủy phiếu kiểm kê', 'error');
    }
  };

  // Danh sách dòng sản phẩm đã lọc
  const filteredItems = useMemo(() => {
    if (!stockTake) return [];
    return stockTake.items.filter((it) => {
      const matchSearch =
        !search ||
        it.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (it.sku && it.sku.toLowerCase().includes(search.toLowerCase())) ||
        (it.category_name && it.category_name.toLowerCase().includes(search.toLowerCase()));

      const row = countsMap[it.id];
      const hasCount = row && row.actual !== '';
      const actualVal = hasCount ? Number(row.actual) : it.actual_quantity;
      const isDiff =
        actualVal !== null &&
        actualVal !== undefined &&
        actualVal !== it.system_quantity;

      if (filterMode === 'discrepancy') return matchSearch && isDiff;
      if (filterMode === 'uncounted') return matchSearch && !hasCount;
      if (filterMode === 'counted') return matchSearch && hasCount;
      return matchSearch;
    });
  }, [stockTake, countsMap, search, filterMode]);

  // Phân trang danh sách dòng hàng: 8 bản ghi trên 1 trang
  const ITEMS_PER_PAGE = 8;
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterMode]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (validCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, validCurrentPage]);

  if (loading) {
    return (
      <PageContainer title="Chi Tiết Kiểm Kê Kho">
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm">Đang tải chi tiết phiếu kiểm kê...</p>
        </div>
      </PageContainer>
    );
  }

  if (!stockTake) {
    return (
      <PageContainer title="Chi Tiết Kiểm Kê Kho">
        <div className="py-20 text-center text-slate-500">
          <p>Không tìm thấy phiếu kiểm kê.</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => navigate('/inventory/stock-takes')}
          >
            Quay lại danh sách
          </Button>
        </div>
      </PageContainer>
    );
  }

  const statusInfo = STATUS_CONFIG[stockTake.status] || STATUS_CONFIG.draft;

  return (
    <PageContainer
      title="Phiếu Kiểm Kê"
      subtitle={`Kho: ${stockTake.warehouse} • Trạng thái: ${statusInfo.label}`}
    >
      <div className="space-y-6 pb-16">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Link
              to="/inventory/stock-takes"
              className="hover:text-teal-600 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Kiểm kê kho hàng
            </Link>
            <span>/</span>
            <span className="text-slate-900 dark:text-white font-medium">
              Phiếu kiểm kê
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              In Phiếu
            </button>
          </div>
        </div>

        {/* Header Title & Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {stockTake.code}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.bg}`}
              >
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-3">
              <span>
                Kho: <strong>{stockTake.warehouse}</strong>
              </span>
              <span>•</span>
              <span>
                Phạm vi:{' '}
                <strong>
                  {stockTake.scope_type === 'CATEGORY'
                    ? `Nhóm: ${stockTake.category_name || 'Đã chọn'}`
                    : stockTake.scope_type === 'CUSTOM'
                    ? 'Tùy chọn'
                    : 'Toàn kho'}
                </strong>
              </span>
              <span>•</span>
              <span>
                Tạo bởi: <strong>{stockTake.created_by_name || 'Thủ kho'}</strong>
              </span>
            </p>
          </div>

          {/* Action Button Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!isReadOnly && (
              <Button
                variant="secondary"
                onClick={() => setShowCancelModal(true)}
                className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Hủy Phiếu
              </Button>
            )}

            {stockTake.status === 'completed' && (
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Đã chốt bởi <strong>{stockTake.confirmed_by_name}</strong> lúc{' '}
                  {formatDateTime(stockTake.confirmed_at)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quyền kiểm tra warning nếu người dùng không phải Quản lý kho */}
        {!isReadOnly && !isWarehouseManager && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3.5 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                <strong>Phân quyền nghiệp vụ:</strong> Bạn đang đăng nhập với vai trò <strong>{user?.role || role}</strong>. Bạn có thể nhập và lưu số đếm thực tế, nhưng chỉ <strong>Quản lý kho</strong> hoặc <strong>Quản trị viên</strong> mới được phép chốt phiếu điều chỉnh tồn.
              </span>
            </div>
          </div>
        )}

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <span className="text-xs font-medium text-slate-500">Tiến Độ Kiểm Đếm</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {computedSummary.countedCount}/{stockTake.total_items}
              </span>
              <span className="text-xs text-slate-500">mặt hàng</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-teal-500 h-full transition-all duration-300"
                style={{
                  width: `${(computedSummary.countedCount / (stockTake.total_items || 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <span className="text-xs font-medium text-slate-500">Tổng Tồn Sổ Sách</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatNumber(computedSummary.totalSystem)}
              </span>
              <span className="text-xs text-slate-500">cái (Snapshot)</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Đóng băng lúc lập phiếu
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <span className="text-xs font-medium text-slate-500">Tổng Số Thực Đếm</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatNumber(computedSummary.totalActual)}
              </span>
              <span className="text-xs text-slate-500">cái</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Theo dữ liệu kiểm đếm
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <span className="text-xs font-medium text-slate-500">Tổng Chênh Lệch</span>
            <div className="mt-1 flex items-baseline gap-2">
              {computedSummary.totalDiff === 0 ? (
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  0
                </span>
              ) : computedSummary.totalDiff > 0 ? (
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <TrendingUp className="w-5 h-5" />
                  +{formatNumber(computedSummary.totalDiff)}
                </span>
              ) : (
                <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-5 h-5" />
                  {formatNumber(computedSummary.totalDiff)}
                </span>
              )}
              <span className="text-xs text-slate-500">cái</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {computedSummary.discrepancyItemsCount} mặt hàng có chênh lệch
            </p>
          </div>
        </div>

        {/* Lý do điều chỉnh (khi đã chốt hoặc ghi chú) */}
        {stockTake.adjustment_reason && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 p-4 rounded-xl text-xs space-y-1">
            <div className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              Lý Do Điều Chỉnh Khi Chốt Kiểm Kê:
            </div>
            <p className="text-blue-800 dark:text-blue-200 italic pl-5">
              "{stockTake.adjustment_reason}"
            </p>
          </div>
        )}

        {/* Toolbar & Filter */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã SKU, tên sản phẩm, nhóm hàng..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                Tất cả ({stockTake.total_items})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('discrepancy')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  filterMode === 'discrepancy'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                Có chênh lệch ({computedSummary.discrepancyItemsCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('uncounted')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  filterMode === 'uncounted'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                Chưa đếm ({stockTake.total_items - computedSummary.countedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('counted')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  filterMode === 'counted'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                Đã đếm ({computedSummary.countedCount})
              </button>
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={handleMatchAllUncounted}
                className="px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                title="Tự động điền số thực đếm bằng tồn sổ cho các dòng chưa đếm"
              >
                Điền nhanh = Tồn sổ
              </button>
            )}
          </div>
        </div>

        {/* Bảng nhập số đếm thực tế (SCRUM-587) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 font-semibold text-center w-12">STT</th>
                  <th className="py-3 px-3 font-semibold">Mã SKU</th>
                  <th className="py-3 px-3 font-semibold">Tên Sản Phẩm</th>
                  <th className="py-3 px-3 font-semibold">Nhóm Ngành</th>
                  <th className="py-3 px-3 font-semibold text-center w-16">ĐVT</th>
                  <th className="py-3 px-3 font-semibold text-right w-24">Tồn Sổ</th>
                  <th className="py-3 px-4 font-semibold text-center w-48">
                    Số Thực Đếm
                  </th>
                  <th className="py-3 px-4 font-semibold text-center w-36">Chênh Lệch</th>
                  <th className="py-3 px-3 font-semibold">Ghi Chú Dòng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Không có mặt hàng nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, index) => {
                    const row = countsMap[item.id] || {
                      actual: '',
                      note: '',
                      touched: false,
                    };
                    const isCounted = row.actual !== '';
                    const actualQty = isCounted ? Number(row.actual) : null;
                    const diff =
                      actualQty !== null ? actualQty - item.system_quantity : null;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          diff !== null && diff !== 0
                            ? 'bg-amber-50/30 dark:bg-amber-950/10'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center text-slate-400">
                          {(validCurrentPage - 1) * ITEMS_PER_PAGE + index + 1}
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                          {item.sku || 'N/A'}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">
                          {item.product_name}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {item.category_name || '-'}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-500">
                          {item.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-700 dark:text-slate-200">
                          {formatNumber(item.system_quantity)}
                        </td>

                        {/* Ô nhập số thực đếm với nút tăng giảm */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleQuickStep(item.id, -1)}
                                className="w-7 h-7 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                                title="Giảm 1"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            )}

                            <input
                              type="number"
                              min={0}
                              value={row.actual}
                              onChange={(e) =>
                                handleActualChange(item.id, e.target.value)
                              }
                              disabled={isReadOnly}
                              placeholder="Nhập..."
                              className={`w-20 text-center font-bold text-sm py-1 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
                                isReadOnly
                                  ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-transparent'
                                  : diff !== null && diff !== 0
                                  ? 'border-amber-400 bg-amber-50/50 text-slate-900'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                              }`}
                            />

                            {!isReadOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleQuickStep(item.id, 1)}
                                  className="w-7 h-7 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                                  title="Tăng 1"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMatchSystem(item.id, item.system_quantity)
                                  }
                                  className="px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded"
                                  title="Gán bằng tồn sổ"
                                >
                                  Khớp
                                </button>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Cột hiển thị chênh lệch (SCRUM-587) */}
                        <td className="py-3 px-4 text-center">
                          {diff === null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800">
                              Chưa đếm
                            </span>
                          ) : diff === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Khớp (0)
                            </span>
                          ) : diff > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                              <TrendingUp className="w-3 h-3" />
                              +{formatNumber(diff)} (Thừa)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300">
                              <AlertTriangle className="w-3 h-3 text-rose-500" />
                              {formatNumber(diff)} (Thiếu)
                            </span>
                          )}
                        </td>

                        {/* Ghi chú từng dòng */}
                        <td className="py-3 px-3">
                          {isReadOnly ? (
                            <span className="text-slate-500 italic">
                              {row.note || '-'}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) =>
                                handleNoteChange(item.id, e.target.value)
                              }
                              placeholder="Ghi chú hao hụt / lý do..."
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 dark:text-white"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Thanh phân trang 8 bản ghi / trang */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="text-slate-500 dark:text-slate-400">
                Hiển thị{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  {(validCurrentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(validCurrentPage * ITEMS_PER_PAGE, filteredItems.length)}
                </strong>{' '}
                trên tổng số{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  {filteredItems.length}
                </strong>{' '}
                dòng hàng
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Trước
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                      pageNum === validCurrentPage
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1 transition-colors"
                >
                  Sau
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Floating Bar when in progress */}
        {!isReadOnly && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg sticky bottom-4 z-20">
            <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-teal-600" />
              <span>
                Đã kiểm đếm <strong>{computedSummary.countedCount}</strong>/
                <strong>{stockTake.total_items}</strong> mặt hàng •{' '}
                {computedSummary.hasDiscrepancy ? (
                  <strong className="text-rose-600">
                    Phát hiện {computedSummary.discrepancyItemsCount} dòng chênh lệch
                  </strong>
                ) : (
                  <strong className="text-emerald-600">Khớp số 100%</strong>
                )}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleSaveCounts}
                disabled={savingCounts}
                className="text-xs"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {savingCounts ? 'Đang lưu...' : 'Lưu Tạm Số Đếm'}
              </Button>

              <Button
                variant="primary"
                onClick={handleOpenConfirmModal}
                disabled={!isWarehouseManager}
                className={`text-xs font-semibold ${
                  isWarehouseManager
                    ? 'bg-teal-600 hover:bg-teal-700 text-white'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Chốt Phiếu Kiểm Kê
              </Button>
            </div>
          </div>
        )}

        {/* Modal Chốt Kiểm Kê (SCRUM-584 & SCRUM-588) */}
        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="Xác Nhận Chốt Kiểm Kê & Cân Bằng Tồn Kho"
        >
          <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
            <div className="p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl space-y-1.5">
              <div className="font-semibold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-teal-600" />
                Đợt kiểm kê {stockTake.code}
              </div>
              <p className="text-xs text-teal-800 dark:text-teal-300">
                Kho: <strong>{stockTake.warehouse}</strong> • Tổng thực đếm:{' '}
                <strong>{formatNumber(computedSummary.totalActual)} cái</strong> (Lệch:{' '}
                <strong
                  className={
                    computedSummary.totalDiff === 0
                      ? 'text-emerald-600'
                      : computedSummary.totalDiff > 0
                      ? 'text-blue-600'
                      : 'text-rose-600'
                  }
                >
                  {computedSummary.totalDiff > 0 ? '+' : ''}
                  {formatNumber(computedSummary.totalDiff)} cái
                </strong>
                )
              </p>
            </div>

            {computedSummary.hasDiscrepancy ? (
              <div className="space-y-2">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    <strong>Cảnh báo nghiệp vụ:</strong> Phát hiện{' '}
                    <strong>{computedSummary.discrepancyItemsCount}</strong> mặt hàng có chênh lệch tồn.
                    Hệ thống <strong>bắt buộc</strong> bạn phải nhập lý do điều chỉnh trước khi chốt.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Lý do điều chỉnh kiểm kê <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={adjustmentReason}
                    onChange={(e) => {
                      setAdjustmentReason(e.target.value);
                      if (e.target.value.trim()) setAdjustmentReasonError('');
                    }}
                    placeholder="Nhập lý do chi tiết (ví dụ: Hao hụt tự nhiên do vận chuyển, hàng mẫu showroom chưa trừ sổ, thừa hàng đối tác tặng kèm...)"
                    className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-slate-900 dark:text-white"
                  />
                  {adjustmentReasonError && (
                    <p className="text-xs text-rose-500 font-medium">
                      {adjustmentReasonError}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  Tuyệt vời! Toàn bộ mặt hàng kiểm kê đều khớp 100% với số tồn sổ sách.
                </span>
              </div>
            )}

            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400">
              <strong>Hành động hệ thống sau khi chốt:</strong>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>Cập nhật số lượng tồn kho thực tế về đúng số thực đếm.</li>
                <li>Tự động ghi bản ghi điều chỉnh vào thẻ kho (Inventory History).</li>
                <li>Khóa vĩnh viễn phiếu kiểm kê, không thể chỉnh sửa thêm.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={confirming}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmStockTake}
                disabled={confirming}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium"
              >
                {confirming ? 'Đang xử lý...' : 'Xác Nhận Chốt & Cân Bằng Tồn'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal Hủy Phiếu */}
        <Modal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          title="Hủy Phiếu Kiểm Kê Kho"
        >
          <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Bạn có chắc chắn muốn hủy phiếu kiểm kê <strong>{stockTake.code}</strong> không?
              Thao tác này sẽ không làm thay đổi tồn kho hiện tại.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Lý do hủy phiếu</label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy phiếu..."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => setShowCancelModal(false)}
              >
                Đóng
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelStockTake}
              >
                Xác Nhận Hủy
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </PageContainer>
  );
};
