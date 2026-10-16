import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Percent,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
  Award,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ReportFilterBar } from '../../components/reports/ReportFilterBar';
import { ExportExcelButton } from '../../components/reports/ExportExcelButton';
import { DeltaCell } from '../../components/reports/DeltaCell';
import {
  SalesReportFilter,
  SalesReportResult,
  SalesReportRow,
  ReportDimension,
} from '../../types/SalesReport';
import { salesReportService } from '../../services/salesReportService';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const CHART_COLORS = [
  '#4f46e5',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#3b82f6',
  '#14b8a6',
];

export const SalesMultiDimReport: React.FC = () => {
  const [filter, setFilter] = useState<SalesReportFilter>({
    periodType: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    dimension: 'staff',
    compareWithPrev: true,
    comparisonMode: 'prev_period',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [reportResult, setReportResult] = useState<SalesReportResult | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await salesReportService.getMultiDimReport(filter);
      setReportResult(data);
    } catch (err) {
      console.error('[SalesMultiDimReport] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [filter.dimension, filter.periodType]);

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maxRevenue = useMemo(() => {
    if (!reportResult?.rows.length) return 1;
    return Math.max(...reportResult.rows.map((r) => r.revenue), 1);
  }, [reportResult]);

  const chartData = useMemo(() => {
    if (!reportResult?.rows) return [];
    return reportResult.rows.slice(0, 8).map((r) => ({
      name: r.label.length > 18 ? r.label.slice(0, 18) + '...' : r.label,
      fullName: r.label,
      revenue: r.revenue,
      orders: r.orders,
    }));
  }, [reportResult]);

  const dimensionNameMap: Record<ReportDimension, string> = {
    staff: 'Nhân viên kinh doanh',
    territory: 'Khu vực thị trường',
    agent: 'Khách hàng / Đại lý',
    category: 'Nhóm ngành hàng',
    sku: 'Mã hàng SKU',
  };

  const hasComparison =
    Boolean(reportResult?.filter.comparisonMode && reportResult.filter.comparisonMode !== 'none');

  return (
    <PageContainer
      title="Báo Cáo Doanh Số Đa Chiều"
      subtitle={`Phân tích chuyên sâu doanh số theo ${dimensionNameMap[filter.dimension]}`}
      actions={
        <ExportExcelButton
          id="btn-export-sales-multidim"
          label="Xuất Excel Báo Cáo"
          onExport={async () => {
            if (reportResult) {
              await salesReportService.exportToExcel(reportResult);
            }
          }}
          disabled={!reportResult || reportResult.rows.length === 0 || loading}
          variant="primary"
        />
      }
    >
      <div className="space-y-6">
        {/* Filter Controls (SCRUM-819 & SCRUM-821) */}
        <ReportFilterBar
          value={filter}
          onChange={setFilter}
          onApply={fetchReport}
          loading={loading}
        />

        {/* 4 Summary Cards (SCRUM-815 & SCRUM-821) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Tổng doanh số */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tổng Doanh Số
              </span>
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-7 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                formatCurrency(reportResult?.summary.totalRevenue || 0)
              )}
            </div>
            {hasComparison && reportResult?.summary.totalRevenueDelta !== undefined && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <DeltaCell
                  delta={reportResult.summary.totalRevenueDelta}
                  pct={reportResult.summary.totalRevenueGrowthPct || 0}
                  format="currency"
                  size="sm"
                />
                <span className="text-xs text-slate-400">vs kỳ trước</span>
              </div>
            )}
          </div>

          {/* Card 2: Tổng đơn & Sản lượng */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Đơn Hàng & Sản Lượng
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-7 w-24 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${formatNumber(reportResult?.summary.totalOrders || 0)} đơn`
              )}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span>Sản lượng:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {formatNumber(reportResult?.summary.totalQuantity || 0)}
              </span>
              <span>sản phẩm</span>
            </div>
          </div>

          {/* Card 3: Giá trị TB mỗi đơn (AOV) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Giá Trị TB Đơn (AOV)
              </span>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-7 w-28 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                formatCurrency(reportResult?.summary.avgOrderValue || 0)
              )}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                Top 1: <b className="text-slate-700 dark:text-slate-200">{reportResult?.summary.topDimension || '---'}</b>
              </span>
            </div>
          </div>

          {/* Card 4: Biên lợi nhuận gộp */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Biên Lợi Nhuận Gộp
              </span>
              <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl lg:text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-7 w-20 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${(reportResult?.summary.avgGrossMarginPct || 0).toFixed(1)}%`
              )}
            </div>
            {hasComparison && reportResult?.summary.prevAvgGrossMarginPct !== undefined && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <DeltaCell
                  delta={(reportResult.summary.avgGrossMarginPct || 0) - (reportResult.summary.prevAvgGrossMarginPct || 0)}
                  pct={(reportResult.summary.avgGrossMarginPct || 0) - (reportResult.summary.prevAvgGrossMarginPct || 0)}
                  format="percent"
                  isPercentagePoints={true}
                  size="sm"
                />
                <span className="text-xs text-slate-400">vs kỳ trước</span>
              </div>
            )}
          </div>
        </div>

        {/* Visual Chart: Top Dimensions */}
        {chartData.length > 0 && !loading && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-500" />
                <span>Biểu đồ Top {chartData.length} {dimensionNameMap[filter.dimension]} có doanh số cao nhất</span>
              </h3>
              <span className="text-xs text-slate-400">Đơn vị: VND</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tickFormatter={(val) => `${(val / 1000000).toFixed(0)}Tr`}
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={11}
                    width={120}
                  />
                  <Tooltip
                    formatter={(val: number) => [formatCurrency(val), 'Doanh số']}
                    labelFormatter={(label) => `Đơn vị: ${label}`}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                      border: 'none',
                    }}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Main Data Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Bảng Số Liệu Chi Tiết Theo {dimensionNameMap[filter.dimension]}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click vào dòng có biểu tượng mở rộng để xem chi tiết các mặt hàng bán chạy
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Tổng số dòng: <b>{reportResult?.rows.length || 0}</b>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">STT</th>
                  <th className="py-3 px-4 min-w-[200px]">
                    {dimensionNameMap[filter.dimension]}
                  </th>
                  <th className="py-3 px-3 text-right">Số Đơn</th>
                  <th className="py-3 px-3 text-right">Sản Lượng</th>
                  <th className="py-3 px-4 text-right min-w-[180px]">Doanh Số Thuần</th>
                  <th className="py-3 px-3 text-right">TB Đơn (AOV)</th>
                  <th className="py-3 px-3 text-right">Biên LN Gộp</th>
                  {hasComparison && (
                    <>
                      <th className="py-3 px-3 text-right">Kỳ Trước</th>
                      <th className="py-3 px-4 text-center min-w-[140px]">Tăng Trưởng DS</th>
                      <th className="py-3 px-3 text-center">Tăng Trưởng SL</th>
                      <th className="py-3 px-3 text-right">Chênh Lệch Biên</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td colSpan={hasComparison ? 11 : 7} className="py-4 px-4">
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : !reportResult?.rows || reportResult.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={hasComparison ? 11 : 7}
                      className="py-12 text-center text-slate-400"
                    >
                      Không tìm thấy dữ liệu phát sinh trong kỳ báo cáo đã chọn.
                    </td>
                  </tr>
                ) : (
                  reportResult.rows.map((row, idx) => {
                    const isExpanded = expandedRows.has(row.id);
                    const pctOfMax = Math.round((row.revenue / maxRevenue) * 100);

                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            isExpanded ? 'bg-primary-50/30 dark:bg-primary-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {row.topProducts && row.topProducts.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpand(row.id)}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                                  title="Xem top sản phẩm"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-primary-500" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white">
                                  {row.label}
                                </div>
                                {row.subLabel && (
                                  <div className="text-[11px] text-slate-400">
                                    {row.subLabel}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium">
                            {formatNumber(row.orders)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatNumber(row.quantity || 0)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {formatCurrency(row.revenue)}
                            </div>
                            {/* Visual Progress Bar */}
                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div
                                className="bg-primary-500 h-1.5 rounded-full"
                                style={{ width: `${pctOfMax}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                            {formatCurrency(row.avgOrderValue)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                              {(row.grossMarginPct || 0).toFixed(1)}%
                            </span>
                          </td>

                          {hasComparison && (
                            <>
                              <td className="py-3 px-3 text-right font-mono text-slate-500">
                                {formatCurrency(row.prevRevenue || 0)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <DeltaCell
                                  delta={row.revenueDelta || 0}
                                  pct={row.revenueGrowthPct || 0}
                                  format="currency"
                                  size="sm"
                                />
                              </td>
                              <td className="py-3 px-3 text-center">
                                <DeltaCell
                                  delta={row.quantityDelta || 0}
                                  pct={row.quantityGrowthPct || 0}
                                  format="number"
                                  showAbsolute={false}
                                  size="sm"
                                />
                              </td>
                              <td className="py-3 px-3 text-right font-mono">
                                <span
                                  className={`text-xs font-semibold ${
                                    (row.grossMarginPctDelta || 0) > 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : (row.grossMarginPctDelta || 0) < 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {(row.grossMarginPctDelta || 0) > 0 ? '+' : ''}
                                  {(row.grossMarginPctDelta || 0).toFixed(1)} pp
                                </span>
                              </td>
                            </>
                          )}
                        </tr>

                        {/* Expandable Drill-down Row */}
                        {isExpanded && row.topProducts && row.topProducts.length > 0 && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                            <td colSpan={hasComparison ? 11 : 7} className="py-3 px-6">
                              <div className="pl-6 border-l-2 border-primary-500 space-y-2">
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                  Top sản phẩm bán chạy nhất của {row.label}:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {row.topProducts.map((p, pIdx) => (
                                    <div
                                      key={pIdx}
                                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-sm"
                                    >
                                      <div className="truncate mr-2">
                                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                          {p.name}
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-400">
                                          {p.sku} • SL: {formatNumber(p.quantity)}
                                        </div>
                                      </div>
                                      <div className="font-mono font-bold text-primary-600 dark:text-primary-400 shrink-0">
                                        {formatCurrency(p.revenue)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Bold Total Row */}
              {reportResult && reportResult.rows.length > 0 && (
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                  <tr>
                    <td colSpan={2} className="py-3 px-4 text-right uppercase tracking-wider text-xs">
                      Tổng Cộng:
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatNumber(reportResult.summary.totalOrders)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatNumber(reportResult.summary.totalQuantity)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm text-primary-600 dark:text-primary-400">
                      {formatCurrency(reportResult.summary.totalRevenue)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatCurrency(reportResult.summary.avgOrderValue)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {(reportResult.summary.avgGrossMarginPct || 0).toFixed(1)}%
                    </td>

                    {hasComparison && (
                      <>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          {formatCurrency(reportResult.summary.prevTotalRevenue || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <DeltaCell
                            delta={reportResult.summary.totalRevenueDelta || 0}
                            pct={reportResult.summary.totalRevenueGrowthPct || 0}
                            format="currency"
                            size="sm"
                          />
                        </td>
                        <td className="py-3 px-3 text-center">—</td>
                        <td className="py-3 px-3 text-right font-mono">
                          {reportResult.summary.prevAvgGrossMarginPct !== undefined ? (
                            <span
                              className={`text-xs ${
                                (reportResult.summary.avgGrossMarginPct || 0) >=
                                (reportResult.summary.prevAvgGrossMarginPct || 0)
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {(
                                (reportResult.summary.avgGrossMarginPct || 0) -
                                (reportResult.summary.prevAvgGrossMarginPct || 0)
                              ).toFixed(1)}{' '}
                              pp
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
