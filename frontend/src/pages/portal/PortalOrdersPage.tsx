import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Package,
  ShoppingBag,
  Search,
  Building2,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Truck,
  XCircle,
  Eye,
  LogOut,
  RefreshCw,
  X,
  ChevronRight,
  MapPin,
  Phone,
  User,
  CreditCard,
  FileText,
  Boxes,
} from 'lucide-react';
import {
  portalService,
  PortalOrderListItem,
  PortalOrderDetail,
  PortalProfile,
} from '../../services/portalService';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/formatters';

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Chờ duyệt',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  pending_approval: {
    label: 'Chờ duyệt',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  confirmed: {
    label: 'Đã xác nhận',
    bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
    text: 'text-sky-700 dark:text-sky-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  approved: {
    label: 'Đã duyệt',
    bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
    text: 'text-sky-700 dark:text-sky-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  shipping: {
    label: 'Đang giao hàng',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-400',
    icon: <Truck className="w-3.5 h-3.5" />,
  },
  completed: {
    label: 'Đã giao thành công',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  delivered: {
    label: 'Đã giao thành công',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: 'Đã hủy',
    bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

export const PortalOrdersPage: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // State
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [orders, setOrders] = useState<PortalOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Detail Modal
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<PortalOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Load profile and orders
  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [selectedStatus, page]);

  const loadProfile = async () => {
    try {
      const p = await portalService.getProfile();
      setProfile(p);
    } catch {
      // Ignore profile fail
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params: { status?: string; page: number; limit: number } = { page, limit };
      if (selectedStatus !== 'all') {
        params.status = selectedStatus;
      }
      const res = await portalService.getOrders(params);
      setOrders(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tải danh sách đơn hàng của bạn.');
    } finally {
      setLoading(false);
    }
  };

  // Open detail
  const handleOpenDetail = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setLoadingDetail(true);
    setDetailError(null);
    setOrderDetail(null);
    try {
      const detail = await portalService.getOrderDetail(orderId);
      setOrderDetail(detail);
    } catch (err: any) {
      setDetailError(err.message || 'Không thể tải chi tiết đơn hàng.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedOrderId(null);
    setOrderDetail(null);
    setDetailError(null);
  };

  // Filtered by search client-side for fast responsiveness
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.expected_delivery_date && o.expected_delivery_date.includes(q))
    );
  }, [orders, search]);

  // Status Counts Summary
  const stats = useMemo(() => {
    const totalCount = total;
    const shippingCount = orders.filter((o) => o.status === 'shipping').length;
    const shortCount = orders.filter((o) => o.has_short_delivery).length;
    const completedCount = orders.filter(
      (o) => o.status === 'completed' || o.status === 'delivered'
    ).length;
    return { totalCount, shippingCount, shortCount, completedCount };
  }, [orders, total]);

  const formatDeliveryDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Đang cập nhật';
    return dateStr;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 pb-20 font-sans">
      {/* 1. Header with Tabs */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-xs border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">CỔNG ĐẠI LÝ B2B</div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {profile?.customer_name || 'Đại lý của bạn'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => logout()}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition flex items-center gap-1.5 text-xs font-medium"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex border-t border-slate-100 dark:border-slate-700/60">
          <button
            onClick={() => navigate('/portal/order')}
            className="flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Đặt Hàng Trực Tuyến</span>
          </button>
          <button
            className="flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 transition"
          >
            <Package className="w-4 h-4" />
            <span>Theo Dõi Đơn Hàng Của Tôi</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-start gap-3 text-rose-700 dark:text-rose-300 text-xs shadow-xs">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
            <button
              onClick={loadOrders}
              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900 rounded-lg text-rose-800 font-semibold"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* 2. Top Summary KPI Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Tổng số đơn</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{stats.totalCount}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Đang giao</div>
              <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{stats.shippingCount}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/20 dark:bg-amber-950/10 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Có giao thiếu</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{stats.shortCount}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">Đã giao đủ</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.completedCount}</div>
            </div>
          </div>
        </section>

        {/* 3. Search & Filter Bar */}
        <section className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo mã đơn hàng, ngày dự kiến..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadOrders}
              disabled={loading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-200 transition"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {[
              { id: 'all', label: 'Tất cả trạng thái' },
              { id: 'pending', label: 'Chờ duyệt' },
              { id: 'confirmed', label: 'Đã xác nhận' },
              { id: 'shipping', label: 'Đang giao hàng' },
              { id: 'completed', label: 'Đã hoàn tất' },
              { id: 'cancelled', label: 'Đã hủy' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedStatus(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition ${
                  selectedStatus === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* 4. Orders List View */}
        {loading ? (
          /* Loading State (Subtask 6) */
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 animate-pulse space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-32"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-20"></div>
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-48"></div>
                <div className="flex justify-between items-center pt-2">
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-md w-28"></div>
                  <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded-md w-24"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          /* Empty State (Subtask 6) */
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center mx-auto">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Không tìm thấy đơn hàng nào</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {selectedStatus !== 'all' || search
                  ? 'Không có đơn hàng nào khớp với điều kiện lọc hiện tại.'
                  : 'Bạn chưa có đơn đặt hàng nào trong hệ thống. Hãy tạo đơn đặt hàng mới ngay!'}
              </p>
            </div>
            <button
              onClick={() => navigate('/portal/order')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Tạo đơn đặt hàng mới</span>
            </button>
          </div>
        ) : (
          /* Order Items Cards (Subtask 4) */
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status.toLowerCase()] || {
                label: order.status,
                bg: 'bg-slate-100 border-slate-200 text-slate-600',
                text: 'text-slate-600',
                icon: <Clock className="w-3.5 h-3.5" />,
              };

              return (
                <div
                  key={order.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md transition space-y-3"
                >
                  {/* Top: Code & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {order.code}
                        </span>
                        {/* Cảnh báo giao thiếu (Subtask 4 AC) */}
                        {order.has_short_delivery && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Giao thiếu</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Ngày đặt: {new Date(order.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text}`}
                    >
                      {statusCfg.icon}
                      <span>{statusCfg.label}</span>
                    </span>
                  </div>

                  {/* Middle: Details & Expected Delivery Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>
                        Ngày giao dự kiến:{' '}
                        <strong className="text-slate-900 dark:text-white font-semibold">
                          {formatDeliveryDate(order.expected_delivery_date)}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Boxes className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Số mặt hàng: <strong>{order.items_count} mặt hàng</strong></span>
                    </div>
                  </div>

                  {/* Bottom: Total & Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    <div>
                      <div className="text-[11px] text-slate-400">Tổng thanh toán:</div>
                      <div className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(order.total)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenDetail(order.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-bold text-xs transition"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Chi tiết dòng hàng</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 5. Detail Modal with Short Delivery Breakdown (Subtask 2 & 6) */}
      {selectedOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden my-auto animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Chi Tiết Đơn Hàng {orderDetail?.code || selectedOrderId}
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    Đối chiếu số lượng đặt & số lượng thực giao
                  </div>
                </div>
              </div>
              <button
                onClick={handleCloseDetail}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 max-h-[75vh] overflow-y-auto space-y-4 text-xs">
              {loadingDetail ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                  <span>Đang tải thông tin chi tiết đơn hàng...</span>
                </div>
              ) : detailError ? (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 text-center space-y-2">
                  <AlertTriangle className="w-6 h-6 mx-auto text-rose-500" />
                  <div>{detailError}</div>
                  <button
                    onClick={() => handleOpenDetail(selectedOrderId)}
                    className="px-3 py-1 bg-rose-100 rounded-lg font-bold"
                  >
                    Thử lại
                  </button>
                </div>
              ) : orderDetail ? (
                <>
                  {/* Delivery & Schedule Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-400 font-medium">Người nhận hàng:</div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {orderDetail.delivery_receiver_name || orderDetail.customer_name}
                      </div>
                      {orderDetail.delivery_phone && (
                        <div className="text-slate-500 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {orderDetail.delivery_phone}
                        </div>
                      )}
                      {orderDetail.delivery_address && (
                        <div className="text-slate-500 flex items-start gap-1.5 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>{orderDetail.delivery_address}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 sm:border-l sm:border-slate-200 dark:sm:border-slate-700 sm:pl-3">
                      <div className="text-[11px] text-slate-400 font-medium">Tiến độ giao hàng:</div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        <span>
                          Ngày giao dự kiến:{' '}
                          <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                            {formatDeliveryDate(orderDetail.expected_delivery_date)}
                          </strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Trạng thái: <strong>{orderDetail.status}</strong></span>
                      </div>
                      {orderDetail.has_short_delivery && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1.5 mt-1">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Đơn có mặt hàng được giao thiếu so với số lượng đặt.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items Table: Ordered vs Actual Delivered (Subtask 2) */}
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-indigo-600" />
                      <span>Chi Tiết Từng Dòng Hàng</span>
                    </h4>

                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                              <th className="p-3">Sản phẩm</th>
                              <th className="p-3 text-center">ĐVT</th>
                              <th className="p-3 text-center">SL Đặt</th>
                              <th className="p-3 text-center">Thực Giao</th>
                              <th className="p-3 text-center">Đối Chiếu Giao Hàng</th>
                              <th className="p-3 text-right">Đơn giá</th>
                              <th className="p-3 text-right">Thành tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {orderDetail.items.map((item) => {
                              const isShort = item.is_short_delivered;
                              const delivQty = item.delivered_quantity;

                              return (
                                <tr
                                  key={item.id}
                                  className={
                                    isShort
                                      ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-750'
                                  }
                                >
                                  <td className="p-3">
                                    <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>
                                  </td>
                                  <td className="p-3 text-center text-slate-500">{item.unit || 'cái'}</td>
                                  <td className="p-3 text-center font-bold text-slate-800 dark:text-slate-200">
                                    {item.quantity}
                                  </td>
                                  <td className="p-3 text-center">
                                    {delivQty !== null && delivQty !== undefined ? (
                                      <span
                                        className={`font-bold ${
                                          isShort ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                                        }`}
                                      >
                                        {delivQty}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic">Chưa giao</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center">
                                    {delivQty === null || delivQty === undefined ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500">
                                        Chờ xuất kho
                                      </span>
                                    ) : isShort ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 animate-pulse">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>Thiếu {item.short_delivered_quantity} {item.unit}</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Giao đủ ({delivQty}/{item.quantity})</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right text-slate-600 dark:text-slate-300">
                                    {formatCurrency(item.price)}
                                  </td>
                                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                                    {formatCurrency(item.subtotal)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <div className="flex justify-between text-slate-500">
                      <span>Tạm tính tiền hàng:</span>
                      <span>{formatCurrency(orderDetail.subtotal)}</span>
                    </div>
                    {orderDetail.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Chiết khấu sản lượng:</span>
                        <span>-{formatCurrency(orderDetail.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 dark:text-white font-extrabold text-sm pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span>Tổng tiền đơn hàng:</span>
                      <span className="text-indigo-600 dark:text-indigo-400">{formatCurrency(orderDetail.total)}</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={handleCloseDetail}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 font-bold rounded-xl text-xs transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalOrdersPage;
