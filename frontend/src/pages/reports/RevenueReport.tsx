import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  Download,
  Printer,
  Calendar,
  ArrowUpRight,
  PieChart as PieIcon,
  Percent,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { monthlyRevenueData } from '../../mock/dashboard';
import { useToast } from '../../contexts/ToastContext';

export const RevenueReport: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlPeriod = (searchParams.get('period') as 'year' | 'quarter' | 'month') || 'year';
  const [period, setPeriod] = useState<'year' | 'quarter' | 'month'>(urlPeriod);

  useEffect(() => {
    setPeriod(urlPeriod);
  }, [urlPeriod]);

  const handlePeriodChange = (newPeriod: 'year' | 'quarter' | 'month') => {
    setPeriod(newPeriod);
    const params = new URLSearchParams(searchParams);
    if (newPeriod !== 'year') params.set('period', newPeriod);
    else params.delete('period');
    setSearchParams(params, { replace: true });
  };

  const totalYearRevenue = monthlyRevenueData.reduce((sum, item) => sum + item.revenue, 0);
  const totalYearProfit = monthlyRevenueData.reduce((sum, item) => sum + item.profit, 0);
  const totalOrders = monthlyRevenueData.reduce((sum, item) => sum + item.orders, 0);
  const avgProfitMargin = Math.round((totalYearProfit / totalYearRevenue) * 100);

  const handleExportCSV = () => {
    exportToCSV({
      filename: `bao_cao_doanh_thu_${Date.now()}`,
      headers: ['Tháng', 'Doanh thu (VNĐ)', 'Lợi nhuận gộp (VNĐ)', 'Số lượng đơn hàng', 'Tỷ suất lợi nhuận (%)'],
      rows: monthlyRevenueData.map((d) => [
        d.month,
        d.revenue,
        d.profit,
        d.orders,
        `${Math.round((d.profit / d.revenue) * 100)}%`,
      ]),
    });
    showToast('Đã xuất báo cáo doanh thu thành công!', 'success');
  };

  return (
    <PageContainer
      title="Báo Cáo Doanh Thu & Lợi Nhuận"
      subtitle="Phân tích chi tiết doanh thu thuần, tỷ suất sinh lời và tăng trưởng tài chính"
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            In báo cáo
          </Button>
        </div>
      }
    >
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Tổng Doanh Thu 12 Tháng</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatCurrency(totalYearRevenue)}
          </p>
          <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 mt-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> +24.5% so với cùng kỳ
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Tổng Lợi Nhuận Gộp</span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {formatCurrency(totalYearProfit)}
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Sau khi trừ giá vốn hàng bán</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Biên Lợi Nhuận Ròng</span>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {avgProfitMargin}%
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Duy trì mức ổn định trên 25%</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Tổng Đơn Đã Giao</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatNumber(totalOrders)} <span className="text-sm font-normal text-slate-400">đơn</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">TB ~{Math.round(totalOrders / 12)} đơn/tháng</span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Xu Hướng Doanh Thu & Lợi Nhuận Theo Tháng
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">So sánh mức độ tăng trưởng doanh số và lợi nhuận thực tế</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-indigo-600" />
              <span className="text-slate-600 dark:text-slate-300">Doanh thu</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-300">Lợi nhuận</span>
            </div>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickFormatter={(v) => `${v / 1000000}M`}
              />
              <Tooltip
                formatter={(val: any) => formatCurrency(Number(val))}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="revenue" name="Doanh thu" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              <Bar dataKey="profit" name="Lợi nhuận" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card mt-6">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
          Bảng Kê Chi Tiết Từng Kỳ Báo Cáo
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3">Kỳ báo cáo</th>
                <th className="pb-3 text-right">Doanh thu thuần</th>
                <th className="pb-3 text-right">Lợi nhuận gộp</th>
                <th className="pb-3 text-center">Tỷ suất lãi</th>
                <th className="pb-3 text-center">Số đơn hàng</th>
                <th className="pb-3 text-right">Giá trị TB/đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {monthlyRevenueData.map((d, index) => (
                <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 font-bold text-slate-800 dark:text-slate-200">{d.month}</td>
                  <td className="py-3 text-right font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(d.revenue)}
                  </td>
                  <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(d.profit)}
                  </td>
                  <td className="py-3 text-center font-bold text-indigo-600">
                    {Math.round((d.profit / d.revenue) * 100)}%
                  </td>
                  <td className="py-3 text-center text-slate-600 dark:text-slate-300">{d.orders}</td>
                  <td className="py-3 text-right text-slate-500">
                    {formatCurrency(Math.round(d.revenue / d.orders))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
};
