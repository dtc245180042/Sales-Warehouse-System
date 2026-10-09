import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tag,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Copy,
  Clock,
  Calendar,
  Layers,
  Trash2,
  Eye,
  Edit,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatDate } from '../../utils/formatters';
import {
  PriceList,
  priceListService,
  CUSTOMER_GROUPS,
  CustomerGroupSummaryItem,
} from '../../services/priceListService';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';

// Modular Subcomponents
import { PriceListFormModal } from '../../components/sales/PriceListFormModal';
import { CloneVersionModal } from '../../components/sales/CloneVersionModal';
import { PriceListDetailModal } from '../../components/sales/PriceListDetailModal';
import { PriceListApproveModal } from '../../components/sales/PriceListApproveModal';
import { LockedPriceListAlertModal } from '../../components/sales/LockedPriceListAlertModal';

export const PriceListManagement: React.FC = () => {
  const { role } = useAuth();
  const { showToast } = useToast();

  // Data states
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [groupSummaries, setGroupSummaries] = useState<CustomerGroupSummaryItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTimeStatus, setSelectedTimeStatus] = useState<string>('all');
  const [selectedLockStatus, setSelectedLockStatus] = useState<string>('all');

  // Modal control states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isLockedAlertModalOpen, setIsLockedAlertModalOpen] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null);

  // Thẩm quyền theo Ma trận Sheet 2 User Roles
  const canApprove = ['Admin', 'SalesManager', 'Director'].includes(role);
  const canManagePriceList = ['Admin', 'SalesManager', 'Director'].includes(role);

  // Total pending count for quick badge alert
  const totalPendingCount = useMemo(() => {
    return groupSummaries.reduce((acc, curr) => acc + (curr.pending_approval_count || 0), 0);
  }, [groupSummaries]);

  // Fetch group summaries
  const fetchGroupSummary = useCallback(async () => {
    try {
      const res = await priceListService.getGroupSummary();
      setGroupSummaries(res.items || []);
    } catch (err) {
      console.error('Failed to load group summary:', err);
    }
  }, []);

  // Fetch paginated price lists
  const fetchPriceLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await priceListService.getAll({
        customer_group: selectedGroup !== 'all' ? selectedGroup : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        time_status: selectedTimeStatus !== 'all' ? selectedTimeStatus : undefined,
        is_locked:
          selectedLockStatus === 'locked'
            ? true
            : selectedLockStatus === 'unlocked'
              ? false
              : undefined,
        search: search.trim() || undefined,
        page: page,
        page_size: pageSize,
      });

      setPriceLists(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (err: any) {
      console.error('Failed to load price lists:', err);
      showToast('Không thể tải danh sách bảng giá', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, selectedStatus, selectedTimeStatus, selectedLockStatus, search, page, pageSize, showToast]);

  useEffect(() => {
    fetchGroupSummary();
  }, [fetchGroupSummary]);

  useEffect(() => {
    fetchPriceLists();
  }, [fetchPriceLists]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const prods = await productService.getAll();
        setAvailableProducts(prods || []);
      } catch (err) {
        console.error('Failed to load products', err);
      }
    };
    loadProducts();
  }, []);

  const handleRefresh = () => {
    fetchPriceLists();
    fetchGroupSummary();
    showToast('Đã làm mới dữ liệu', 'info');
  };

  const handleResetFilters = () => {
    setSelectedGroup('all');
    setSelectedStatus('all');
    setSelectedTimeStatus('all');
    setSelectedLockStatus('all');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters =
    selectedGroup !== 'all' ||
    selectedStatus !== 'all' ||
    selectedTimeStatus !== 'all' ||
    selectedLockStatus !== 'all' ||
    Boolean(search.trim());

  // Modal Openers
  const handleOpenCreateModal = () => {
    setSelectedPriceList(null);
    setFormMode('create');
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = async (pl: PriceList) => {
    if (pl.has_orders || pl.is_locked) {
      setSelectedPriceList(pl);
      setIsLockedAlertModalOpen(true);
      return;
    }

    try {
      const fullDetail = await priceListService.getById(pl.id);
      setSelectedPriceList(fullDetail);
      setFormMode('edit');
      setIsFormModalOpen(true);
    } catch (err) {
      showToast('Không thể tải thông tin bảng giá', 'error');
    }
  };

  const handleOpenCloneModal = (pl: PriceList) => {
    setSelectedPriceList(pl);
    setIsCloneModalOpen(true);
  };

  const handleViewDetail = async (id: number) => {
    try {
      const detail = await priceListService.getById(id);
      setSelectedPriceList(detail);
      setIsDetailModalOpen(true);
    } catch (err) {
      showToast('Không thể tải chi tiết bảng giá', 'error');
    }
  };

  const handleOpenApproveModal = (pl: PriceList) => {
    setSelectedPriceList(pl);
    setIsApproveModalOpen(true);
  };

  const handleDelete = async (pl: PriceList) => {
    if (pl.has_orders || pl.is_locked) {
      showToast(`Bảng giá "${pl.code}" đã phát sinh đơn hàng, không thể xóa!`, 'error');
      return;
    }

    if (!window.confirm(`Xóa bảng giá "${pl.name}" (${pl.code})? Thao tác không thể hoàn tác!`)) {
      return;
    }

    try {
      await priceListService.delete(pl.id);
      showToast(`Đã xóa bảng giá "${pl.code}" thành công!`, 'success');
      fetchPriceLists();
      fetchGroupSummary();
    } catch (err: any) {
      const msg = err.data?.detail || err.message || 'Lỗi khi xóa bảng giá';
      showToast(msg, 'error');
    }
  };

  const handleSimulateOrder = async (id: number) => {
    try {
      await priceListService.simulateOrder(id);
      showToast('Đã mô phỏng phát sinh đơn hàng (Đã kích hoạt khóa sửa đổi)', 'info');
      fetchPriceLists();
      fetchGroupSummary();
      if (selectedPriceList && selectedPriceList.id === id) {
        handleViewDetail(id);
      }
    } catch (err: any) {
      showToast('Lỗi mô phỏng đơn hàng', 'error');
    }
  };

  return (
    <PageContainer
      title="Bảng Giá Phân Phối"
      subtitle="Quản lý giá theo nhóm đại lý & thời hạn"
    >
      {/* 1. COMPACT TOP CONTROLS: Segmented Customer Group Tabs + Actions in ONE sleek bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-2.5 shadow-soft mb-3.5 space-y-2.5">
        {/* Row 1: Groups Pill Strip + Pending Alert + Create Action */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Group Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => {
                setSelectedGroup('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${selectedGroup === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
            >
              <Users className="w-3.5 h-3.5" />
              Tất cả nhóm
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedGroup === 'all' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {total}
              </span>
            </button>

            {CUSTOMER_GROUPS.map((g) => {
              const summary = groupSummaries.find((s) => s.customer_group === g.value);
              const isSelected = selectedGroup === g.value;
              const hasActive = summary?.has_active_price_list;
              const pendingInGroup = summary?.pending_approval_count || 0;

              return (
                <button
                  key={g.value}
                  onClick={() => {
                    setSelectedGroup(isSelected ? 'all' : g.value);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${isSelected
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  title={`${g.label}: ${summary?.total_price_lists || 0} bảng giá`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${hasActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  {g.label}
                  {pendingInGroup > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" title={`${pendingInGroup} bảng giá chờ duyệt`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Alert & Action Buttons */}
          <div className="flex items-center gap-2">
            {totalPendingCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus(selectedStatus === 'PENDING_APPROVAL' ? 'all' : 'PENDING_APPROVAL');
                  setPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border animate-pulse ${selectedStatus === 'PENDING_APPROVAL'
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                  }`}
                title="Bấm để lọc bảng giá có dòng giá dưới sàn chờ duyệt"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>{totalPendingCount} chờ duyệt</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-800 transition-colors"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {canManagePriceList ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateModal}
                className="gap-1.5 py-1.5 text-xs shadow-sm bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" /> Khai báo mới
              </Button>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-medium">
                Chế độ chỉ xem
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Tight Multi-Filters in 1 compact line */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm mã hoặc tên bảng giá..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
          >
            <option value="all">Mọi trạng thái duyệt</option>
            <option value="APPROVED">Đang áp dụng (Đã duyệt)</option>
            <option value="PENDING_APPROVAL">Chờ duyệt (Dưới sàn)</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="REJECTED">Từ chối</option>
          </select>

          {/* Time Filter */}
          <select
            value={selectedTimeStatus}
            onChange={(e) => {
              setSelectedTimeStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
          >
            <option value="all">Mọi thời hạn</option>
            <option value="ACTIVE">🟢 Đang hiệu lực</option>
            <option value="UPCOMING">🔵 Sắp áp dụng</option>
            <option value="EXPIRED">⚪ Đã hết hạn</option>
          </select>

          {/* Lock Filter */}
          <select
            value={selectedLockStatus}
            onChange={(e) => {
              setSelectedLockStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
          >
            <option value="all">Mọi tình trạng đơn</option>
            <option value="locked">🔒 Đã có đơn (Khóa sửa)</option>
            <option value="unlocked">🔓 Có thể chỉnh sửa</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Đặt lại
            </button>
          )}
        </div>
      </div>

      {/* 2. COMPACT HIGH-DENSITY TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-soft overflow-hidden">
        {loading ? (
          <div className="py-16 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
            <p className="text-xs text-slate-400">Đang tải bảng giá...</p>
          </div>
        ) : priceLists.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Không tìm thấy bảng giá phù hợp
            </h4>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              {hasActiveFilters ? 'Hãy thử xóa bớt bộ lọc.' : 'Hãy tạo bảng giá phân phối đầu tiên.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">Mã & Bản</th>
                  <th className="py-2.5 px-3">Tên bảng giá</th>
                  <th className="py-2.5 px-3">Nhóm khách hàng</th>
                  <th className="py-2.5 px-3">Thời gian hiệu lực</th>
                  <th className="py-2.5 px-3">Mặt hàng</th>
                  <th className="py-2.5 px-3">Trạng thái & Ràng buộc</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {priceLists.map((pl) => {
                  const grp = CUSTOMER_GROUPS.find((g) => g.value === pl.customer_group);
                  const isLocked = Boolean(pl.has_orders || pl.is_locked);
                  const isPending = pl.status === 'PENDING_APPROVAL';

                  return (
                    <tr
                      key={pl.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors ${isPending ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                        }`}
                    >
                      {/* Code & Version */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded text-[11px] border border-indigo-100 dark:border-indigo-900/60">
                            {pl.code}
                          </span>
                          <span className="text-[10px] font-bold px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            v{pl.version}
                          </span>
                        </div>
                      </td>

                      {/* Name & Lineage */}
                      <td className="py-2.5 px-3">
                        <div
                          className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[200px] hover:text-indigo-600 cursor-pointer"
                          onClick={() => handleViewDetail(pl.id)}
                          title={pl.name}
                        >
                          {pl.name}
                        </div>
                        {pl.parent_id && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <GitBranch className="w-2.5 h-2.5 text-indigo-400" />
                            <span>Kế thừa ID #{pl.parent_id}</span>
                          </div>
                        )}
                      </td>

                      {/* Customer Group */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${grp?.badgeColor || 'bg-slate-100 text-slate-700'}`}>
                          {grp?.label || pl.customer_group}
                        </span>
                      </td>

                      {/* Effective Dates */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 tabular-nums">
                          <span>{formatDate(pl.valid_from)}</span>
                          <span className="text-slate-400">→</span>
                          <span>{pl.valid_to ? formatDate(pl.valid_to) : 'Vô hạn'}</span>
                          {/* Mini time dot */}
                          {new Date() < new Date(pl.valid_from) ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" title="Sắp áp dụng" />
                          ) : pl.valid_to && new Date() > new Date(pl.valid_to) ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" title="Đã hết hạn" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Đang hiệu lực" />
                          )}
                        </div>
                      </td>

                      {/* Items count & below floor price */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                          {pl.items_count || 0}
                        </span>{' '}
                        <span className="text-slate-400 text-[11px]">SP</span>
                        {pl.requires_approval && (
                          <span className="ml-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950 px-1 py-0.2 rounded border border-amber-200">
                            Dưới sàn
                          </span>
                        )}
                      </td>

                      {/* Status & Lock */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200">
                            <Lock className="w-2.5 h-2.5" /> Có {pl.orders_count} đơn (Khóa)
                          </span>
                        ) : pl.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Đang áp dụng
                          </span>
                        ) : pl.status === 'PENDING_APPROVAL' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5" /> Chờ duyệt
                          </span>
                        ) : pl.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-2.5 h-2.5" /> Bị từ chối
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <Clock className="w-2.5 h-2.5" /> Bản nháp
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Detail: All roles */}
                          <button
                            type="button"
                            onClick={() => handleViewDetail(pl.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Management Actions (Only SalesManager, Admin, Director) */}
                          {canManagePriceList && (
                            <>
                              {/* Edit or Locked alert */}
                              {!isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(pl)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="Chỉnh sửa bảng giá"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPriceList(pl);
                                    setIsLockedAlertModalOpen(true);
                                  }}
                                  className="p-1 rounded-lg text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                                  title="Đã có đơn hàng: Bị khóa sửa (Nhấp xem giải pháp tạo bản mới)"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Clone version */}
                              <button
                                type="button"
                                onClick={() => handleOpenCloneModal(pl)}
                                className="p-1 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Tạo phiên bản kế thừa (v+1)"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              {!isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(pl)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="Xóa bảng giá"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="p-1 rounded-lg text-slate-200 dark:text-slate-800 cursor-not-allowed"
                                  title="Không thể xóa bảng giá đã có đơn"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}

                          {/* Approve (Only for authorized roles when pending) */}
                          {pl.status === 'PENDING_APPROVAL' && canApprove && (
                            <button
                              type="button"
                              onClick={() => handleOpenApproveModal(pl)}
                              className="p-1 rounded-lg text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 transition-colors animate-pulse"
                              title="Xét duyệt bảng giá dưới sàn"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Compact Pagination */}
        {priceLists.length > 0 && (
          <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
            <div>
              Hiển thị <strong>{priceLists.length}</strong> / <strong>{total}</strong> bảng giá
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== ALL MODALS (Full feature integrity maintained) ==================== */}
      <PriceListFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={() => {
          fetchPriceLists();
          fetchGroupSummary();
        }}
        mode={formMode}
        initialData={selectedPriceList}
        availableProducts={availableProducts}
        onTriggerClone={(pl) => {
          setIsFormModalOpen(false);
          handleOpenCloneModal(pl);
        }}
      />

      <CloneVersionModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onSuccess={(newVersion) => {
          fetchPriceLists();
          fetchGroupSummary();
          handleViewDetail(newVersion.id);
        }}
        parentPriceList={selectedPriceList}
      />

      <PriceListDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        priceList={selectedPriceList}
        onEdit={(pl) => {
          setIsDetailModalOpen(false);
          handleOpenEditModal(pl);
        }}
        onClone={(pl) => {
          setIsDetailModalOpen(false);
          handleOpenCloneModal(pl);
        }}
        onApprove={(pl) => {
          setIsDetailModalOpen(false);
          handleOpenApproveModal(pl);
        }}
        onSimulateOrder={handleSimulateOrder}
      />

      <PriceListApproveModal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        onSuccess={() => {
          fetchPriceLists();
          fetchGroupSummary();
        }}
        priceList={selectedPriceList}
      />

      <LockedPriceListAlertModal
        isOpen={isLockedAlertModalOpen}
        onClose={() => setIsLockedAlertModalOpen(false)}
        priceList={selectedPriceList}
        onClone={(pl) => {
          setIsLockedAlertModalOpen(false);
          handleOpenCloneModal(pl);
        }}
        onViewDetail={(id) => {
          setIsLockedAlertModalOpen(false);
          handleViewDetail(id);
        }}
      />
    </PageContainer>
  );
};
