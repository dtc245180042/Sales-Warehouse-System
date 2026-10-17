/**
 * Trang Báo cáo Công nợ Quá hạn theo Tuổi nợ (Story S8-09 - SCRUM-280).
 *
 * Chức năng:
 * - Xem tổng quan dư nợ theo 5 nhóm tuổi nợ.
 * - Bảng chi tiết từng đại lý với màu mức rủi ro.
 * - Tab "Theo NVKD" để xem tổng hợp theo nhân viên phụ trách.
 * - Tab "Top rủi ro" để ưu tiên xử lý.
 * - Lọc theo NVKD, khu vực, ngày lập báo cáo.
 * - Xuất Excel.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  TrendingDown,
  Users,
  Clock,
  FileDown,
  RefreshCw,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  ShieldAlert,
  UserCheck,
  Calendar,
  BarChart3,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useToast } from '../../contexts/ToastContext';
import { debtAgingReportService } from '../../services/debtAgingReportService';
import {
  DebtAgingReportResponse,
  DebtAgingCustomerRow,
  SalesRepAgingSummary,
  RiskLevel,
} from '../../types/DebtAgingReport';

// ===========================================================================
// UTILS
// ===========================================================================
const formatMoney = (amount: number): string => {
  if (amount === 0) return '0';
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)}tr`;
  return `${amount.toLocaleString('vi-VN')}`;
};

const formatMoneyFull = (amount: number): string =>
  `${amount.toLocaleString('vi-VN')} VNĐ`;

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  CRITICAL: {
    label: 'Nguy hiểm',
    color: 'text-red-100',
    bg: 'bg-red-600',
    border: 'border-red-500',
    icon: <ShieldAlert size={13} />,
  },
  HIGH: {
    label: 'Cao',
    color: 'text-orange-100',
    bg: 'bg-orange-500',
    border: 'border-orange-400',
    icon: <AlertTriangle size={13} />,
  },
  MEDIUM: {
    label: 'Trung bình',
    color: 'text-yellow-900',
    bg: 'bg-yellow-400',
    border: 'border-yellow-300',
    icon: <AlertCircle size={13} />,
  },
  LOW: {
    label: 'Thấp',
    color: 'text-green-100',
    bg: 'bg-green-600',
    border: 'border-green-500',
    icon: <CheckCircle size={13} />,
  },
};

const BUCKET_COLORS = [
  { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  { bg: 'bg-yellow-400', text: 'text-yellow-700', light: 'bg-yellow-50' },
  { bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-50' },
  { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50' },
  { bg: 'bg-red-800', text: 'text-red-900', light: 'bg-red-100' },
];

// ===========================================================================
// COMPONENT: RiskBadge
// ===========================================================================
const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => {
  const cfg = RISK_CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

// ===========================================================================
// COMPONENT: StatCard
// ===========================================================================
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}> = ({ icon, label, value, sub, accent = 'from-slate-700 to-slate-800' }) => (
  <div className={`bg-gradient-to-br ${accent} rounded-xl p-4 text-white shadow flex gap-3 items-start`}>
    <div className="mt-0.5 opacity-80">{icon}</div>
    <div>
      <p className="text-xs opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ===========================================================================
// COMPONENT: AgingBar - Visual bar breakdown
// ===========================================================================
const AgingBar: React.FC<{ row: DebtAgingCustomerRow }> = ({ row }) => {
  const total = row.total_debt;
  if (total === 0) return null;
  const segments = [
    { value: row.current_amount, color: 'bg-blue-400' },
    { value: row.bucket_1_30, color: 'bg-yellow-400' },
    { value: row.bucket_31_60, color: 'bg-orange-400' },
    { value: row.bucket_61_90, color: 'bg-red-500' },
    { value: row.bucket_over_90, color: 'bg-red-800' },
  ];
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px w-28">
      {segments.map((s, i) =>
        s.value > 0 ? (
          <div
            key={i}
            className={`${s.color} flex-shrink-0`}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${formatMoneyFull(s.value)}`}
          />
        ) : null
      )}
    </div>
  );
};

// ===========================================================================
// MAIN PAGE
// ===========================================================================
type TabKey = 'detail' | 'by_rep' | 'top_risk';

type SortKey = 'total_debt' | 'overdue_total' | 'oldest_overdue_days' | 'overdue_ratio' | 'risk_level';
type SortDir = 'asc' | 'desc';

export const DebtAgingReportPage: React.FC = () => {
  const { showToast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [report, setReport] = useState<DebtAgingReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('detail');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRep, setFilterRep] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterRisk, setFilterRisk] = useState<RiskLevel | 'ALL'>('ALL');
  const [asOfDate, setAsOfDate] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('overdue_total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await debtAgingReportService.getReport({
        sales_rep: filterRep || undefined,
        region: filterRegion || undefined,
        as_of_date: asOfDate || undefined,
      });
      setReport(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải báo cáo công nợ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived: list of reps & regions for filter dropdowns ─────────────────
  const repOptions = useMemo(() => {
    if (!report) return [];
    const set = new Set(report.customers.map((c) => c.assigned_sales_rep || 'Chưa phân công'));
    return Array.from(set).sort();
  }, [report]);

  const regionOptions = useMemo(() => {
    if (!report) return [];
    const set = new Set(report.customers.map((c) => c.region || '').filter(Boolean));
    return Array.from(set).sort();
  }, [report]);

  // ── Filtered & sorted customers ───────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!report) return [];
    let rows = report.customers;

    const q = searchQuery.toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.customer_id.toLowerCase().includes(q) ||
          (r.customer_code || '').toLowerCase().includes(q)
      );
    }
    if (filterRep) rows = rows.filter((r) => (r.assigned_sales_rep || '') === filterRep);
    if (filterRegion) rows = rows.filter((r) => (r.region || '') === filterRegion);
    if (filterRisk !== 'ALL') rows = rows.filter((r) => r.risk_level === filterRisk);

    const riskOrder: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    rows = [...rows].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === 'risk_level') {
        va = riskOrder[a.risk_level];
        vb = riskOrder[b.risk_level];
      } else {
        va = a[sortKey] as number;
        vb = b[sortKey] as number;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return rows;
  }, [report, searchQuery, filterRep, filterRegion, filterRisk, sortKey, sortDir]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) =>
    sortKey === col ? (
      sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />
    ) : (
      <span className="opacity-30"><ChevronDown size={13} /></span>
    );

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      setExporting(true);
      await debtAgingReportService.exportExcel({
        sales_rep: filterRep || undefined,
        region: filterRegion || undefined,
        as_of_date: asOfDate || undefined,
      });
      showToast('Xuất Excel thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi xuất Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64 gap-3 text-slate-500">
          <RefreshCw className="animate-spin" size={20} />
          <span>Đang tải báo cáo công nợ...</span>
        </div>
      </PageContainer>
    );
  }

  if (!report) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64 text-red-500 gap-2">
          <AlertTriangle size={20} />
          <span>Không thể tải báo cáo. Vui lòng thử lại.</span>
        </div>
      </PageContainer>
    );
  }

  const criticalCount = report.customers.filter((c) => c.risk_level === 'CRITICAL').length;
  const highCount = report.customers.filter((c) => c.risk_level === 'HIGH').length;

  return (
    <PageContainer>
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingDown size={22} className="text-red-600" />
            Báo cáo Công nợ Quá hạn theo Tuổi nợ
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ngày lập báo cáo: <strong>{report.report_date}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadReport}
            disabled={loading}
            id="btn-refresh-debt-report"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            id="btn-export-debt-excel"
          >
            <FileDown size={14} />
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </Button>
        </div>
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={<Users size={20} />}
          label="Đại lý có nợ"
          value={String(report.total_customers_with_debt)}
          sub={`${criticalCount} nguy hiểm · ${highCount} cao`}
          accent="from-slate-700 to-slate-900"
        />
        <StatCard
          icon={<BarChart3 size={20} />}
          label="Tổng dư nợ"
          value={formatMoney(report.total_debt_amount)}
          sub={formatMoneyFull(report.total_debt_amount)}
          accent="from-blue-700 to-blue-900"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Tổng quá hạn"
          value={formatMoney(report.total_overdue_amount)}
          sub={`${formatPercent(report.total_overdue_amount / (report.total_debt_amount || 1))} tổng nợ`}
          accent="from-red-600 to-red-800"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Hóa đơn chưa thu"
          value={String(report.total_invoices_outstanding)}
          sub="hóa đơn UNPAID / PARTIAL"
          accent="from-orange-600 to-orange-800"
        />
      </div>

      {/* ── AGING BUCKETS SUMMARY BAR ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <BarChart3 size={15} className="text-blue-500" />
          Phân tích tuổi nợ – Tổng quan
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {report.bucket_summaries.map((b, idx) => (
            <div
              key={b.bucket_label}
              className={`rounded-lg p-3 ${BUCKET_COLORS[idx].light} border border-slate-100`}
            >
              <p className={`text-xs font-semibold ${BUCKET_COLORS[idx].text} mb-1`}>{b.bucket_label}</p>
              <p className="text-base font-bold text-slate-800">{formatMoney(b.total_amount)}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {b.percentage.toFixed(1)}% · {b.customer_count} đại lý
              </p>
              {/* Mini progress bar */}
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${BUCKET_COLORS[idx].bg} rounded-full`}
                  style={{ width: `${b.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FILTER BAR ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4 shadow-sm flex flex-wrap gap-2 items-center">
        <Filter size={14} className="text-slate-400" />

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="input-search-debt"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Tìm đại lý..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* NVKD */}
        <select
          id="select-filter-rep"
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={filterRep}
          onChange={(e) => setFilterRep(e.target.value)}
        >
          <option value="">Tất cả NVKD</option>
          {repOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Khu vực */}
        <select
          id="select-filter-region"
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
        >
          <option value="">Tất cả khu vực</option>
          {regionOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Risk */}
        <select
          id="select-filter-risk"
          className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value as RiskLevel | 'ALL')}
        >
          <option value="ALL">Tất cả mức rủi ro</option>
          <option value="CRITICAL">Nguy hiểm</option>
          <option value="HIGH">Cao</option>
          <option value="MEDIUM">Trung bình</option>
          <option value="LOW">Thấp</option>
        </select>

        {/* Ngày lập báo cáo */}
        <div className="flex items-center gap-1.5 text-sm text-slate-500 ml-auto">
          <Calendar size={13} />
          <input
            id="input-as-of-date"
            type="date"
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={loadReport} id="btn-apply-filter">
            Áp dụng
          </Button>
        </div>
      </div>

      {/* ── TABS ────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-slate-200 mb-4">
        {[
          { key: 'detail', label: `Chi tiết đại lý (${filteredCustomers.length})`, icon: <Users size={14} /> },
          { key: 'by_rep', label: `Theo NVKD (${report.by_sales_rep.length})`, icon: <UserCheck size={14} /> },
          { key: 'top_risk', label: `Top rủi ro (${report.top_risk_customers.length})`, icon: <ShieldAlert size={14} /> },
        ].map((tab) => (
          <button
            key={tab.key}
            id={`tab-debt-${tab.key}`}
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-700 bg-blue-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: CHI TIẾT ĐẠI LÝ ────────────────────────────────── */}
      {activeTab === 'detail' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Đại lý
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">
                    NVKD / Khu vực
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none"
                    onClick={() => toggleSort('total_debt')}
                  >
                    <span className="flex items-center justify-end gap-1">Tổng nợ <SortIcon col="total_debt" /></span>
                  </th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 hidden lg:table-cell">Chưa đến hạn</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-yellow-600 hidden lg:table-cell">1-30n</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-orange-600 hidden lg:table-cell">31-60n</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-red-500 hidden lg:table-cell">61-90n</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-red-800 hidden lg:table-cell">&gt;90n</th>
                  <th
                    className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none"
                    onClick={() => toggleSort('overdue_total')}
                  >
                    <span className="flex items-center justify-end gap-1">Quá hạn <SortIcon col="overdue_total" /></span>
                  </th>
                  <th
                    className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none"
                    onClick={() => toggleSort('risk_level')}
                  >
                    <span className="flex items-center justify-center gap-1">Rủi ro <SortIcon col="risk_level" /></span>
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-semibold text-slate-500 hidden xl:table-cell cursor-pointer hover:text-slate-700 select-none"
                    onClick={() => toggleSort('oldest_overdue_days')}
                  >
                    <span className="flex items-center justify-end gap-1">Quá hạn lâu nhất <SortIcon col="oldest_overdue_days" /></span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Không có dữ liệu công nợ phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((row) => (
                    <tr
                      key={row.customer_id}
                      className={`hover:bg-slate-50 transition-colors ${
                        row.risk_level === 'CRITICAL'
                          ? 'bg-red-50'
                          : row.risk_level === 'HIGH'
                          ? 'bg-orange-50'
                          : ''
                      }`}
                    >
                      {/* Đại lý */}
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800 text-sm leading-tight">
                          {row.customer_name}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {row.customer_id} {row.customer_code && `· ${row.customer_code}`}
                        </div>
                        <div className="mt-1.5">
                          <AgingBar row={row} />
                        </div>
                      </td>

                      {/* NVKD / Khu vực */}
                      <td className="px-3 py-3 hidden md:table-cell">
                        <div className="text-xs text-slate-600">
                          {row.assigned_sales_rep || <span className="text-slate-300">Chưa phân công</span>}
                        </div>
                        {row.region && (
                          <div className="text-xs text-slate-400">{row.region}</div>
                        )}
                      </td>

                      {/* Tổng nợ */}
                      <td className="px-3 py-3 text-right font-semibold text-slate-800">
                        {formatMoney(row.total_debt)}
                      </td>

                      {/* Buckets */}
                      <td className="px-2 py-3 text-right text-xs text-blue-600 hidden lg:table-cell">
                        {row.current_amount > 0 ? formatMoney(row.current_amount) : <span className="text-slate-200">–</span>}
                      </td>
                      <td className="px-2 py-3 text-right text-xs text-yellow-600 hidden lg:table-cell">
                        {row.bucket_1_30 > 0 ? formatMoney(row.bucket_1_30) : <span className="text-slate-200">–</span>}
                      </td>
                      <td className="px-2 py-3 text-right text-xs text-orange-600 hidden lg:table-cell">
                        {row.bucket_31_60 > 0 ? formatMoney(row.bucket_31_60) : <span className="text-slate-200">–</span>}
                      </td>
                      <td className="px-2 py-3 text-right text-xs text-red-500 hidden lg:table-cell">
                        {row.bucket_61_90 > 0 ? formatMoney(row.bucket_61_90) : <span className="text-slate-200">–</span>}
                      </td>
                      <td className="px-2 py-3 text-right text-xs text-red-800 hidden lg:table-cell">
                        {row.bucket_over_90 > 0 ? formatMoney(row.bucket_over_90) : <span className="text-slate-200">–</span>}
                      </td>

                      {/* Tổng quá hạn */}
                      <td className="px-3 py-3 text-right">
                        {row.overdue_total > 0 ? (
                          <div>
                            <div className="font-bold text-red-600">{formatMoney(row.overdue_total)}</div>
                            <div className="text-xs text-slate-400">{formatPercent(row.overdue_ratio)}</div>
                          </div>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">✓ Đúng hạn</span>
                        )}
                      </td>

                      {/* Mức rủi ro */}
                      <td className="px-3 py-3 text-center">
                        <RiskBadge level={row.risk_level} />
                      </td>

                      {/* Quá hạn lâu nhất */}
                      <td className="px-3 py-3 text-right text-xs hidden xl:table-cell">
                        {row.oldest_overdue_days > 0 ? (
                          <div>
                            <span className="font-semibold text-red-600">{row.oldest_overdue_days} ngày</span>
                            {row.oldest_invoice_id && (
                              <div className="text-slate-400">{row.oldest_invoice_id}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">–</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Tổng cộng */}
              {filteredCustomers.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr>
                    <td className="px-3 py-3 font-bold text-slate-700 text-sm">
                      Tổng cộng ({filteredCustomers.length} đại lý)
                    </td>
                    <td className="hidden md:table-cell" />
                    <td className="px-3 py-3 text-right font-bold text-slate-800">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.total_debt, 0))}
                    </td>
                    <td className="px-2 py-3 text-right text-xs font-semibold text-blue-600 hidden lg:table-cell">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.current_amount, 0))}
                    </td>
                    <td className="px-2 py-3 text-right text-xs font-semibold text-yellow-600 hidden lg:table-cell">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.bucket_1_30, 0))}
                    </td>
                    <td className="px-2 py-3 text-right text-xs font-semibold text-orange-600 hidden lg:table-cell">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.bucket_31_60, 0))}
                    </td>
                    <td className="px-2 py-3 text-right text-xs font-semibold text-red-500 hidden lg:table-cell">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.bucket_61_90, 0))}
                    </td>
                    <td className="px-2 py-3 text-right text-xs font-semibold text-red-800 hidden lg:table-cell">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.bucket_over_90, 0))}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-red-600">
                      {formatMoney(filteredCustomers.reduce((s, r) => s + r.overdue_total, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: THEO NVKD ──────────────────────────────────────── */}
      {activeTab === 'by_rep' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nhân viên phụ trách</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Số đại lý</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Tổng dư nợ</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-blue-500 hidden md:table-cell">Chưa đến hạn</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-yellow-600 hidden md:table-cell">1-30n</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-orange-600 hidden md:table-cell">31-60n</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-red-500 hidden md:table-cell">61-90n</th>
                  <th className="px-2 py-3 text-right text-xs font-semibold text-red-800 hidden md:table-cell">&gt;90n</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-red-600 uppercase">Tổng quá hạn</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Tỷ lệ QH</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-red-500 uppercase">ĐL rủi ro cao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.by_sales_rep.map((rep) => (
                  <tr key={rep.sales_rep_name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{rep.sales_rep_name}</td>
                    <td className="px-3 py-3 text-right">{rep.customer_count}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">{formatMoney(rep.total_debt)}</td>
                    <td className="px-2 py-3 text-right text-xs text-blue-600 hidden md:table-cell">{formatMoney(rep.current_amount)}</td>
                    <td className="px-2 py-3 text-right text-xs text-yellow-600 hidden md:table-cell">{rep.bucket_1_30 > 0 ? formatMoney(rep.bucket_1_30) : '–'}</td>
                    <td className="px-2 py-3 text-right text-xs text-orange-600 hidden md:table-cell">{rep.bucket_31_60 > 0 ? formatMoney(rep.bucket_31_60) : '–'}</td>
                    <td className="px-2 py-3 text-right text-xs text-red-500 hidden md:table-cell">{rep.bucket_61_90 > 0 ? formatMoney(rep.bucket_61_90) : '–'}</td>
                    <td className="px-2 py-3 text-right text-xs text-red-800 hidden md:table-cell">{rep.bucket_over_90 > 0 ? formatMoney(rep.bucket_over_90) : '–'}</td>
                    <td className="px-3 py-3 text-right font-bold text-red-600">{formatMoney(rep.overdue_total)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-semibold ${rep.overdue_ratio > 0.5 ? 'text-red-600' : rep.overdue_ratio > 0.2 ? 'text-orange-500' : 'text-green-600'}`}>
                        {formatPercent(rep.overdue_ratio)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {rep.high_risk_customers > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 font-bold text-sm">
                          {rep.high_risk_customers}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: TOP RỦI RO ─────────────────────────────────────── */}
      {activeTab === 'top_risk' && (
        <div className="space-y-3">
          {report.top_risk_customers.length === 0 ? (
            <div className="bg-white rounded-xl border border-green-200 p-8 text-center text-green-600">
              <CheckCircle size={32} className="mx-auto mb-2" />
              <p className="font-semibold">Không có đại lý nào ở mức rủi ro cao!</p>
              <p className="text-sm text-slate-400 mt-1">Tất cả công nợ đang trong hạn hoặc mức thấp.</p>
            </div>
          ) : (
            report.top_risk_customers.map((row, idx) => (
              <div
                key={row.customer_id}
                className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                  row.risk_level === 'CRITICAL'
                    ? 'border-red-300 bg-red-50'
                    : row.risk_level === 'HIGH'
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-yellow-200 bg-yellow-50'
                }`}
              >
                {/* Rank */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white shadow flex items-center justify-center font-bold text-slate-600 text-lg">
                  {idx + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-base">{row.customer_name}</span>
                    <RiskBadge level={row.risk_level} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {row.customer_id}
                    {row.region && ` · ${row.region}`}
                    {row.assigned_sales_rep && ` · NVKD: ${row.assigned_sales_rep}`}
                  </div>
                  {row.oldest_invoice_id && (
                    <div className="text-xs text-red-600 mt-0.5">
                      HĐ cũ nhất: <strong>{row.oldest_invoice_id}</strong> – quá hạn <strong>{row.oldest_overdue_days} ngày</strong>
                    </div>
                  )}
                  <div className="mt-2">
                    <AgingBar row={row} />
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex gap-4 text-right">
                  <div>
                    <div className="text-xs text-slate-400 uppercase">Tổng nợ</div>
                    <div className="font-bold text-slate-700">{formatMoney(row.total_debt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-red-400 uppercase">Quá hạn</div>
                    <div className="font-bold text-red-600">{formatMoney(row.overdue_total)}</div>
                    <div className="text-xs text-slate-400">{formatPercent(row.overdue_ratio)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </PageContainer>
  );
};
