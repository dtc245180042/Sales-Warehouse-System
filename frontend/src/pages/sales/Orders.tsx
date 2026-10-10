import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Eye,
  Ban,
  Search,
  ShoppingCart,
  Download,
  Calendar,
  CreditCard,
  Printer,
  Filter,
  X,
  MapPin,
  Building2,
  User,
  RefreshCw,
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
  FileEdit,
  Boxes,
  Archive,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { orderService } from '../../services/orderService';
import { agentService } from '../../services/agentService';
import { Order, OrderStatus } from '../../types/Order';
import { Agent } from '../../types/Agent';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { OrderPrintModal } from '../../components/orders/OrderPrintModal';

const REGION_OPTIONS = ['all', 'Miền Nam', 'Miền Bắc', 'Miền Trung'];

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'confirmed', label: 'Đã duyệt' },
  { value: 'preparing', label: 'Đang soạn hàng' },
  { value: 'shipping', label: 'Đã xuất kho' },
  { value: 'completed', label: 'Đã giao' },
  { value: 'closed', label: 'Đóng' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const ORDERS_FILTER_STORAGE_KEY = 'omspro_orders_filter_cache';

export const Orders: React.FC = () => {
  const { showToast } = useToast();
  const { user, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // SCRUM-613: Nhân viên kinh doanh (SalesStaff) chỉ xem đơn của các đại lý được phân công hoặc do mình tạo
  const isSalesStaff = role === 'SalesStaff';
  const assignedAgentIds = useMemo(() => {
    if (!isSalesStaff || !user) return null;
    const set = new Set<string>();
    agents.forEach((a) => {
      if (
        a.assignedStaffId === user.id ||
        a.assignedStaffName === user.name ||
        (user.assignedDealers && user.assignedDealers.includes(a.id)) ||
        (user.assignedDealers && user.assignedDealers.includes(a.code))
      ) {
        set.add(a.id);
        set.add(a.code);
        set.add(a.name);
      }
    });
    return set;
  }, [isSalesStaff, user, agents]);

  // Read URL params
  const urlSearch = searchParams.get('q') || '';
  const urlStatus = searchParams.get('status') || 'all';
  const urlAgent = searchParams.get('agent') || 'all';
  const urlStaff = searchParams.get('staff') || 'all';
  const urlRegion = searchParams.get('region') || 'all';
  const urlStartDate = searchParams.get('from') || '';
  const urlEndDate = searchParams.get('to') || '';

  // Local filter states
  const [orders, setOrders] = useState<Order[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<string>(urlStatus);
  const [agentFilter, setAgentFilter] = useState<string>(urlAgent);
  const [staffFilter, setStaffFilter] = useState<string>(urlStaff);
  const [regionFilter, setRegionFilter] = useState<string>(urlRegion);
  const [startDate, setStartDate] = useState<string>(urlStartDate);
  const [endDate, setEndDate] = useState<string>(urlEndDate);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  // SCRUM-239 / SCRUM-612: Đồng bộ trạng thái bộ lọc với sessionStorage & URL
  // Khi mở màn hình lần đầu: nếu URL không có query params, khôi phục từ sessionStorage nếu có
  useEffect(() => {
    if (searchParams.toString()) {
      // Đã có param trên URL -> đồng bộ vào sessionStorage
      const current = {
        q: urlSearch,
        status: urlStatus,
        agent: urlAgent,
        staff: urlStaff,
        region: urlRegion,
        from: urlStartDate,
        to: urlEndDate,
      };
      sessionStorage.setItem(ORDERS_FILTER_STORAGE_KEY, JSON.stringify(current));
    } else {
      // URL trống param -> kiểm tra sessionStorage để khôi phục
      const cached = sessionStorage.getItem(ORDERS_FILTER_STORAGE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const params = new URLSearchParams();
          if (parsed.q?.trim()) {
            params.set('q', parsed.q.trim());
            setSearch(parsed.q.trim());
          }
          if (parsed.status && parsed.status !== 'all') {
            params.set('status', parsed.status);
            setStatusFilter(parsed.status);
          }
          if (parsed.agent && parsed.agent !== 'all') {
            params.set('agent', parsed.agent);
            setAgentFilter(parsed.agent);
          }
          if (parsed.staff && parsed.staff !== 'all') {
            params.set('staff', parsed.staff);
            setStaffFilter(parsed.staff);
          }
          if (parsed.region && parsed.region !== 'all') {
            params.set('region', parsed.region);
            setRegionFilter(parsed.region);
          }
          if (parsed.from) {
            params.set('from', parsed.from);
            setStartDate(parsed.from);
          }
          if (parsed.to) {
            params.set('to', parsed.to);
            setEndDate(parsed.to);
          }
          if (params.toString()) {
            setSearchParams(params, { replace: true });
          }
        } catch {
          // ignore corrupted JSON
        }
      }
    }
  }, []);

  // Sync state when URL params change (e.g. browser back/forward)
  useEffect(() => {
    setSearch(urlSearch);
    setStatusFilter(urlStatus);
    setAgentFilter(urlAgent);
    setStaffFilter(urlStaff);
    setRegionFilter(urlRegion);
    setStartDate(urlStartDate);
    setEndDate(urlEndDate);
  }, [urlSearch, urlStatus, urlAgent, urlStaff, urlRegion, urlStartDate, urlEndDate]);

  // Load orders & agents
  const loadOrders = async () => {
    const [ordersData, agentsData] = await Promise.all([
      orderService.getAll(),
      agentService.getAll().catch(() => [] as Agent[]),
    ]);
    setOrders(ordersData);
    setAgents(agentsData);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Trích xuất danh sách nhân viên từ danh sách đơn hàng
  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.staffName) {
        map.set(o.staffId || o.staffName, o.staffName);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [orders]);

  // Helper detect region from address or order
  const getOrderRegion = (o: Order): string => {
    if (o.region) return o.region;
    const addr = (o.customerAddress || '').toLowerCase();
    if (addr.includes('hà nội') || addr.includes('hải phòng') || addr.includes('quảng ninh') || addr.includes('bắc')) {
      return 'Miền Bắc';
    }
    if (addr.includes('đà nẵng') || addr.includes('huế') || addr.includes('nha trang') || addr.includes('trung')) {
      return 'Miền Trung';
    }
    return 'Miền Nam';
  };

  // Helper update URL params & session storage
  const applyFiltersToUrl = (newFilters: {
    q?: string;
    status?: string;
    agent?: string;
    staff?: string;
    region?: string;
    from?: string;
    to?: string;
  }) => {
    const params = new URLSearchParams();
    const q = newFilters.q !== undefined ? newFilters.q : search;
    const status = newFilters.status !== undefined ? newFilters.status : statusFilter;
    const agent = newFilters.agent !== undefined ? newFilters.agent : agentFilter;
    const staff = newFilters.staff !== undefined ? newFilters.staff : staffFilter;
    const region = newFilters.region !== undefined ? newFilters.region : regionFilter;
    const from = newFilters.from !== undefined ? newFilters.from : startDate;
    const to = newFilters.to !== undefined ? newFilters.to : endDate;

    if (q.trim()) params.set('q', q.trim());
    if (status && status !== 'all') params.set('status', status);
    if (agent && agent !== 'all') params.set('agent', agent);
    if (staff && staff !== 'all') params.set('staff', staff);
    if (region && region !== 'all') params.set('region', region);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    // Lưu vào sessionStorage để duy trì khi chuyển trang hoặc reload
    sessionStorage.setItem(
      ORDERS_FILTER_STORAGE_KEY,
      JSON.stringify({ q, status, agent, staff, region, from, to })
    );

    setSearchParams(params, { replace: true });
  };

  // Dropdown immediate change handlers
  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    applyFiltersToUrl({ status: val });
  };

  const handleAgentChange = (val: string) => {
    setAgentFilter(val);
    applyFiltersToUrl({ agent: val });
  };

  const handleStaffChange = (val: string) => {
    setStaffFilter(val);
    applyFiltersToUrl({ staff: val });
  };

  const handleRegionChange = (val: string) => {
    setRegionFilter(val);
    applyFiltersToUrl({ region: val });
  };

  const handleApplyFilters = () => {
    applyFiltersToUrl({});
    showToast('Đã áp dụng các bộ lọc tìm kiếm', 'info');
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setAgentFilter('all');
    setStaffFilter('all');
    setRegionFilter('all');
    setStartDate('');
    setEndDate('');
    sessionStorage.removeItem(ORDERS_FILTER_STORAGE_KEY);
    setSearchParams({}, { replace: true });
    showToast('Đã xóa toàn bộ bộ lọc', 'info');
  };

  // Preset Date range
  const setQuickDate = (type: 'today' | 'week' | 'month' | 'all') => {
    const now = new Date();
    const nowStr = now.toISOString().split('T')[0];

    if (type === 'all') {
      setStartDate('');
      setEndDate('');
      applyFiltersToUrl({ from: '', to: '' });
      return;
    }

    if (type === 'today') {
      setStartDate(nowStr);
      setEndDate(nowStr);
      applyFiltersToUrl({ from: nowStr, to: nowStr });
      return;
    }

    if (type === 'week') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      const pastStr = past.toISOString().split('T')[0];
      setStartDate(pastStr);
      setEndDate(nowStr);
      applyFiltersToUrl({ from: pastStr, to: nowStr });
      return;
    }

    if (type === 'month') {
      const past = new Date();
      past.setMonth(past.getMonth() - 1);
      const pastStr = past.toISOString().split('T')[0];
      setStartDate(pastStr);
      setEndDate(nowStr);
      applyFiltersToUrl({ from: pastStr, to: nowStr });
      return;
    }
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Keyword search (Code, Customer name, Phone, Staff name)
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCode = o.code.toLowerCase().includes(q);
        const matchCustomer = o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone.includes(q);
        const matchStaff = o.staffName.toLowerCase().includes(q);
        if (!matchCode && !matchCustomer && !matchPhone && !matchStaff) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }

      // 3. Agent filter
      if (agentFilter !== 'all') {
        const matchAgent =
          o.agentId === agentFilter ||
          o.customerId === agentFilter ||
          o.customerName === agentFilter;
        if (!matchAgent) return false;
      }

      // 4. Staff filter
      if (staffFilter !== 'all') {
        const matchStaff = o.staffId === staffFilter || o.staffName === staffFilter;
        if (!matchStaff) return false;
      }

      // 5. Region filter
      if (regionFilter !== 'all') {
        const orderRegion = getOrderRegion(o);
        if (orderRegion !== regionFilter) return false;
      }

      // 6. Date range filter
      if (startDate) {
        const orderDate = o.createdAt.split(' ')[0];
        if (orderDate < startDate) return false;
      }
      if (endDate) {
        const orderDate = o.createdAt.split(' ')[0];
        if (orderDate > endDate) return false;
      }

      // SCRUM-613: Phân quyền xem đơn theo đại lý phụ trách cho nhân viên kinh doanh
      if (isSalesStaff && assignedAgentIds) {
        const isOwnOrder =
          o.staffId === user?.id ||
          o.staffName === user?.name ||
          (user?.name && o.staffName?.toLowerCase().includes(user.name.toLowerCase()));
        const isAssignedAgent =
          (o.agentId && assignedAgentIds.has(o.agentId)) ||
          (o.customerId && assignedAgentIds.has(o.customerId)) ||
          (o.customerName && assignedAgentIds.has(o.customerName));

        if (!isOwnOrder && !isAssignedAgent) {
          return false;
        }
      }

      return true;
    });
  }, [
    orders,
    search,
    statusFilter,
    agentFilter,
    staffFilter,
    regionFilter,
    startDate,
    endDate,
    isSalesStaff,
    assignedAgentIds,
    user,
  ]);

  const hasActiveFilters = Boolean(
    search ||
      statusFilter !== 'all' ||
      agentFilter !== 'all' ||
      staffFilter !== 'all' ||
      regionFilter !== 'all' ||
      startDate ||
      endDate
  );

  // SCRUM-239 / SCRUM-611: Hiển thị tổng tiền và số lượng đơn theo kết quả lọc hiện tại
  const summaryMetrics = useMemo(() => {
    const totalCount = filteredOrders.length;
    const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPaid = filteredOrders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
    const totalUnpaid = filteredOrders.reduce((sum, o) => {
      if (o.status === 'cancelled') return sum;
      return sum + Math.max(0, (o.total || 0) - (o.paidAmount || 0));
    }, 0);
    const completedCount = filteredOrders.filter(
      (o) => o.status === 'completed' || o.status === 'closed'
    ).length;
    const processingCount = filteredOrders.filter((o) =>
      ['pending', 'confirmed', 'preparing', 'shipping'].includes(o.status)
    ).length;
    const cancelledCount = filteredOrders.filter((o) => o.status === 'cancelled').length;

    return {
      totalCount,
      totalAmount,
      totalPaid,
      totalUnpaid,
      completedCount,
      processingCount,
      cancelledCount,
    };
  }, [filteredOrders]);

  const handleCancelOrder = async () => {
    if (!cancelOrderId) return;
    try {
      await orderService.cancelOrder(cancelOrderId);
      showToast('Đã hủy đơn hàng và hoàn lại số lượng tồn kho thành công', 'success');
      setCancelOrderId(null);
      loadOrders();
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi hủy đơn hàng', 'error');
    }
  };

  const handleExportCSV = () => {
    exportToCSV({
      filename: `danh_sach_don_hang_${Date.now()}`,
      headers: [
        'Mã đơn',
        'Khách hàng / Đại lý',
        'SĐT',
        'Khu vực',
        'Ngày tạo',
        'Tổng tiền',
        'Phương thức',
        'Trạng thái',
        'Nhân viên',
      ],
      rows: filteredOrders.map((o) => [
        o.code,
        o.customerName,
        o.customerPhone,
        getOrderRegion(o),
        o.createdAt,
        o.total,
        o.paymentMethod,
        o.status,
        o.staffName,
      ]),
    });
    showToast(`Đã xuất ${filteredOrders.length} đơn hàng sang CSV thành công!`, 'success');
  };

  const statusConfigs: Record<
    OrderStatus,
    { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral' }
  > = {
    draft: { label: 'Nháp', variant: 'neutral' },
    pending: { label: 'Chờ duyệt', variant: 'warning' },
    confirmed: { label: 'Đã duyệt', variant: 'primary' },
    preparing: { label: 'Đang soạn hàng', variant: 'info' },
    shipping: { label: 'Đã xuất kho', variant: 'info' },
    completed: { label: 'Đã giao', variant: 'success' },
    closed: { label: 'Đóng', variant: 'neutral' },
    cancelled: { label: 'Đã hủy', variant: 'danger' },
  };

  const columns: Column<Order>[] = [
    {
      key: 'code',
      header: 'Mã Đơn',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
      render: (o) => (
        <Link to={`/orders/${o.id}`} className="hover:underline font-mono">
          {o.code}
        </Link>
      ),
    },
    {
      key: 'customerName',
      header: 'Khách Hàng / Đại Lý',
      sortable: true,
      className: 'min-w-[170px]',
      render: (o) => (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200">{o.customerName}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
            <span>{o.customerPhone}</span>
            {o.agentName && (
              <span className="text-indigo-600 dark:text-indigo-400 font-medium truncate max-w-[120px]">
                • {o.agentName}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Khu Vực',
      sortable: true,
      render: (o) => {
        const reg = getOrderRegion(o);
        return (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            {reg}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Ngày Tạo',
      sortable: true,
      render: (o) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(o.createdAt)}</span>,
    },
    {
      key: 'total',
      header: 'Tổng Tiền',
      sortable: true,
      render: (o) => (
        <span className="font-black text-slate-900 dark:text-white">
          {formatCurrency(o.total)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Thanh Toán',
      sortable: true,
      render: (o) => {
        const methodMap: Record<string, string> = {
          cash: 'Tiền mặt',
          transfer: 'Chuyển khoản',
          card: 'Thẻ ATM/Visa',
        };
        return (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {methodMap[o.paymentMethod] || o.paymentMethod}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (o) => {
        const conf = statusConfigs[o.status] || { label: o.status, variant: 'neutral' };
        return (
          <Badge variant={conf.variant as any} size="sm" dot>
            {conf.label}
          </Badge>
        );
      },
    },
    {
      key: 'staffName',
      header: 'Người Tạo Đơn',
      sortable: true,
      render: (o) => {
        const isCurrentUser = user && (user.name === o.staffName || String(user.id) === String(o.staffId));
        const avatarSrc = isCurrentUser && user?.avatar
          ? user.avatar
          : (o as any).staffAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(o.staffName)}&background=6366f1&color=fff&size=128`;
        return (
          <div className="flex items-center gap-2">
            <img
              src={avatarSrc}
              alt={o.staffName}
              className="w-7 h-7 rounded-full object-cover ring-2 ring-indigo-500/20 shadow-sm shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(o.staffName)}&background=6366f1&color=fff&size=128`;
              }}
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {o.staffName}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (o) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/orders/${o.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Xem chi tiết đơn hàng & timeline"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setPrintOrder(o)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="In / Lưu PDF đơn hàng"
          >
            <Printer className="w-4 h-4" />
          </button>
          {!['shipping', 'completed', 'closed', 'cancelled'].includes(o.status) && (
            <button
              onClick={() => setCancelOrderId(o.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Hủy đơn hàng"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Quản Lý Đơn Hàng"
      subtitle={`Theo dõi và xử lý ${orders.length} đơn hàng trên toàn hệ thống`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel/CSV
          </Button>
          <Link to="/sales/pos">
            <Button variant="primary" size="sm" leftIcon={<ShoppingCart className="w-4 h-4" />}>
              Mở quầy POS bán hàng
            </Button>
          </Link>
        </div>
      }
    >
      {/* ── BỘ LỌC ĐA TIÊU CHÍ (SCRUM-239 / SCRUM-607) ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-4 shadow-sm space-y-3.5">
        {/* Hàng 1: Search, Trạng thái, Đại lý, Nhân viên, Khu vực */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Tìm kiếm từ khóa */}
          <div className="lg:col-span-1">
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Search className="w-3 h-3 text-indigo-500" />
              Từ khóa tìm kiếm
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              placeholder="Mã đơn, khách, SĐT..."
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Trạng thái vòng đời */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-indigo-500" />
              Trạng thái
            </label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Đại lý */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-indigo-500" />
              Đại lý / Kênh
            </label>
            <select
              value={agentFilter}
              onChange={(e) => handleAgentChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả đại lý</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.code} - {ag.name}
                </option>
              ))}
            </select>
          </div>

          {/* Nhân viên phụ trách */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <User className="w-3 h-3 text-indigo-500" />
              Nhân viên phụ trách
            </label>
            <select
              value={staffFilter}
              onChange={(e) => handleStaffChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả nhân viên</option>
              {staffOptions.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          {/* Khu vực */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-indigo-500" />
              Khu vực
            </label>
            <select
              value={regionFilter}
              onChange={(e) => handleRegionChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả khu vực</option>
              {REGION_OPTIONS.filter((r) => r !== 'all').map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hàng 2: Khoảng thời gian (Từ ngày - Đến ngày) & Nút Thao tác */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          {/* Chọn ngày */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              Thời gian tạo:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-slate-400">đến</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Quick date presets */}
            <div className="flex items-center gap-1 pl-1">
              <button
                type="button"
                onClick={() => setQuickDate('today')}
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('week')}
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
              >
                7 ngày qua
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('month')}
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
              >
                Tháng này
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleApplyFilters}
              leftIcon={<Filter className="w-3.5 h-3.5" />}
            >
              Áp dụng bộ lọc
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </div>

        {/* Active chips summary */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
            <span className="text-slate-400 font-medium">Đang lọc theo:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                Từ khóa: &quot;{search}&quot;
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    applyFiltersToUrl({ q: '' });
                  }}
                >
                  <X className="w-3 h-3 hover:text-rose-500" />
                </button>
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                Trạng thái: {STATUS_FILTER_OPTIONS.find((s) => s.value === statusFilter)?.label}
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    applyFiltersToUrl({ status: 'all' });
                  }}
                >
                  <X className="w-3 h-3 hover:text-rose-500" />
                </button>
              </span>
            )}
            {agentFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                Đại lý: {agents.find((a) => a.id === agentFilter)?.name || agentFilter}
                <button
                  type="button"
                  onClick={() => {
                    setAgentFilter('all');
                    applyFiltersToUrl({ agent: 'all' });
                  }}
                >
                  <X className="w-3 h-3 hover:text-rose-500" />
                </button>
              </span>
            )}
            {staffFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                Nhân viên: {staffOptions.find((s) => s.value === staffFilter)?.label || staffFilter}
                <button
                  type="button"
                  onClick={() => {
                    setStaffFilter('all');
                    applyFiltersToUrl({ staff: 'all' });
                  }}
                >
                  <X className="w-3 h-3 hover:text-rose-500" />
                </button>
              </span>
            )}
            {regionFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                Khu vực: {regionFilter}
                <button
                  type="button"
                  onClick={() => {
                    setRegionFilter('all');
                    applyFiltersToUrl({ region: 'all' });
                  }}
                >
                  <X className="w-3 h-3 hover:text-rose-500" />
                </button>
              </span>
            )}
            {(startDate || endDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                Thời gian: {startDate || '...'} đến {endDate || '...'}
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    applyFiltersToUrl({ from: '', to: '' });
                  }}
                >
                  <X className="w-3 h-3 hover:text-rose-500" />
                </button>
              </span>
            )}
            <span className="text-indigo-600 font-bold ml-auto">
              Tìm thấy {filteredOrders.length} đơn hàng
            </span>
          </div>
        )}
      </div>

      {/* ── KHU VỰC TỔNG HỢP THEO KẾT QUẢ LỌC (SCRUM-239 / SCRUM-611) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        {/* Card 1: Số lượng đơn hàng */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative overflow-hidden transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Số Lượng Đơn Lọc
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {summaryMetrics.totalCount}
            </span>
            <span className="text-xs font-semibold text-slate-400">đơn hàng</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3 h-3" /> {summaryMetrics.completedCount} đã giao
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
              <Clock className="w-3 h-3" /> {summaryMetrics.processingCount} đang xử lý
            </span>
          </div>
        </div>

        {/* Card 2: Tổng giá trị đơn hàng */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative overflow-hidden transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Tổng Doanh Số Lọc
            </span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
              {formatCurrency(summaryMetrics.totalAmount)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            <span className="text-slate-400">Tổng tiền {summaryMetrics.totalCount} đơn</span>
            {hasActiveFilters && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                Đang lọc
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Đã thanh toán / Thực thu */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative overflow-hidden transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Đã Thu Tiền (Thực Thu)
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(summaryMetrics.totalPaid)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            <span className="text-slate-400">Tỷ lệ thanh toán:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {summaryMetrics.totalAmount > 0
                ? Math.round((summaryMetrics.totalPaid / summaryMetrics.totalAmount) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* Card 4: Công nợ / Cần thu */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative overflow-hidden transition-all hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Còn Phải Thu (Công Nợ)
            </span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
              {formatCurrency(summaryMetrics.totalUnpaid)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2">
            <span className="text-slate-400">Chưa thanh toán đủ</span>
            {summaryMetrics.cancelledCount > 0 && (
              <span className="text-[10px] text-rose-500 font-semibold">
                ({summaryMetrics.cancelledCount} đơn hủy)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── BẢNG DANH SÁCH & PHÂN TRANG KẾT QUẢ ── */}
      <DataTable
        data={filteredOrders}
        columns={columns}
        keyExtractor={(o) => o.id}
        emptyTitle="Không tìm thấy đơn hàng"
        emptyDescription="Thử nới lỏng hoặc xóa các tiêu chí bộ lọc để hiển thị nhiều kết quả hơn."
      />

      <ConfirmDialog
        isOpen={!!cancelOrderId}
        onClose={() => setCancelOrderId(null)}
        onConfirm={handleCancelOrder}
        title="Xác nhận hủy đơn hàng"
        message="Bạn có chắc chắn muốn hủy đơn hàng này? Số lượng sản phẩm đã bán trong đơn sẽ được hoàn trả lại vào tồn kho."
        confirmText="Hủy đơn hàng"
        variant="danger"
      />

      <OrderPrintModal
        isOpen={!!printOrder}
        onClose={() => setPrintOrder(null)}
        orderId={printOrder?.id || null}
        orderCode={printOrder?.code}
      />
    </PageContainer>
  );
};

export default Orders;
