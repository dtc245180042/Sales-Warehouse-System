import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  RefreshCw,
  Users,
  Target,
  CheckCircle2,
  AlertCircle,
  Filter,
  Calendar,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { salesTargetService } from '../../services/salesTargetService';
import { SalesTargetProgressItem } from '../../types/SalesTarget';
import { TargetProgressCard } from '../../components/sales/TargetProgressCard';
import { formatNumber } from '../../utils/formatters';

export const SalesTargetProgress: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [progressItems, setProgressItems] = useState<SalesTargetProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Filters
  const [filterTerritory, setFilterTerritory] = useState<string>('all');
  const [filterScope, setFilterScope] = useState<string>('all');

  const isSalesStaff = role === 'SalesStaff';

  const loadProgress = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await salesTargetService.getProgress(selectedYear, selectedMonth);
      setProgressItems(data);
      setLastRefreshed(new Date());
    } catch {
      showToast('Không thể cập nhật tiến độ doanh số', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadProgress(true);
  }, [selectedYear, selectedMonth]);

  // Auto-refresh interval (30s)
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      loadProgress(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [isAutoRefresh, selectedYear, selectedMonth]);

  // Filtered list
  const filteredItems = useMemo(() => {
    let list = progressItems;

    // If SalesStaff, only see own card or show all with highlight
    if (isSalesStaff) {
      const myItems = list.filter((i) => i.userId === user?.id || i.userName === user?.name);
      if (myItems.length > 0) return myItems;
    }

    if (filterScope !== 'all') {
      list = list.filter((i) => i.scope === filterScope);
    }

    if (filterTerritory !== 'all') {
      list = list.filter((i) => i.territory?.includes(filterTerritory));
    }

    return list;
  }, [progressItems, filterScope, filterTerritory, isSalesStaff, user]);

  // Team summary
  const summary = useMemo(() => {
    const totalTarget = progressItems.reduce((sum, i) => sum + i.targetRevenue, 0);
    const totalAchieved = progressItems.reduce((sum, i) => sum + i.currentRevenue, 0);
    const overallPct =
      totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 1000) / 10 : 0;
    const completedCount = progressItems.filter((i) => i.revenuePercentage >= 100).length;
    const totalCount = progressItems.length;

    return { totalTarget, totalAchieved, overallPct, completedCount, totalCount };
  }, [progressItems]);

  const territories = useMemo(() => {
    const set = new Set<string>();
    progressItems.forEach((i) => {
      if (i.territory) set.add(i.territory);
    });
    return Array.from(set);
  }, [progressItems]);

  return (
    <PageContainer
      title="Tiến độ doanh số thời gian thực"
      description="Giám sát trực quan mục tiêu, doanh thu thực tế và tỷ lệ hoàn thành theo thời gian thực (SCRUM-803)"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadProgress(true)}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Cập nhật ngay
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/sales/targets')}
            leftIcon={<Target className="w-4 h-4" />}
          >
            Quản lý chỉ tiêu
          </Button>
        </div>
      }
    >
      {/* Real-time Indicator Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 mb-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live 30s
              </span>
              <span className="text-xs text-slate-300">
                Cập nhật lúc: {lastRefreshed.toLocaleTimeString()}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Tiến độ kinh doanh Tháng {selectedMonth}/{selectedYear}
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Dữ liệu đơn hàng bán ra được tổng hợp tự động theo từng nhân viên và khu vực kinh doanh.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
            <div>
              <span className="text-xs text-slate-300 block">Tổng mục tiêu</span>
              <span className="text-base sm:text-lg font-bold text-white">
                {formatNumber(summary.totalTarget)} đ
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-300 block">Doanh thu đạt</span>
              <span className="text-base sm:text-lg font-bold text-emerald-400">
                {formatNumber(summary.totalAchieved)} đ
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <span className="text-xs text-slate-300 block">Tỷ lệ hoàn thành</span>
              <span className="text-base sm:text-lg font-bold text-primary-300">
                {summary.overallPct}%{' '}
                <span className="text-xs text-slate-300 font-normal">
                  ({summary.completedCount}/{summary.totalCount} đạt)
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Month Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              aria-label="Chọn tháng xem tiến độ"
              className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="Chọn năm xem tiến độ"
              className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          {/* Scope Filters */}
          {!isSalesStaff && (
            <div className="flex items-center gap-2">
              <select
                value={filterScope}
                onChange={(e) => setFilterScope(e.target.value)}
                aria-label="Chọn phạm vi"
                className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="all">Tất cả phạm vi</option>
                <option value="individual">Nhân viên</option>
                <option value="territory">Khu vực</option>
              </select>

              <select
                value={filterTerritory}
                onChange={(e) => setFilterTerritory(e.target.value)}
                aria-label="Lọc theo khu vực"
                className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="all">Tất cả khu vực</option>
                {territories.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Auto Refresh Toggle */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAutoRefresh}
              onChange={(e) => setIsAutoRefresh(e.target.checked)}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span>Tự làm mới (mỗi 30s)</span>
          </label>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
          Đang tính toán tiến độ kinh doanh...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <Target className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
            Chưa có chỉ tiêu nào trong Tháng {selectedMonth}/{selectedYear}
          </h3>
          <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
            Hãy thiết lập chỉ tiêu doanh số cho nhân viên và khu vực để hệ thống bắt đầu theo dõi tiến độ thời gian thực.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => navigate('/sales/targets')}
          >
            Đến trang quản lý chỉ tiêu
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <TargetProgressCard key={item.targetId} item={item} />
          ))}
        </div>
      )}
    </PageContainer>
  );
};
