import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Scale,
  Download,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  DollarSign,
  TrendingDown,
  Layers,
  ChevronRight,
  Eye,
  X,
  FileSpreadsheet,
  Clock,
  UserCheck,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatCurrency, formatNumber, formatDateTime } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';
import {
  AgencyDebtReportItem,
  AgencyDebtSummary,
  AgencyInvoiceDetail,
} from '../../types/AgencyDebt';
import { agencyDebtService } from '../../services/agencyDebtService';

export const AgencyDebtAgingReport: React.FC = () => {
  const { showToast } = useToast();

  // Dữ liệu báo cáo
  const [items, setItems] = useState<AgencyDebtReportItem[]>([]);
  const [summary, setSummary] = useState<AgencyDebtSummary>({
    total_customers: 0,
    total_receivable: 0,
    total_paid: 0,
    total_debt: 0,
    total_debt_0_30: 0,
    total_debt_31_60: 0,
    total_debt_61_90: 0,
    total_debt_over_90: 0,
    total_overdue_debt: 0,
    overdue_customers_count: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  // Bộ lọc (SCRUM-719 & SCRUM-720)
  const [search, setSearch] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [customerGroup, setCustomerGroup] = useState<string>('');
  const [agingGroup, setAgingGroup] = useState<string>('');
  const [onlyOverdue, setOnlyOverdue] = useState<boolean>(false);
  const [asOfDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Modal xem chi tiết hóa đơn (Drill-down)
  const [selectedCustomer, setSelectedCustomer] = useState<AgencyDebtReportItem | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<AgencyInvoiceDetail[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);

  // Tải dữ liệu báo cáo
  const fetchReport = useCallback(
    async (force: boolean = false) => {
      setLoading(true);
      try {
        const res = await agencyDebtService.getAgencyDebtReport(
          {
            search: search.trim() || undefined,
            region: region || undefined,
            customer_group: customerGroup || undefined,
            aging_group: agingGroup || undefined,
            only_overdue: onlyOverdue,
            as_of_date: asOfDate,
            has_debt_only: true,
          },
          force
        );
        setItems(res.items);
        setSummary(res.summary);
      } catch (err: any) {
        showToast(err.message || 'Không thể tải báo cáo sổ công nợ', 'error');
      } finally {
        setLoading(false);
      }
    },
    [search, region, customerGroup, agingGroup, onlyOverdue, asOfDate, showToast]
  );

  useEffect(() => {
    fetchReport(false);
  }, [fetchReport]);

  const handleRefresh = () => {
    agencyDebtService.invalidateCache();
    fetchReport(true);
    showToast('Đã làm mới dữ liệu sổ công nợ!', 'success');
  };

  // Xuất Excel (SCRUM-724)
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await agencyDebtService.exportAgencyDebtExcel({
        search: search.trim() || undefined,
        region: region || undefined,
        customer_group: customerGroup || undefined,
        aging_group: agingGroup || undefined,
        only_overdue: onlyOverdue,
        as_of_date: asOfDate,
        has_debt_only: true,
      });
      showToast('Đã xuất file Excel sổ công nợ thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi tải file Excel báo cáo công nợ', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Mở modal drilldown chi tiết hóa đơn của 1 đại lý
  const handleOpenDetail = async (item: AgencyDebtReportItem) => {
    setSelectedCustomer(item);
    setLoadingInvoices(true);
    try {
      const res = await agencyDebtService.getAgencyDebtInvoices(item.customer_id, asOfDate);
      setCustomerInvoices(res.invoices);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách hóa đơn đại lý', 'error');
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Tính phần trăm phân bổ tuổi nợ cho KPI Bar
  const agingPercentages = useMemo(() => {
    const total = summary.total_debt || 1;
    return {
      p0_30: Math.round((summary.total_debt_0_30 / total) * 100),
      p31_60: Math.round((summary.total_debt_31_60 / total) * 100),
      p61_90: Math.round((summary.total_debt_61_90 / total) * 100),
      pOver90: Math.round((summary.total_debt_over_90 / total) * 100),
    };
  }, [summary]);

  return (
    <PageContainer
      title="Sổ Công Nợ & Phân Tích Tuổi Nợ Theo Đại Lý"
      subtitle="Theo dõi chi tiết số dư phải thu, phân nhóm tuổi nợ (0–30, 31–60, 61–90, >90 ngày) và kiểm soát nợ quá hạn"
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={handleExportExcel}
          disabled={exporting}
          leftIcon={
            exporting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            )
          }
        >
          {exporting ? 'Đang xuất Excel...' : 'Xuất Excel'}
        </Button>
      }
    >
      {/* 1. KHỐI 4 THẺ TỔNG HỢP CHỈ TIÊU (KPI CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tổng Phải Thu */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tổng Phải Thu (Doanh số)
            </span>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {formatCurrency(summary.total_receivable)}
            </p>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Tổng {summary.total_customers} đại lý phát sinh nợ
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Tổng Đã Thu */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tổng Đã Thu Hồi
            </span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(summary.total_paid)}
            </p>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Tỷ lệ thu hồi:{' '}
              {summary.total_receivable > 0
                ? Math.round((summary.total_paid / summary.total_receivable) * 100)
                : 0}
              %
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Tổng Còn Nợ */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Dư Nợ Hiện Tại
            </span>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {formatCurrency(summary.total_debt)}
            </p>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-indigo-400" />
              Chiếm{' '}
              {summary.total_receivable > 0
                ? Math.round((summary.total_debt / summary.total_receivable) * 100)
                : 0}
              % doanh số
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        {/* Nợ Quá Hạn Cần Đòi (Hỗ trợ click để bật/tắt lọc nhanh) */}
        <div
          onClick={() => setOnlyOverdue(!onlyOverdue)}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-start justify-between select-none ${
            onlyOverdue
              ? 'bg-rose-100/90 dark:bg-rose-950/90 border-rose-500 ring-2 ring-rose-500 shadow-md'
              : 'bg-white dark:bg-slate-900 border-red-200 dark:border-red-900/60 hover:border-red-400 bg-red-50/20'
          }`}
          title="Bấm vào thẻ này để BẬT / TẮT bộ lọc chỉ hiển thị các đại lý quá hạn"
        >
          <div>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Tổng Nợ Quá Hạn (Cảnh báo)
            </span>
            <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
              {formatCurrency(summary.total_overdue_debt)}
            </p>
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mt-1 flex items-center gap-1.5">
              <span>{summary.overdue_customers_count} đại lý có khoản trễ hạn</span>
              <span className="text-[10px] bg-red-200/80 dark:bg-red-900/80 text-red-800 dark:text-red-200 px-1.5 py-0.2 rounded font-bold">
                {onlyOverdue ? 'Đang lọc' : 'Click để lọc'}
              </span>
            </p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            onlyOverdue ? 'bg-rose-600 text-white' : 'bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. THANH PHÂN BỔ 4 NHÓM TUỔI NỢ TRỰC QUAN (SCRUM-717 / SCRUM-721) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-500" />
              Cơ Cấu Phân Bổ Tuổi Nợ Hệ Thống
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Phân loại nợ theo số ngày phát sinh: 0–30 ngày (an toàn), 31–60 ngày (theo dõi), 61–90 ngày (nguy cơ), &gt;90 ngày (khó đòi)
            </p>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Ngày chốt công nợ:{' '}
            <span className="font-bold text-slate-800 dark:text-slate-200">{asOfDate}</span>
          </div>
        </div>

        {/* Thanh ProgressBar 4 màu */}
        <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${agingPercentages.p0_30}%` }}
            className="h-full bg-emerald-500 transition-all duration-500"
            title={`0-30 ngày: ${formatCurrency(summary.total_debt_0_30)} (${agingPercentages.p0_30}%)`}
          />
          <div
            style={{ width: `${agingPercentages.p31_60}%` }}
            className="h-full bg-sky-500 transition-all duration-500"
            title={`31-60 ngày: ${formatCurrency(summary.total_debt_31_60)} (${agingPercentages.p31_60}%)`}
          />
          <div
            style={{ width: `${agingPercentages.p61_90}%` }}
            className="h-full bg-amber-500 transition-all duration-500"
            title={`61-90 ngày: ${formatCurrency(summary.total_debt_61_90)} (${agingPercentages.p61_90}%)`}
          />
          <div
            style={{ width: `${agingPercentages.pOver90}%` }}
            className="h-full bg-rose-500 transition-all duration-500"
            title={`>90 ngày: ${formatCurrency(summary.total_debt_over_90)} (${agingPercentages.pOver90}%)`}
          />
        </div>

        {/* 4 Cards con hiển thị giá trị cụ thể */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span>0–30 ngày</span>
              <span>{agingPercentages.p0_30}%</span>
            </div>
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(summary.total_debt_0_30)}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/40">
            <div className="flex items-center justify-between text-xs font-semibold text-sky-800 dark:text-sky-300">
              <span>31–60 ngày</span>
              <span>{agingPercentages.p31_60}%</span>
            </div>
            <p className="text-sm font-black text-sky-700 dark:text-sky-400 mt-1">
              {formatCurrency(summary.total_debt_31_60)}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
              <span>61–90 ngày</span>
              <span>{agingPercentages.p61_90}%</span>
            </div>
            <p className="text-sm font-black text-amber-700 dark:text-amber-400 mt-1">
              {formatCurrency(summary.total_debt_61_90)}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-800 dark:text-rose-300">
              <span>Trên 90 ngày</span>
              <span>{agingPercentages.pOver90}%</span>
            </div>
            <p className="text-sm font-black text-rose-700 dark:text-rose-400 mt-1">
              {formatCurrency(summary.total_debt_over_90)}
            </p>
          </div>
        </div>
      </div>

      {/* 3. THANH BỘ LỌC TÌM KIẾM TỐI ƯU (SCRUM-719 & SCRUM-720) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Ô tìm kiếm */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã, tên đại lý hoặc SĐT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          {/* Lọc Khu vực */}
          <div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tất cả khu vực</option>
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Nam">Miền Nam</option>
            </select>
          </div>

          {/* Lọc Nhóm khách hàng */}
          <div>
            <select
              value={customerGroup}
              onChange={(e) => setCustomerGroup(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tất cả nhóm</option>
              <option value="TIER_1">Đại lý Cấp 1 (Tier 1)</option>
              <option value="TIER_2">Đại lý Cấp 2 (Tier 2)</option>
              <option value="WHOLESALE">Đại lý Bán buôn</option>
              <option value="VIP">Khách hàng VIP</option>
              <option value="RETAIL">Bán lẻ</option>
            </select>
          </div>

          {/* Lọc theo nhóm tuổi nợ */}
          <div>
            <select
              value={agingGroup}
              onChange={(e) => setAgingGroup(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tất cả tuổi nợ</option>
              <option value="0_30">Nợ 0–30 ngày</option>
              <option value="31_60">Nợ 31–60 ngày</option>
              <option value="61_90">Nợ 61–90 ngày</option>
              <option value="over_90">Nợ &gt;90 ngày (Khó đòi)</option>
            </select>
          </div>
        </div>

        {/* BỘ LỌC QUÁ HẠN NỔI BẬT (SCRUM-719 & SCRUM-720) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Bộ lọc quá hạn:
            </span>
            <button
              type="button"
              onClick={() => setOnlyOverdue(!onlyOverdue)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border shadow-sm ${
                onlyOverdue
                  ? 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-400/50 shadow-rose-500/20'
                  : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${onlyOverdue ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
              <span>Chỉ hiển thị đại lý có nợ QUÁ HẠN</span>
              <span
                className={`ml-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                  onlyOverdue
                    ? 'bg-white/20 text-white'
                    : 'bg-rose-200/80 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                }`}
              >
                {onlyOverdue ? '✓ ĐANG BẬT LỌC' : 'TẮT'}
              </span>
            </button>
            {onlyOverdue && (
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold italic animate-pulse">
                (Đang lọc ưu tiên thu hồi nợ trễ hạn)
              </span>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Hiển thị <span className="font-bold text-slate-900 dark:text-white px-1">{items.length}</span> đại lý
          </div>
        </div>
      </div>

      {/* 4. BẢNG DỮ LIỆU SỔ CÔNG NỢ KÈM DÒNG TỔNG CỘNG CHÂN BẢNG (SCRUM-720 & SCRUM-721) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            {/* Table Header */}
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3 w-10 text-center">STT</th>
                <th className="py-3 px-3">Mã ĐL</th>
                <th className="py-3 px-3 min-w-[200px]">Tên Đại Lý</th>
                <th className="py-3 px-3">Khu Vực</th>
                <th className="py-3 px-3">NVKD Phụ Trách</th>
                <th className="py-3 px-3 text-right">Hạn Mức (VNĐ)</th>
                <th className="py-3 px-3 text-right text-blue-700 dark:text-blue-400">Phải Thu</th>
                <th className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400">Đã Thu</th>
                <th className="py-3 px-3 text-right font-black text-slate-900 dark:text-white bg-slate-100/60 dark:bg-slate-800/40">
                  Còn Nợ
                </th>
                <th className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-50/20">
                  0–30 Ngày
                </th>
                <th className="py-3 px-3 text-right text-sky-600 dark:text-sky-400 bg-sky-50/20">
                  31–60 Ngày
                </th>
                <th className="py-3 px-3 text-right text-amber-600 dark:text-amber-400 bg-amber-50/20">
                  61–90 Ngày
                </th>
                <th className="py-3 px-3 text-right text-rose-600 dark:text-rose-400 bg-rose-50/20 font-bold">
                  &gt;90 Ngày
                </th>
                <th className="py-3 px-3 text-right text-red-600 dark:text-red-400 font-black">
                  Nợ Quá Hạn
                </th>
                <th className="py-3 px-3 text-center">Tình Trạng</th>
                <th className="py-3 px-3 text-center w-16">Chi Tiết</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-primary-500" />
                    Đang tải dữ liệu sổ công nợ theo đại lý...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-slate-400">
                    Không tìm thấy đại lý nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr
                    key={item.customer_id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      item.is_overdue
                        ? 'bg-red-50/15 dark:bg-red-950/10'
                        : index % 2 === 0
                        ? 'bg-transparent'
                        : 'bg-slate-50/30 dark:bg-slate-800/20'
                    }`}
                  >
                    <td className="py-3 px-3 text-center text-slate-400">{index + 1}</td>
                    <td className="py-3 px-3 font-bold text-primary-600 dark:text-primary-400">
                      {item.customer_code}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                      <div>{item.customer_name}</div>
                      <div className="text-[11px] font-normal text-slate-400">
                        {item.phone || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {item.region || 'Chưa gán'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {item.assigned_sales_rep || '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                      {formatNumber(item.credit_limit)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium">
                      {formatNumber(item.total_receivable)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      {formatNumber(item.total_paid)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white bg-slate-100/50 dark:bg-slate-800/40">
                      {formatNumber(item.total_debt)}
                    </td>
                    {/* 4 Nhóm tuổi nợ */}
                    <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400 font-medium">
                      {item.debt_0_30 > 0 ? formatNumber(item.debt_0_30) : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-sky-700 dark:text-sky-400 font-medium">
                      {item.debt_31_60 > 0 ? formatNumber(item.debt_31_60) : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-700 dark:text-amber-400 font-medium">
                      {item.debt_61_90 > 0 ? formatNumber(item.debt_61_90) : '-'}
                    </td>
                    <td className="py-3 px-3 text-right text-rose-700 dark:text-rose-400 font-bold">
                      {item.debt_over_90 > 0 ? formatNumber(item.debt_over_90) : '-'}
                    </td>
                    {/* Nợ quá hạn */}
                    <td className="py-3 px-3 text-right font-black text-red-600 dark:text-red-400">
                      {item.overdue_debt > 0 ? formatNumber(item.overdue_debt) : '-'}
                    </td>
                    {/* Trạng thái quá hạn */}
                    <td className="py-3 px-3 text-center">
                      {item.is_overdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-900/60">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                          Trễ {item.max_overdue_days} ngày
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Trong hạn
                        </span>
                      )}
                    </td>
                    {/* Nút xem chi tiết Drill-down */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleOpenDetail(item)}
                        className="p-1 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Xem chi tiết hóa đơn còn nợ"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* DÒNG TỔNG CỘNG CHÂN BẢNG (SCRUM-721 - TIÊU CHÍ AC CỐT LÕI) */}
            <tfoot className="bg-slate-100 dark:bg-slate-800/95 border-t-2 border-slate-300 dark:border-slate-600 font-black text-slate-900 dark:text-white sticky bottom-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <tr>
                <td colSpan={5} className="py-3.5 px-3 uppercase tracking-wider text-left text-xs">
                  TỔNG CỘNG ({summary.total_customers} đại lý)
                </td>
                <td className="py-3.5 px-3 text-right text-slate-400">-</td>
                <td className="py-3.5 px-3 text-right text-blue-700 dark:text-blue-400">
                  {formatCurrency(summary.total_receivable)}
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(summary.total_paid)}
                </td>
                <td className="py-3.5 px-3 text-right text-slate-900 dark:text-white bg-slate-200/50 dark:bg-slate-700/50 font-black">
                  {formatCurrency(summary.total_debt)}
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(summary.total_debt_0_30)}
                </td>
                <td className="py-3.5 px-3 text-right text-sky-700 dark:text-sky-400">
                  {formatCurrency(summary.total_debt_31_60)}
                </td>
                <td className="py-3.5 px-3 text-right text-amber-700 dark:text-amber-400">
                  {formatCurrency(summary.total_debt_61_90)}
                </td>
                <td className="py-3.5 px-3 text-right text-rose-700 dark:text-rose-400">
                  {formatCurrency(summary.total_debt_over_90)}
                </td>
                <td className="py-3.5 px-3 text-right text-red-600 dark:text-red-400">
                  {formatCurrency(summary.total_overdue_debt)}
                </td>
                <td className="py-3.5 px-3 text-center text-xs font-bold text-red-600 dark:text-red-400">
                  {summary.overdue_customers_count} đại lý trễ
                </td>
                <td className="py-3.5 px-3 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. MODAL DRILL-DOWN CHI TIẾT HÓA ĐƠN CỦA ĐẠI LÝ */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Chi Tiết Hóa Đơn & Tuổi Nợ: {selectedCustomer.customer_name}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400 border border-primary-200">
                    {selectedCustomer.customer_code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Hạn mức: {formatCurrency(selectedCustomer.credit_limit)} | Số ngày nợ tối đa:{' '}
                  {selectedCustomer.max_debt_days} ngày | Khu vực: {selectedCustomer.region || '-'}
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Thống kê nhanh của đại lý */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400">Tổng phải thu:</span>
                  <div className="text-sm font-bold text-slate-800 dark:text-white mt-0.5">
                    {formatCurrency(selectedCustomer.total_receivable)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Đã thanh toán:</span>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(selectedCustomer.total_paid)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Còn nợ lại:</span>
                  <div className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
                    {formatCurrency(selectedCustomer.total_debt)}
                  </div>
                </div>
              </div>

              {/* Bảng danh sách hóa đơn */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Số Hóa Đơn</th>
                      <th className="py-2.5 px-3">Ngày Phát Hành</th>
                      <th className="py-2.5 px-3">Hạn Trả</th>
                      <th className="py-2.5 px-3 text-right">Phải Thu</th>
                      <th className="py-2.5 px-3 text-right">Đã Thu</th>
                      <th className="py-2.5 px-3 text-right font-bold">Còn Nợ</th>
                      <th className="py-2.5 px-3 text-center">Tuổi Nợ</th>
                      <th className="py-2.5 px-3 text-center">Tình Trạng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                    {loadingInvoices ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                          Đang tải danh sách hóa đơn...
                        </td>
                      </tr>
                    ) : customerInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Đại lý hiện không có hóa đơn nào còn nợ.
                        </td>
                      </tr>
                    ) : (
                      customerInvoices.map((inv) => (
                        <tr
                          key={inv.invoice_id}
                          className={inv.is_overdue ? 'bg-red-50/20 dark:bg-red-950/10' : ''}
                        >
                          <td className="py-2.5 px-3 font-bold text-primary-600">
                            {inv.invoice_id}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {inv.issued_at.split('T')[0]}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {inv.due_date.split('T')[0]}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {formatNumber(inv.total_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-600">
                            {formatNumber(inv.paid_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                            {formatNumber(inv.remaining_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                inv.aging_bucket === '0_30'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : inv.aging_bucket === '31_60'
                                  ? 'bg-sky-100 text-sky-700'
                                  : inv.aging_bucket === '61_90'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {inv.aging_days} ngày
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {inv.is_overdue ? (
                              <span className="text-[11px] font-bold text-red-600">
                                Quá hạn {inv.days_overdue} ngày
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-medium">
                                Trong hạn
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
