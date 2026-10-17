import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  CircleDollarSign,
  Clock,
  PackageCheck,
  AlertTriangle,
  Layers,
  RefreshCw,
  Filter,
  MapPin,
  Building2,
  Calendar,
  Zap,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { executiveDashboardService } from '../../services/executiveDashboardService';
import { ExecutiveDashboardResponse } from '../../types/executiveDashboard';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const REGION_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

export const ExecutiveDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ExecutiveDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [period, setPeriod] = useState<string>('this_month');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const res = await executiveDashboardService.getDashboardData({
          period,
          region: selectedRegion || undefined,
          refresh: isRefresh,
        });
        setData(res);
      } catch (err: any) {
        console.error('Lỗi tải dữ liệu dashboard điều hành:', err);
        setError(err?.response?.data?.detail || 'Không thể tải số liệu dashboard. Vui lòng thử lại sau.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period, selectedRegion]
  );

  useEffect(() => {
    fetchDashboard(false);
  }, [fetchDashboard]);

  const handleRefresh = () => {
    fetchDashboard(true);
  };

  const kpis = data?.kpis;

  return (
    <PageContainer
      title="Dashboard Điều Hành Bán Hàng & Kho"
      subtitle="Tổng quan tình hình kinh doanh, tiến độ kho và công nợ toàn công ty cập nhật tức thì"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {/* SLA Performance Indicator */}
          {data && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <Zap className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
              <span>{data.execution_time_ms} ms</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-500 font-normal">
                ({data.cached ? 'Bộ nhớ đệm' : 'Truy vấn thực'} &lt; 2s)
              </span>
            </div>
          )}

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            leftIcon={
              <RefreshCw
                className={`w-4 h-4 text-slate-600 dark:text-slate-400 ${
                  refreshing ? 'animate-spin text-indigo-600' : ''
                }`}
              />
            }
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* THANH BỘ LỌC (FILTERS TOOLBAR) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Kỳ xem:
            </span>
            <button
              onClick={() => setPeriod('this_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                period === 'this_month'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Tháng này
            </button>
            <button
              onClick={() => setPeriod('last_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                period === 'last_month'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Tháng trước
            </button>
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                period === 'today'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Hôm nay
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Khu vực:
            </span>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              <option value="">Tất cả khu vực toàn quốc</option>
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Nam">Miền Nam</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Hà Nội">Hà Nội</option>
              <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 6 THẺ CHỈ SỐ KPI ĐIỀU HÀNH (SUBTASK 10/11) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* 1. Doanh số hôm nay */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/40 dark:from-slate-900 dark:to-slate-900 border border-blue-100 dark:border-blue-900/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Doanh số hôm nay
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {loading ? '...' : formatCurrency(kpis?.revenue_today || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <span>{kpis?.total_orders_today || 0}</span> đơn phát sinh hôm nay
            </p>
          </div>

          {/* 2. Doanh số tháng này */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/40 dark:from-slate-900 dark:to-slate-900 border border-emerald-100 dark:border-emerald-900/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Doanh số {period === 'last_month' ? 'tháng trước' : 'tháng này'}
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CircleDollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {loading ? '...' : formatCurrency(kpis?.revenue_this_month || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <span>{kpis?.total_orders_this_month || 0}</span> đơn hàng ghi nhận
            </p>
          </div>

          {/* 3. Đơn chờ duyệt */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50/40 dark:from-slate-900 dark:to-slate-900 border border-amber-100 dark:border-amber-900/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Đơn chờ duyệt
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
              {loading ? '...' : formatNumber(kpis?.pending_approval_orders || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Cần quản lý phê duyệt
            </p>
          </div>

          {/* 4. Đơn chờ xuất kho */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50/40 dark:from-slate-900 dark:to-slate-900 border border-purple-100 dark:border-purple-900/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Đơn chờ xuất kho
              </span>
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <PackageCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 tracking-tight">
              {loading ? '...' : formatNumber(kpis?.pending_dispatch_orders || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Đang chuẩn bị &amp; đóng gói
            </p>
          </div>

          {/* 5. Công nợ quá hạn */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-50 to-red-50/40 dark:from-slate-900 dark:to-slate-900 border border-rose-100 dark:border-rose-900/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Công nợ quá hạn
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400 tracking-tight">
              {loading ? '...' : formatCurrency(kpis?.overdue_debt_amount || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <span>{kpis?.overdue_agencies_count || 0}</span> đại lý quá hạn
            </p>
          </div>

          {/* 6. SKU dưới tồn tối thiểu */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50/40 dark:from-slate-900 dark:to-slate-900 border border-orange-100 dark:border-orange-900/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                SKU dưới tồn tối thiểu
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tracking-tight">
              {loading ? '...' : formatNumber(kpis?.low_stock_sku_count || 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Cần nhập hàng bổ sung
            </p>
          </div>
        </div>

        {/* 2 KHỐI BIỂU ĐỒ (SUBTASK 16/17) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Biểu đồ 1: Doanh số theo ngày trong tháng */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Diễn biến Doanh số theo ngày
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Theo dõi xu hướng bán hàng hàng ngày trong tháng
                </p>
              </div>
              <Badge variant="info">
                {data?.daily_sales?.length || 0} ngày
              </Badge>
            </div>

            <div className="h-[280px] w-full pt-2">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Đang tải biểu đồ...
                </div>
              ) : (data?.daily_sales?.length || 0) === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Chưa có dữ liệu doanh số trong kỳ này.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.daily_sales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-slate-800" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `${(val / 1000000).toFixed(0)}Tr`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload;
                          return (
                            <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl text-xs space-y-1">
                              <p className="font-bold text-slate-700 dark:text-slate-200">Ngày {p.date}</p>
                              <p className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                Doanh số: {formatCurrency(p.sales_amount)}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                Số đơn: {p.order_count} đơn hàng
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales_amount"
                      stroke="#4F46E5"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Biểu đồ 2: Doanh số theo khu vực */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Cơ cấu theo Khu vực
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tỷ trọng doanh số theo địa bàn
                </p>
              </div>
            </div>

            <div className="h-[280px] w-full pt-2 flex flex-col justify-center">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Đang tải biểu đồ...
                </div>
              ) : (data?.regional_sales?.length || 0) === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Chưa có dữ liệu khu vực.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.regional_sales}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}Tr`} />
                    <YAxis dataKey="region" type="category" stroke="#94a3b8" fontSize={11} width={80} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload;
                          return (
                            <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl text-xs space-y-1">
                              <p className="font-bold text-slate-700 dark:text-slate-200">{p.region}</p>
                              <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                Doanh số: {formatCurrency(p.sales_amount)} ({p.percentage}%)
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                Số đơn: {p.order_count} đơn hàng
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="sales_amount" radius={[0, 8, 8, 0]}>
                      {data?.regional_sales?.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={REGION_COLORS[index % REGION_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* BẢNG DANH SÁCH ĐẠI LÝ QUÁ HẠN CÔNG NỢ (SUBTASK 12/13/22/23) */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Danh Sách Đại Lý Quá Hạn Công Nợ
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sắp xếp giảm dần theo số tiền nợ quá hạn để Quản lý kinh doanh dễ dàng nắm bắt và xử lý rủi ro
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="danger" size="md">
                {data?.overdue_agencies?.length || 0} đại lý vi phạm
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Đại lý</th>
                  <th className="py-3 px-4">Khu vực</th>
                  <th className="py-3 px-4">Hạn mức tín dụng</th>
                  <th className="py-3 px-4 text-center">Hóa đơn nợ</th>
                  <th className="py-3 px-4 text-center">Quá hạn cao nhất</th>
                  <th className="py-3 px-4 text-right">Tổng tiền nợ quá hạn</th>
                  <th className="py-3 px-4 text-center w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Đang tải danh sách công nợ quá hạn...
                    </td>
                  </tr>
                ) : (data?.overdue_agencies?.length || 0) === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      🎉 Tuyệt vời! Không có đại lý nào bị quá hạn công nợ trong hệ thống.
                    </td>
                  </tr>
                ) : (
                  data?.overdue_agencies?.map((agency, index) => (
                    <tr
                      key={agency.customer_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 text-center font-bold">
                        {index === 0 ? (
                          <span className="w-6 h-6 rounded-full bg-rose-500 text-white inline-flex items-center justify-center text-xs shadow-sm">
                            1
                          </span>
                        ) : index === 1 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-500 text-white inline-flex items-center justify-center text-xs shadow-sm">
                            2
                          </span>
                        ) : index === 2 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-400 text-white inline-flex items-center justify-center text-xs shadow-sm">
                            3
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">{index + 1}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {agency.customer_name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {agency.customer_code} • {agency.customer_phone || 'Không có SĐT'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {agency.region || 'Chưa phân vùng'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(agency.credit_limit)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                        {agency.overdue_invoices_count}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={agency.max_overdue_days >= 30 ? 'danger' : 'warning'}
                          size="sm"
                        >
                          {agency.max_overdue_days} ngày
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-rose-600 dark:text-rose-400 font-mono text-sm">
                        {formatCurrency(agency.overdue_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
                          onClick={() => navigate(`/customers/${agency.customer_id}`)}
                        >
                          Xem
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
