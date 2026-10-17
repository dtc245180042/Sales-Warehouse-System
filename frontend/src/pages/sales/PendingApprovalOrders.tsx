import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Search,
  Filter,
  Download,
  Eye,
  Check,
  X,
  RotateCcw,
  Clock,
  User,
  Building2,
  DollarSign,
  TrendingDown,
  Layers,
  ArrowRight,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { orderApprovalService } from '../../services/orderApprovalService';
import {
  ApprovalOrder,
  ApprovalStatus,
  ApprovalActionType,
  ViolationType,
  ViolationSeverity,
} from '../../types/OrderApproval';
import { ApprovalDetailModal } from '../../components/sales/ApprovalDetailModal';
import { OrderApprovalActionModal } from '../../components/sales/OrderApprovalActionModal';

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

interface StatusBadgeProps {
  status: ApprovalStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning" size="sm" dot>
          Chờ duyệt
        </Badge>
      );
    case 'revision':
      return (
        <Badge variant="warning" size="sm" dot>
          Cần sửa đổi
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="success" size="sm" dot>
          Đã duyệt
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="danger" size="sm" dot>
          Đã từ chối
        </Badge>
      );
  }
};

interface KpiCardProps {
  title: string;
  count: number | string;
  subtitle: string;
  icon: React.ReactNode;
  variant: 'amber' | 'rose' | 'orange' | 'indigo' | 'emerald';
}

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  count,
  subtitle,
  icon,
  variant,
}) => {
  const colorMap = {
    amber: 'from-amber-500/10 to-amber-500/5 text-amber-600 border-amber-200 dark:border-amber-800/80',
    rose: 'from-rose-500/10 to-rose-500/5 text-rose-600 border-rose-200 dark:border-rose-800/80',
    orange: 'from-orange-500/10 to-orange-500/5 text-orange-600 border-orange-200 dark:border-orange-800/80',
    indigo: 'from-indigo-500/10 to-indigo-500/5 text-indigo-600 border-indigo-200 dark:border-indigo-800/80',
    emerald: 'from-emerald-500/10 to-emerald-500/5 text-emerald-600 border-emerald-200 dark:border-emerald-800/80',
  };

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br ${colorMap[variant]} bg-white dark:bg-slate-900 border shadow-xs flex items-center justify-between gap-3`}
    >
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">{count}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-xs flex items-center justify-center shrink-0">
        {icon}
      </div>
    </div>
  );
};

// ─── Component Chính: PendingApprovalOrders (SCRUM-237 / SCRUM-563) ────────

export const PendingApprovalOrders: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Đọc params từ URL
  const urlSearch = searchParams.get('q') || '';
  const urlStatus = (searchParams.get('status') as ApprovalStatus | 'all') || 'pending';
  const urlType = (searchParams.get('type') as ViolationType | 'all') || 'all';
  const urlSeverity = (searchParams.get('severity') as ViolationSeverity | 'all') || 'all';

  const [orders, setOrders] = useState<ApprovalOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Bộ lọc
  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>(urlStatus);
  const [typeFilter, setTypeFilter] = useState<ViolationType | 'all'>(urlType);
  const [severityFilter, setSeverityFilter] = useState<ViolationSeverity | 'all'>(urlSeverity);
  const [staffFilter, setStaffFilter] = useState<string>('all');

  // Checkbox chọn nhiều đơn (Bulk Actions)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal chi tiết
  const [selectedOrder, setSelectedOrder] = useState<ApprovalOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Modal xử lý Duyệt / Từ chối / Trả lại sửa (SCRUM-569)
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionModalOrders, setActionModalOrders] = useState<ApprovalOrder[]>([]);
  const [actionModalInitialAction, setActionModalInitialAction] = useState<ApprovalActionType>('approve');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Kiểm tra quyền phê duyệt (Chỉ Admin, SalesManager, Director, Manager)
  const canApprove = useMemo(() => {
    if (!user) return false;
    const approverRoles = ['Admin', 'SalesManager', 'Director', 'Manager', 'Accountant'];
    return approverRoles.includes(user.role);
  }, [user]);

  // Tải danh sách đơn hàng
  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await orderApprovalService.getAll();
      setOrders(data);
    } catch {
      showToast('Lỗi khi tải danh sách đơn hàng chờ duyệt', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Danh sách nhân viên tạo đơn trích xuất từ dữ liệu
  const staffList = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.createdStaffId && o.createdStaffName) {
        map.set(o.createdStaffId, o.createdStaffName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Cập nhật URL khi thay đổi bộ lọc
  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([k, v]) => {
      if (v && v !== 'all') {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    });
    setSearchParams(params, { replace: true });
  };

  // Thống kê nhanh
  const stats = useMemo(() => {
    const pendingOrders = orders.filter((o) => o.approvalStatus === 'pending');
    const revisionCount = orders.filter((o) => o.approvalStatus === 'revision').length;
    const criticalCount = pendingOrders.filter((o) => o.highestSeverity === 'critical').length;
    const floorPriceCount = pendingOrders.filter((o) =>
      o.violations.some((v) => v.type === 'below_floor_price')
    ).length;
    const creditDebtCount = pendingOrders.filter((o) =>
      o.violations.some((v) => v.type === 'credit_limit' || v.type === 'overdue_debt')
    ).length;
    const totalPendingAmount = pendingOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    return {
      pendingCount: pendingOrders.length,
      revisionCount,
      criticalCount,
      floorPriceCount,
      creditDebtCount,
      totalPendingAmount,
    };
  }, [orders]);

  // Lọc dữ liệu
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.createdStaffName.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'all' || o.approvalStatus === statusFilter;

      const matchType =
        typeFilter === 'all' || o.violations.some((v) => v.type === typeFilter);

      const matchSeverity =
        severityFilter === 'all' || o.highestSeverity === severityFilter;

      const matchStaff = staffFilter === 'all' || o.createdStaffId === staffFilter;

      return matchSearch && matchStatus && matchType && matchSeverity && matchStaff;
    });
  }, [orders, search, statusFilter, typeFilter, severityFilter, staffFilter]);

  // Mở hộp thoại xử lý phê duyệt (Duyệt / Từ chối / Trả lại sửa - SCRUM-569)
  const handleOpenActionModal = (
    targetOrders: ApprovalOrder[],
    initialAct: ApprovalActionType = 'approve'
  ) => {
    setActionModalOrders(targetOrders);
    setActionModalInitialAction(initialAct);
    setActionModalOpen(true);
  };

  // Xác nhận xử lý từ Action Modal
  const handleActionConfirm = async (action: ApprovalActionType, notes: string) => {
    if (actionModalOrders.length === 0) return;
    setIsSubmittingAction(true);
    const approverName = user?.name || 'Quản lý kinh doanh';

    try {
      if (actionModalOrders.length === 1) {
        const target = actionModalOrders[0];
        if (action === 'approve') {
          await orderApprovalService.approve(target.id, approverName, notes);
          showToast(`Đã phê duyệt đơn hàng ${target.orderCode} thành công`, 'success');
        } else if (action === 'reject') {
          await orderApprovalService.reject(target.id, approverName, notes);
          showToast(`Đã từ chối đơn hàng ${target.orderCode}`, 'info');
        } else if (action === 'revision') {
          await orderApprovalService.returnForEdit(target.id, approverName, notes);
          showToast(`Đã trả lại đơn hàng ${target.orderCode} để yêu cầu sửa`, 'warning');
        }
      } else {
        const ids = actionModalOrders.map((o) => o.id);
        if (action === 'approve') {
          await orderApprovalService.batchApprove(ids, approverName, notes);
          showToast(`Đã phê duyệt ${ids.length} đơn hàng thành công`, 'success');
        } else if (action === 'reject') {
          await orderApprovalService.batchReject(ids, approverName, notes);
          showToast(`Đã từ chối ${ids.length} đơn hàng`, 'info');
        } else if (action === 'revision') {
          await orderApprovalService.batchReturnForEdit(ids, approverName, notes);
          showToast(`Đã trả lại ${ids.length} đơn hàng để yêu cầu sửa`, 'warning');
        }
      }

      setActionModalOpen(false);
      setSelectedIds(new Set());
      loadOrders();
    } catch {
      showToast('Lỗi khi thực hiện thao tác xử lý đơn hàng', 'error');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Thao tác từ chối 1 đơn trực tiếp từ modal chi tiết
  const handleRejectSingle = async (orderId: string, reason: string) => {
    try {
      await orderApprovalService.reject(
        orderId,
        user?.name || 'Quản lý kinh doanh',
        reason
      );
      showToast('Đã từ chối đơn hàng thành công', 'info');
      setIsDetailModalOpen(false);
      loadOrders();
    } catch {
      showToast('Lỗi khi từ chối đơn hàng', 'error');
    }
  };

  // Thao tác trả lại sửa 1 đơn trực tiếp từ modal chi tiết (SCRUM-569)
  const handleReturnForEditSingle = async (orderId: string, notes: string) => {
    try {
      await orderApprovalService.returnForEdit(
        orderId,
        user?.name || 'Quản lý kinh doanh',
        notes
      );
      showToast('Đã gửi yêu cầu trả lại sửa đơn hàng', 'warning');
      setIsDetailModalOpen(false);
      loadOrders();
    } catch {
      showToast('Lỗi khi trả lại sửa đơn hàng', 'error');
    }
  };

  // Thao tác phê duyệt 1 đơn từ modal chi tiết
  const handleApproveSingle = async (orderId: string, notes?: string) => {
    try {
      await orderApprovalService.approve(
        orderId,
        user?.name || 'Quản lý kinh doanh',
        notes
      );
      showToast('Đã phê duyệt đơn hàng thành công', 'success');
      setIsDetailModalOpen(false);
      loadOrders();
    } catch {
      showToast('Lỗi khi phê duyệt đơn hàng', 'error');
    }
  };

  // Chọn / bỏ chọn 1 dòng
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Chọn tất cả các đơn pending đang hiển thị
  const handleSelectAll = () => {
    const pendingInView = filteredOrders
      .filter((o) => o.approvalStatus === 'pending')
      .map((o) => o.id);

    if (selectedIds.size === pendingInView.length && pendingInView.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingInView));
    }
  };

  // Duyệt hàng loạt các đơn đã chọn (mở modal)
  const handleBatchApprove = () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;
    handleOpenActionModal(selectedOrders, 'approve');
  };

  // Trả lại sửa hàng loạt các đơn đã chọn (mở modal) (SCRUM-569)
  const handleBatchReturnForEdit = () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;
    handleOpenActionModal(selectedOrders, 'revision');
  };

  // Từ chối hàng loạt (mở modal)
  const handleBatchReject = () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;
    handleOpenActionModal(selectedOrders, 'reject');
  };

  // Xuất file CSV
  const handleExportCSV = () => {
    exportToCSV({
      filename: `don_cho_duyet_vi_pham_${Date.now()}`,
      headers: [
        'Mã đơn',
        'Khách hàng',
        'SĐT',
        'Tổng tiền',
        'Ngày tạo',
        'Người tạo',
        'Mức vi phạm',
        'Lý do vi phạm',
        'Trạng thái',
      ],
      rows: filteredOrders.map((o) => [
        o.orderCode,
        o.customerName,
        o.customerPhone,
        o.totalAmount,
        o.createdAt,
        o.createdStaffName,
        o.highestSeverity,
        o.violations.map((v) => v.title).join('; '),
        o.approvalStatus,
      ]),
    });
    showToast(`Đã xuất ${filteredOrders.length} đơn hàng sang CSV`, 'success');
  };

  // Đặt lại toàn bộ bộ lọc
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSeverityFilter('all');
    setStaffFilter('all');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <PageContainer
      title="Duyệt Đơn Hàng Vi Phạm Chính Sách"
      subtitle="Danh sách các đơn hàng vi phạm hạn mức công nợ, giá sàn hoặc chiết khấu cần Quản lý phê duyệt (SCRUM-237)"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel / CSV
          </Button>
          <Link to="/sales/orders">
            <Button variant="ghost" size="sm" className="text-xs">
              Tất cả đơn hàng
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── 1. Thẻ tổng quan thống kê (KPIs) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            title="Đơn Chờ Duyệt"
            count={stats.pendingCount}
            subtitle="Cần xem xét xử lý"
            icon={<Clock className="w-5 h-5" />}
            variant="amber"
          />
          <KpiCard
            title="Vi Phạm Nghiêm Trọng"
            count={stats.criticalCount}
            subtitle="Vượt công nợ / Nợ quá hạn"
            icon={<AlertTriangle className="w-5 h-5" />}
            variant="rose"
          />
          <KpiCard
            title="Vi Phạm Giá Sàn"
            count={stats.floorPriceCount}
            subtitle="Bán dưới giá quy định"
            icon={<TrendingDown className="w-5 h-5" />}
            variant="orange"
          />
          <KpiCard
            title="Tổng Tiền Chờ Duyệt"
            count={formatCurrency(stats.totalPendingAmount)}
            subtitle="Giá trị luân chuyển"
            icon={<DollarSign className="w-5 h-5" />}
            variant="indigo"
          />
        </div>

        {/* ── 2. Khu vực lọc & Tabs trạng thái ── */}
        <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          {/* Tabs chuyển đổi trạng thái */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('pending');
                  updateParams({ status: 'pending' });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  statusFilter === 'pending'
                    ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <span>Chờ duyệt</span>
                {stats.pendingCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white">
                    {stats.pendingCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('revision');
                  updateParams({ status: 'revision' });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  statusFilter === 'revision'
                    ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <span>Cần sửa đổi</span>
                {stats.revisionCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white">
                    {stats.revisionCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('approved');
                  updateParams({ status: 'approved' });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'approved'
                    ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Đã duyệt
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('rejected');
                  updateParams({ status: 'rejected' });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'rejected'
                    ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Đã từ chối
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  updateParams({ status: 'all' });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Tất cả ({orders.length})
              </button>
            </div>

            {/* Ô tìm kiếm nhanh */}
            <div className="relative flex-1 sm:w-64 max-w-sm ml-auto">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  updateParams({ q: e.target.value });
                }}
                placeholder="Tìm mã đơn, đại lý, SĐT, nhân viên..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Các bộ lọc chi tiết */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* Lọc theo Lý do vi phạm (SCRUM-563) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Lý do vi phạm:
              </label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  const val = e.target.value as ViolationType | 'all';
                  setTypeFilter(val);
                  updateParams({ type: val });
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả lý do vi phạm</option>
                <option value="credit_limit">Vượt hạn mức công nợ</option>
                <option value="below_floor_price">Dưới giá sàn tối thiểu</option>
                <option value="max_discount">Vượt mức chiết khấu tối đa</option>
                <option value="overdue_debt">Khách hàng có nợ quá hạn</option>
                <option value="out_of_stock">Vượt tồn kho khả dụng</option>
                <option value="payment_term">Điều khoản thanh toán đặc biệt</option>
              </select>
            </div>

            {/* Lọc theo Mức độ vi phạm (SCRUM-563) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Mức độ vi phạm:
              </label>
              <select
                value={severityFilter}
                onChange={(e) => {
                  const val = e.target.value as ViolationSeverity | 'all';
                  setSeverityFilter(val);
                  updateParams({ severity: val });
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả mức độ vi phạm</option>
                <option value="critical">Nghiêm trọng (Critical)</option>
                <option value="high">Cao (High)</option>
                <option value="medium">Trung bình (Medium)</option>
                <option value="low">Thấp (Low)</option>
              </select>
            </div>

            {/* Lọc theo Nhân viên tạo */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Người tạo đơn:
              </label>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả nhân viên kinh doanh</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Nút đặt lại */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleResetFilters}
                className="w-full py-1.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại bộ lọc</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. Floating Action Bar khi chọn nhiều đơn (SCRUM-569) ── */}
        {selectedIds.size > 0 && canApprove && (
          <div className="p-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3 flex-wrap animate-fadeIn">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs">
                {selectedIds.size}
              </div>
              <span className="text-xs sm:text-sm font-bold">
                Đã chọn {selectedIds.size} đơn hàng chờ duyệt
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 text-xs font-semibold text-white/80 hover:text-white hover:underline transition"
              >
                Bỏ chọn
              </button>

              <button
                type="button"
                onClick={handleBatchReturnForEdit}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Trả lại sửa {selectedIds.size} đơn</span>
              </button>

              <button
                type="button"
                onClick={handleBatchReject}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Từ chối {selectedIds.size} đơn</span>
              </button>

              <button
                type="button"
                onClick={handleBatchApprove}
                className="px-4 py-1.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Phê duyệt {selectedIds.size} đơn</span>
              </button>
            </div>
          </div>
        )}

        {/* ── 4. Bảng danh sách đơn hàng vi phạm ── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              Đang tải danh sách đơn hàng chờ duyệt...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <ShieldAlert className="w-10 h-10 mx-auto text-slate-300 stroke-[1.2]" />
              <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Không tìm thấy đơn hàng vi phạm nào
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Hiện tại không có đơn hàng nào vi phạm chính sách trong phạm vi bộ lọc đã chọn.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {canApprove && (
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedIds.size > 0 &&
                            selectedIds.size ===
                              filteredOrders.filter((o) => o.approvalStatus === 'pending').length
                          }
                          onChange={handleSelectAll}
                          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-3 px-3">Mã Đơn / Ngày Tạo</th>
                    <th className="py-3 px-3">Đại Lý / Khách Hàng</th>
                    <th className="py-3 px-3">Tổng Tiền</th>
                    <th className="py-3 px-3 min-w-[280px]">Lý Do Vi Phạm & Mức Độ</th>
                    <th className="py-3 px-3">Người Tạo</th>
                    <th className="py-3 px-3">Trạng Thái</th>
                    <th className="py-3 px-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredOrders.map((order) => {
                    const isSelected = selectedIds.has(order.id);
                    const isPending = order.approvalStatus === 'pending';

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 transition-colors ${
                          isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
                        }`}
                      >
                        {canApprove && (
                          <td className="py-3.5 px-3 text-center">
                            {isPending && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(order.id)}
                                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                              />
                            )}
                          </td>
                        )}

                        {/* Mã đơn & Ngày tạo */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsDetailModalOpen(true);
                            }}
                            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline block text-left"
                          >
                            {order.orderCode}
                          </button>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            {formatDate(order.createdAt)}
                          </span>
                        </td>

                        {/* Khách hàng / Đại lý */}
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                            {order.customerName}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                            <span>{order.customerPhone}</span>
                            {order.customerGroup && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300 text-[10px]">
                                {order.customerGroup}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Tổng tiền */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="font-black text-slate-900 dark:text-white">
                            {formatCurrency(order.totalAmount)}
                          </span>
                        </td>

                        {/* Lý do vi phạm & Mức độ (SCRUM-563) */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <SeverityTag severity={order.highestSeverity} />
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                {order.violations.length} lỗi chính sách:
                              </span>
                            </div>

                            <div className="space-y-1">
                              {order.violations.map((vio) => (
                                <div
                                  key={vio.id}
                                  className="text-[11px] bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-1.5"
                                >
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                                    • {vio.title}
                                  </span>
                                  {vio.differenceValue && (
                                    <span className="text-rose-600 dark:text-rose-400 font-bold shrink-0 text-[10px]">
                                      {vio.differenceValue}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>

                        {/* Người tạo */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                              {order.createdStaffName.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                              {order.createdStaffName}
                            </span>
                          </div>
                        </td>

                        {/* Trạng thái */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <StatusBadge status={order.approvalStatus} />
                        </td>

                        {/* Thao tác */}
                        <td className="py-3.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(order);
                                setIsDetailModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="Xem chi tiết vi phạm"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {isPending && canApprove && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenActionModal([order], 'approve')}
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition"
                                  title="Phê duyệt đơn hàng này"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenActionModal([order], 'revision')}
                                  className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/60 transition"
                                  title="Yêu cầu sửa đổi / Trả lại sửa"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenActionModal([order], 'reject')}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition"
                                  title="Từ chối đơn hàng"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
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
        </div>
      </div>

      {/* Modal chi tiết vi phạm & phê duyệt */}
      <ApprovalDetailModal
        order={selectedOrder}
        isOpen={isDetailModalOpen}
        canApprove={canApprove}
        onClose={() => setIsDetailModalOpen(false)}
        onApprove={handleApproveSingle}
        onReject={handleRejectSingle}
        onReturnForEdit={handleReturnForEditSingle}
      />

      {/* Hộp thoại xử lý Duyệt / Từ chối / Trả lại sửa (SCRUM-237 / SCRUM-569) */}
      <OrderApprovalActionModal
        isOpen={actionModalOpen}
        orders={actionModalOrders}
        initialAction={actionModalInitialAction}
        onClose={() => setActionModalOpen(false)}
        onConfirm={handleActionConfirm}
        isSubmitting={isSubmittingAction}
      />
    </PageContainer>
  );
};

export default PendingApprovalOrders;
