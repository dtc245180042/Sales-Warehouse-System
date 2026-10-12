import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ClipboardCheck,
  Plus,
  Search,
  Filter,
  Warehouse,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Eye,
  RefreshCw,
  FileSpreadsheet,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Boxes,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { stockTakeService } from '../../services/stockTakeService';
import { StockTake, StockTakeStatus } from '../../types/StockTake';
import { formatNumber, formatDateTime } from '../../utils/formatters';

const STATUS_CONFIG: Record<
  StockTakeStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'Bản nháp',
    bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  in_progress: {
    label: 'Đang kiểm đếm',
    bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <Clock className="w-3.5 h-3.5 animate-spin" />,
  },
  completed: {
    label: 'Đã chốt kiểm kê',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: 'Đã hủy',
    bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const isWarehouseMatch = (itemWh?: string, filterWh?: string): boolean => {
  if (!filterWh || filterWh === 'all') return true;
  if (!itemWh) return false;
  return itemWh.trim().toLowerCase() === filterWh.trim().toLowerCase();
};

const isStatusMatch = (itemStatus: string, filterStatus: string): boolean => {
  if (!filterStatus || filterStatus === 'all') return true;
  return itemStatus === filterStatus;
};

const isSearchMatch = (item: StockTake, rawSearch: string): boolean => {
  const q = rawSearch.trim().toLowerCase();
  if (!q) return true;

  if (item.code.toLowerCase().includes(q)) return true;
  if (item.warehouse && item.warehouse.toLowerCase().includes(q)) return true;
  if (item.note && item.note.toLowerCase().includes(q)) return true;
  if (item.created_by_name && item.created_by_name.toLowerCase().includes(q)) return true;
  if (item.confirmed_by_name && item.confirmed_by_name.toLowerCase().includes(q)) return true;
  if (item.category_name && item.category_name.toLowerCase().includes(q)) return true;

  if (item.items && Array.isArray(item.items)) {
    const matched = item.items.some(
      (it) =>
        (it.sku && it.sku.toLowerCase().includes(q)) ||
        (it.product_name && it.product_name.toLowerCase().includes(q))
    );
    if (matched) return true;
  }

  return false;
};

export const StockTakeList: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchStockTakes = async () => {
    try {
      setLoading(true);
      const data = await stockTakeService.getStockTakes();
      setStockTakes(data);
    } catch (err: any) {
      showToast(err.message || 'Không thể tải danh sách phiếu kiểm kê', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockTakes();
  }, []);

  // Lấy danh sách kho thực tế từ CSDL, không dùng dữ liệu mẫu
  const warehouseOptions = useMemo(() => {
    const fromData = Array.from(new Set(stockTakes.map((s) => s.warehouse).filter(Boolean)));
    return fromData.sort();
  }, [stockTakes]);

  const filteredTakes = useMemo(() => {
    return stockTakes.filter((item) => {
      const matchSearch = isSearchMatch(item, search);
      const matchWarehouse = isWarehouseMatch(item.warehouse, warehouseFilter);
      const matchStatus = isStatusMatch(item.status, statusFilter);
      return matchSearch && matchWarehouse && matchStatus;
    });
  }, [stockTakes, search, warehouseFilter, statusFilter]);

  const isFiltered = search.trim() !== '' || warehouseFilter !== 'all' || statusFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setWarehouseFilter('all');
    setStatusFilter('all');
  };

  // Phân trang danh sách phiếu: 8 bản ghi trên 1 trang
  const ITEMS_PER_PAGE = 8;
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, warehouseFilter, statusFilter]);

  const totalPages = Math.ceil(filteredTakes.length / ITEMS_PER_PAGE) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTakes = useMemo(() => {
    const start = (validCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredTakes.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTakes, validCurrentPage]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = stockTakes.length;
    const inProgress = stockTakes.filter(
      (s) => s.status === 'draft' || s.status === 'in_progress'
    ).length;
    const completed = stockTakes.filter((s) => s.status === 'completed').length;
    const withDiscrepancy = stockTakes.filter((s) => s.has_discrepancy).length;
    return { total, inProgress, completed, withDiscrepancy };
  }, [stockTakes]);

  return (
    <PageContainer
      title="Kiểm Kê Kho Hàng"
      subtitle="Quản lý các đợt kiểm kê, chốt snapshot tồn sổ và cân bằng chênh lệch kho"
      actions={
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStockTakes}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/inventory/stock-takes/create')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Lập Phiếu Kiểm Kê
          </Button>
        </div>
      }
    >
      <div className="space-y-6">

        {/* 4 KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Tổng Đợt Kiểm Kê
              </span>
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats.total}
              </span>
              <span className="text-xs text-slate-500">phiếu</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Đang Kiểm Đếm
              </span>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {stats.inProgress}
              </span>
              <span className="text-xs text-slate-500">chưa chốt</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Đã Chốt Hoàn Tất
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.completed}
              </span>
              <span className="text-xs text-slate-500">đã cân bằng</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Có Chênh Lệch Tồn
              </span>
              <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {stats.withDiscrepancy}
              </span>
              <span className="text-xs text-slate-500">đợt có lệch</span>
            </div>
          </div>
        </div>

        {/* Toolbar & Filter */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã phiếu, ghi chú, người tạo, kho..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-slate-900 dark:text-white font-medium"
            >
              <option value="all">Tất cả kho hàng</option>
              {warehouseOptions.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-slate-900 dark:text-white font-medium"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="in_progress">Đang kiểm đếm</option>
              <option value="draft">Bản nháp</option>
              <option value="completed">Đã chốt kiểm kê</option>
              <option value="cancelled">Đã hủy</option>
            </select>

            {isFiltered && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Đặt lại bộ lọc"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
                <span>Đặt lại</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter result feedback */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1 -mt-2">
          <div className="flex items-center gap-2">
            <span>
              Tìm thấy <strong className="text-teal-600 dark:text-teal-400 font-semibold">{filteredTakes.length}</strong> / {stockTakes.length} phiếu kiểm kê
            </span>
            {isFiltered && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                Đang áp dụng bộ lọc
              </span>
            )}
          </div>
          {isFiltered && (
            <button
              onClick={resetFilters}
              className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1 font-medium"
            >
              <X className="w-3 h-3" />
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Bảng danh sách phiếu */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-xs">
                <tr>
                  <th className="py-3 px-4 font-semibold">Mã Phiếu</th>
                  <th className="py-3 px-4 font-semibold">Kho Hàng</th>
                  <th className="py-3 px-4 font-semibold">Phạm Vi</th>
                  <th className="py-3 px-4 font-semibold">Trạng Thái</th>
                  <th className="py-3 px-4 font-semibold text-right">Dòng Hàng</th>
                  <th className="py-3 px-4 font-semibold text-right">Tồn Sổ</th>
                  <th className="py-3 px-4 font-semibold text-right">Thực Đếm</th>
                  <th className="py-3 px-4 font-semibold text-center">Chênh Lệch</th>
                  <th className="py-3 px-4 font-semibold">Người Lập</th>
                  <th className="py-3 px-4 font-semibold">Ngày Tạo</th>
                  <th className="py-3 px-4 font-semibold text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                        <span>Đang tải danh sách phiếu kiểm kê...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredTakes.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto text-slate-500">
                        {isFiltered ? (
                          <>
                            <Filter className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                            <p className="font-semibold text-slate-800 dark:text-slate-200">
                              Không tìm thấy phiếu kiểm kê phù hợp
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              Không có phiếu kiểm kê nào khớp với bộ lọc đang chọn.
                            </p>
                            <Button
                              variant="secondary"
                              className="mt-4"
                              onClick={resetFilters}
                            >
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                              Xóa bộ lọc để xem tất cả
                            </Button>
                          </>
                        ) : (
                          <>
                            <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                            <p className="font-semibold text-slate-800 dark:text-slate-200">
                              Chưa có phiếu kiểm kê nào
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              Hãy tạo phiếu kiểm kê mới để bắt đầu quy trình đối soát tồn kho.
                            </p>
                            <Button
                              variant="primary"
                              className="mt-4"
                              onClick={() => navigate('/inventory/stock-takes/create')}
                            >
                              <Plus className="w-4 h-4 mr-1.5" />
                              Lập Phiếu Ngay
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedTakes.map((take) => {
                    const statusInfo = STATUS_CONFIG[take.status] || STATUS_CONFIG.draft;
                    const diff = take.total_discrepancy_qty;

                    return (
                      <tr
                        key={take.id}
                        onClick={() => navigate(`/inventory/stock-takes/${take.code || take.id}`)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4 font-semibold text-teal-600 dark:text-teal-400">
                          {take.code}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                            <span>{take.warehouse}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {take.scope_type === 'CATEGORY' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              Nhóm: {take.category_name || 'Đã chọn'}
                            </span>
                          ) : take.scope_type === 'CUSTOM' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              Tùy chọn
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Toàn kho
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${statusInfo.bg}`}
                          >
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                          {formatNumber(take.total_items)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                          {formatNumber(take.total_system_qty)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-slate-900 dark:text-white">
                          {take.status === 'cancelled' ? (
                            <span className="text-slate-400 text-xs">-</span>
                          ) : take.status === 'draft' ? (
                            <span className="text-slate-400 text-xs italic">Chưa đếm</span>
                          ) : (
                            formatNumber(take.total_actual_qty)
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {take.status === 'draft' || take.status === 'cancelled' ? (
                            <span className="text-slate-400 text-xs">-</span>
                          ) : diff === 0 ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Khớp 100%
                            </span>
                          ) : diff > 0 ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <TrendingUp className="w-3 h-3" />
                              +{formatNumber(diff)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <TrendingDown className="w-3 h-3" />
                              {formatNumber(diff)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-xs">
                          {take.created_by_name || 'Thủ kho'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                          {formatDateTime(take.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/inventory/stock-takes/${take.code || take.id}`);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Xem
                          </button>
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
                  {Math.min(validCurrentPage * ITEMS_PER_PAGE, filteredTakes.length)}
                </strong>{' '}
                trên tổng số{' '}
                <strong className="text-slate-900 dark:text-white font-semibold">
                  {filteredTakes.length}
                </strong>{' '}
                phiếu kiểm kê
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
      </div>
    </PageContainer>
  );
};
