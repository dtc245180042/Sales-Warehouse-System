import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ShoppingBag,
  Package,
  Calendar,
  DollarSign,
  PlusCircle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Eye,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../../services/api';
import { UserOrder, UserProfileData, mockWeeklyRevenueChart } from '../../data/mockData';
import { OrderStatus } from '../../components/user/OrderStatus';

export const Dashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [recentOrders, setRecentOrders] = useState<UserOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profData, ordersData] = await Promise.all([
          api.user.getProfile(),
          api.orders.getAll({ limit: 5 } as any),
        ]);
        setProfile(profData);
        setRecentOrders(ordersData.slice(0, 5));
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const statCards = [
    {
      title: 'Đơn hôm nay',
      value: profile?.todayOrdersCount || 24,
      unit: 'đơn',
      change: '+12%',
      isPositive: true,
      icon: Clock,
      color: 'from-blue-600 to-indigo-600',
      textColor: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      title: 'Đơn tháng này',
      value: profile?.monthlyOrdersCount || 168,
      unit: 'đơn',
      change: '+15.4%',
      isPositive: true,
      icon: Package,
      color: 'from-purple-600 to-indigo-600',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      title: 'Doanh số cá nhân',
      value: formatVND(profile?.personalRevenue || 28500000),
      change: '+8.5%',
      isPositive: true,
      icon: DollarSign,
      color: 'from-emerald-600 to-teal-600',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Sản phẩm đã bán',
      value: profile?.productsSoldCount || 312,
      unit: 'sản phẩm',
      change: '+22%',
      isPositive: true,
      icon: ShoppingBag,
      color: 'from-amber-500 to-orange-500',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-slide-up">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-500/15 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold mb-3 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Khu vực nhân viên bán hàng</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Xin chào, {profile?.name || 'Nguyễn Văn A'}! 👋
          </h2>
          <p className="text-xs sm:text-sm text-indigo-100 mt-2 leading-relaxed">
            Hôm nay bạn đã hoàn tất <strong>{profile?.todayOrdersCount || 24} đơn hàng</strong>. Tiếp tục phát huy để đạt chỉ tiêu doanh số tháng này nhé!
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <Link
            to="/user/orders/create"
            className="px-5 py-3 rounded-2xl bg-white text-indigo-700 font-extrabold text-xs sm:text-sm shadow-lg hover:bg-indigo-50 active:scale-95 transition-all flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Tạo đơn bán hàng</span>
          </Link>
          <Link
            to="/user/products"
            className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs sm:text-sm backdrop-blur-md transition-colors flex items-center gap-1.5"
          >
            <span>Kho sản phẩm</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Decorative Circles */}
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-soft hover:shadow-lg transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {card.title}
                </span>
                <div className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 ${card.textColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {card.value}
                </span>
                {card.unit && (
                  <span className="text-xs font-bold text-slate-400">{card.unit}</span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{card.change}</span>
                <span className="text-slate-400 font-normal">so với tuần trước</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sales Chart Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Doanh số bán hàng 7 ngày gần nhất
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Thống kê tổng giá trị đơn hàng thực hiện bởi nhân viên
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-400">Tổng 7 ngày:</span>
            <span className="ml-2 text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400">
              {formatVND(165400000)}
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockWeeklyRevenueChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="userRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val / 1000000}tr`}
              />
              <Tooltip
                formatter={(val: any) => [formatVND(Number(val)), 'Doanh số']}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderRadius: '16px',
                  border: '1px solid #1e293b',
                  color: '#fff',
                  fontSize: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#6366f1"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#userRevenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Đơn hàng gần đây
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Danh sách các đơn bán hàng do bạn phụ trách xử lý
            </p>
          </div>
          <Link
            to="/user/orders"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
          >
            <span>Xem tất cả</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-3">Mã đơn</th>
                <th className="py-3 px-3">Khách hàng</th>
                <th className="py-3 px-3 text-right">Tổng tiền</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-3 text-center">Ngày tạo</th>
                <th className="py-3 px-3 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-sm">
              {recentOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    <Link to={`/user/orders/${ord.id}`} className="hover:underline">
                      {ord.code}
                    </Link>
                  </td>
                  <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                    {ord.customerName}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                    {formatVND(ord.total)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <OrderStatus status={ord.status} size="sm" />
                  </td>
                  <td className="py-3 px-3 text-center text-slate-400 text-xs">
                    {ord.createdAt.split(' ')[0]}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Link
                      to={`/user/orders/${ord.id}`}
                      className="inline-flex p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Xem chi tiết đơn hàng"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export { Dashboard as DashboardPage };
export default Dashboard;
