import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertOctagon,
  Plus,
  Search,
  Filter,
  Warehouse,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  RefreshCw,
  TrendingDown,
  Layers,
  Flame,
  CalendarX,
  FileQuestion,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { stockAdjustService } from '../../services/stockAdjustService';
import { StockAdjustVoucher, AdjustType, AdjustStatus } from '../../types/StockAdjust';
import { formatNumber } from '../../utils/formatters';

const TYPE_CONFIG: Record<
  AdjustType,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  damaged: {
    label: 'Hàng hỏng / Móp bể',
    bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400',
    text: 'text-orange-700 dark:text-orange-400',
    icon: <Flame className="w-3.5 h-3.5" />,
  },
  expired: {
    label: 'Hàng hết hạn',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <CalendarX className="w-3.5 h-3.5" />,
  },
  lost: {
    label: 'Hao hụt / Mất mát',
    bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <FileQuestion className="w-3.5 h-3.5" />,
  },
};

const STATUS_CONFIG: Record<
  AdjustStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Chờ duyệt',
    bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  approved: {
    label: 'Đã duyệt',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  rejected: {
    label: 'Từ chối',
    bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

export const StockAdjustList: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [vouchers, setVouchers] = useState<StockAdjustVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all');

  const canCreate = ['Admin', 'WarehouseManager', 'WarehouseStaff', 'Director', 'Manager'].includes(
    role || ''
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await stockAdjustService.getAll();
      setVouchers(data);
    } catch {
      showToast('Không thể tải danh sách phiếu điều chỉnh', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const warehouses = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.warehouse) set.add(v.warehouse);
    });
    return Array.from(set);
  }, [vouchers]);

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      if (filterType !== 'all' && v.adjustType !== filterType) return false;
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;
      if (filterWarehouse !== 'all' && v.warehouse !== filterWarehouse) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchCode = v.code.toLowerCase().includes(q);
        const matchCreator = v.createdByName.toLowerCase().includes(q);
        const matchReason = v.reason.toLowerCase().includes(q);
        const matchProduct = v.items?.some((it) =>
          it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        );
        if (!matchCode && !matchCreator && !matchReason && !matchProduct) return false;
      }
      return true;
    });
  }, [vouchers, filterType, filterStatus, filterWarehouse, search]);

  const stats = useMemo(() => {
    const total = vouchers.length;
    const pending = vouchers.filter((v) => v.status === 'pending').length;
    const approved = vouchers.filter((v) => v.status === 'approved').length;
    const totalLoss = vouchers
      .filter((v) => v.status === 'approved')
      .reduce((sum, v) => sum + (v.totalLossValue || 0), 0);
    return { total, pending, approved, totalLoss };
  }, [vouchers]);

  return (
    <PageContainer
      title="Điều chỉnh tồn kho"
      description="Quản lý và lập phiếu xử lý hàng hỏng, mất mát, hết hạn sử dụng (SCRUM-274)"
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Làm mới
          </Button>
          {canCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/inventory/adjustments/create')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Lập phiếu điều chỉnh
            </Button>
          )}
        </div>
      }
    >
      {/* 4 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Tổng phiếu</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {stats.total}
          </div>
          <div className="mt-1 text-xs text-slate-500">Toàn bộ phiếu trên hệ thống</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Chờ duyệt</span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {stats.pending}
          </div>
          <div className="mt-1 text-xs text-slate-500">Cần Quản lý kho xem xét</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Đã duyệt</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.approved}
          </div>
          <div className="mt-1 text-xs text-slate-500">Đã trừ tồn kho thực tế</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Tổn thất đã duyệt</span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-rose-600 dark:text-rose-400">
            {formatNumber(stats.totalLoss)} đ
          </div>
          <div className="mt-1 text-xs text-slate-500">Giá trị hao hụt ghi nhận</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã phiếu, người lập, lý do, sản phẩm..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Loại điều chỉnh */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Lọc theo loại điều chỉnh"
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="all">Tất cả loại ĐC</option>
              <option value="damaged">Hàng hỏng / Móp bể</option>
              <option value="expired">Hàng hết hạn</option>
              <option value="lost">Hao hụt / Mất mát</option>
            </select>

            {/* Trạng thái */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Lọc theo trạng thái"
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>

            {/* Kho hàng */}
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              aria-label="Lọc theo kho hàng"
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="all">Tất cả kho hàng</option>
              {warehouses.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Mã phiếu</th>
                <th className="px-4 py-3.5">Loại điều chỉnh</th>
                <th className="px-4 py-3.5">Kho hàng</th>
                <th className="px-4 py-3.5">Ngày lập</th>
                <th className="px-4 py-3.5">Người lập</th>
                <th className="px-4 py-3.5 text-center">SL giảm</th>
                <th className="px-4 py-3.5 text-right">Tổng tổn thất</th>
                <th className="px-4 py-3.5 text-center">Trạng thái</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-500" />
                    Đang tải danh sách phiếu điều chỉnh...
                  </td>
                </tr>
              ) : filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <AlertOctagon className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Không tìm thấy phiếu điều chỉnh nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((v) => {
                  const typeCfg = TYPE_CONFIG[v.adjustType] || TYPE_CONFIG.damaged;
                  const statusCfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.pending;
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-semibold text-primary-600 dark:text-primary-400">
                        <Link
                          to={`/inventory/adjustments/${v.id}`}
                          className="hover:underline flex items-center gap-1.5"
                        >
                          {v.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${typeCfg.bg}`}
                        >
                          {typeCfg.icon}
                          {typeCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                          <span>{v.warehouse}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                        {v.adjustDate}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {v.createdByName}
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-slate-800 dark:text-slate-200">
                        {formatNumber(v.totalLossQty)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-rose-600 dark:text-rose-400">
                        {formatNumber(v.totalLossValue)} đ
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg}`}
                        >
                          {statusCfg.icon}
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/inventory/adjustments/${v.id}`)}
                          leftIcon={<Eye className="w-4 h-4" />}
                        >
                          Chi tiết
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
};
