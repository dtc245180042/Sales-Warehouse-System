import React, { useState, useEffect, useMemo } from 'react';
import {
  RotateCcw,
  Clock,
  DollarSign,
  AlertTriangle,
  Skull,
  Warehouse,
  FolderTree,
  Package,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ExportExcelButton } from '../../components/reports/ExportExcelButton';
import { TurnoverRatioBar } from '../../components/reports/TurnoverRatioBar';
import { SlowMovingBadge } from '../../components/reports/SlowMovingBadge';
import {
  InventoryTurnoverReportData,
  TurnoverFilter,
} from '../../types/InventoryTurnover';
import { inventoryTurnoverService } from '../../services/inventoryTurnoverService';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export const InventoryTurnoverReport: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'warehouse' | 'category' | 'sku'>('sku');
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<InventoryTurnoverReportData | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'warning' | 'alert' | 'dead'>('all');
  const [onlySlowMoving, setOnlySlowMoving] = useState<boolean>(false);

  // Expandable category rows
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await inventoryTurnoverService.getReport({
        search,
        warehouseId: selectedWarehouse === 'all' ? 'all' : Number(selectedWarehouse),
        categoryId: selectedCategory === 'all' ? 'all' : selectedCategory,
        severity: selectedSeverity,
        onlySlowMoving,
      });
      setReportData(data);
    } catch (err) {
      console.error('[InventoryTurnoverReport] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedWarehouse, selectedCategory, selectedSeverity, onlySlowMoving]);

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const filteredSkuList = useMemo(() => {
    if (!reportData?.bySku) return [];
    return reportData.bySku.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          s.sku.toLowerCase().includes(q) ||
          s.productName.toLowerCase().includes(q) ||
          s.categoryName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [reportData, search]);

  const getSeverityBadge = (severity: string, days: number) => {
    if (severity === 'dead') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <Skull className="w-3 h-3 text-rose-600 dark:text-rose-400" />
          <span>Tồn chết ({days}d)</span>
        </span>
      );
    }
    if (severity === 'alert') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
          <AlertTriangle className="w-3 h-3 text-orange-600 dark:text-orange-400" />
          <span>Cảnh báo ({days}d)</span>
        </span>
      );
    }
    if (severity === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Ít luân chuyển ({days}d)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400">
        Bình thường
      </span>
    );
  };

  return (
    <PageContainer
      title="Báo Cáo Tồn Kho & Vòng Quay Hàng"
      subtitle="Phân tích tốc độ quay vòng vốn, số ngày tồn (Days of Supply) và kiểm soát hàng ứ đọng"
      actions={
        <ExportExcelButton
          id="btn-export-inventory-turnover"
          label="Xuất Excel Báo Cáo"
          onExport={async () => {
            if (reportData) {
              await inventoryTurnoverService.exportToExcel(reportData, {
                warehouseId: selectedWarehouse === 'all' ? 'all' : Number(selectedWarehouse),
                categoryId: selectedCategory === 'all' ? 'all' : selectedCategory,
                severity: selectedSeverity,
              });
            }
          }}
          disabled={!reportData || reportData.bySku.length === 0 || loading}
          variant="primary"
        />
      }
    >
      <div className="space-y-6">
        {/* 5 KPI Summary Cards (SCRUM-827) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Số ngày tồn bình quân (Days of Supply) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ngày Tồn Bình Quân
              </span>
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${reportData?.summary.avgDaysOfSupply || 0} ngày`
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Days of Supply (DoS)</div>
          </div>

          {/* Card 2: Tổng giá trị kho */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Giá Trị Tồn Kho
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-6 w-28 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                formatCurrency(reportData?.summary.totalWarehouseValue || 0)
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Theo giá vốn thực tế</div>
          </div>

          {/* Card 3: SKU Chậm Luân Chuyển */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Chậm Luân Chuyển
              </span>
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${reportData?.summary.slowMovingCount || 0} mã`
              )}
            </div>
            <div className="mt-1 text-[11px] text-amber-600/80 dark:text-amber-400/80 font-medium">
              30 - 180 ngày không xuất
            </div>
          </div>

          {/* Card 4: Hàng Tồn Chết (>180d) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Hàng Tồn Chết
              </span>
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <Skull className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${reportData?.summary.deadStockCount || 0} mã`
              )}
            </div>
            <div className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80 font-medium">
              &gt;180 ngày ứ đọng vốn
            </div>
          </div>

          {/* Card 5: Vòng quay trung bình */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Vòng Quay TB
              </span>
              <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${(reportData?.summary.avgTurnoverRatio || 0).toFixed(1)} lần/năm`
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Turnover Velocity Ratio</div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="relative min-w-[200px] flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-turnover-search"
                type="text"
                placeholder="Tìm SKU, tên sản phẩm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <select
              id="select-turnover-warehouse"
              aria-label="Lọc theo kho hàng"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value="all">Tất cả kho hàng</option>
              {reportData?.byWarehouse.map((w) => (
                <option key={w.warehouseId} value={w.warehouseId}>
                  {w.warehouseName}
                </option>
              ))}
            </select>

            <select
              id="select-turnover-category"
              aria-label="Lọc theo nhóm hàng"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value="all">Tất cả nhóm ngành</option>
              {reportData?.byCategory.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.categoryName}
                </option>
              ))}
            </select>

            <select
              id="select-turnover-severity"
              aria-label="Mức độ cảnh báo"
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
            >
              <option value="all">Tất cả mức độ</option>
              <option value="warning">Ít luân chuyển (30-60d)</option>
              <option value="alert">Cảnh báo chậm (61-180d)</option>
              <option value="dead">Tồn chết (&gt;180d)</option>
            </select>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                id="chk-turnover-only-slow"
                type="checkbox"
                checked={onlySlowMoving}
                onChange={(e) => setOnlySlowMoving(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
              />
              <span>Chỉ SKU cảnh báo chậm</span>
            </label>

            <button
              type="button"
              id="btn-refresh-turnover"
              onClick={fetchReport}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500"
              title="Làm mới báo cáo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3 Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            id="tab-turnover-sku"
            onClick={() => setActiveTab('sku')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'sku'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Chi Tiết Vòng Quay SKU ({filteredSkuList.length})</span>
          </button>

          <button
            type="button"
            id="tab-turnover-warehouse"
            onClick={() => setActiveTab('warehouse')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'warehouse'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Warehouse className="w-4 h-4" />
            <span>Vòng Quay Theo Kho ({reportData?.byWarehouse.length || 0})</span>
          </button>

          <button
            type="button"
            id="tab-turnover-category"
            onClick={() => setActiveTab('category')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'category'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Theo Nhóm Hàng ({reportData?.byCategory.length || 0})</span>
          </button>
        </div>

        {/* Tab Content: SKU Detail */}
        {activeTab === 'sku' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-3">Mã SKU</th>
                    <th className="py-3 px-4 min-w-[200px]">Tên Sản Phẩm</th>
                    <th className="py-3 px-3">Kho</th>
                    <th className="py-3 px-3 text-right">Tồn Thực</th>
                    <th className="py-3 px-4 text-right">Giá Trị Tồn</th>
                    <th className="py-3 px-3 text-right">Bán TB/Tháng</th>
                    <th className="py-3 px-3 text-right font-bold">Ngày Tồn (DoS)</th>
                    <th className="py-3 px-4 min-w-[140px]">Vòng Quay (Lần/Năm)</th>
                    <th className="py-3 px-3 text-center">GD Cuối</th>
                    <th className="py-3 px-3 text-center">Tình Trạng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td colSpan={11} className="py-4 px-4">
                          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : filteredSkuList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        Không có mặt hàng nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    filteredSkuList.map((item, idx) => {
                      const isDead = item.severity === 'dead';
                      const isAlert = item.severity === 'alert';

                      return (
                        <tr
                          key={`${item.sku}-${item.warehouseName}-${idx}`}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            isDead
                              ? 'bg-rose-50/40 dark:bg-rose-950/20'
                              : isAlert
                              ? 'bg-orange-50/30 dark:bg-orange-950/20'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-primary-600 dark:text-primary-400">
                            {item.sku}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {item.productName}
                            </div>
                            <div className="text-[11px] text-slate-400">{item.categoryName}</div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                            {item.warehouseName}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium">
                            {formatNumber(item.physicalStock)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatCurrency(item.stockValue)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                            {item.avgMonthlySales}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            <span
                              className={
                                item.daysOfSupply > 180
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : item.daysOfSupply > 90
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-slate-800 dark:text-slate-200'
                              }
                            >
                              {Math.round(item.daysOfSupply)} ngày
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <TurnoverRatioBar
                              ratio={item.turnoverRatio}
                              size="sm"
                              showText={true}
                            />
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                            {item.lastMovementDate}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {getSeverityBadge(item.severity, item.daysSinceLastMovement)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: By Warehouse */}
        {activeTab === 'warehouse' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-4">Kho Hàng</th>
                    <th className="py-3 px-3 text-right">Số Mặt Hàng</th>
                    <th className="py-3 px-4 text-right">Tổng Giá Trị Tồn</th>
                    <th className="py-3 px-3 text-right">Ngày Tồn BQ</th>
                    <th className="py-3 px-5 min-w-[180px]">Vòng Quay (Lần/Năm)</th>
                    <th className="py-3 px-3 text-right">SKU Chậm (&gt;60d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {reportData?.byWarehouse.map((w, idx) => (
                    <tr key={w.warehouseId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Warehouse className="w-4 h-4 text-primary-500 shrink-0" />
                        <span>{w.warehouseName}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium">
                        {formatNumber(w.skuCount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(w.totalValue)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {w.avgTurnoverDays} ngày
                      </td>
                      <td className="py-3 px-5">
                        <TurnoverRatioBar ratio={w.turnoverRatio} size="md" />
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span
                          className={`font-semibold ${
                            w.slowMovingCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                          }`}
                        >
                          {w.slowMovingCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: By Category with Expand */}
        {activeTab === 'category' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-4">Nhóm Ngành Hàng</th>
                    <th className="py-3 px-3 text-right">Số Mặt Hàng</th>
                    <th className="py-3 px-4 text-right">Tổng Giá Trị Tồn</th>
                    <th className="py-3 px-3 text-right">Ngày Tồn BQ</th>
                    <th className="py-3 px-5 min-w-[180px]">Vòng Quay (Lần/Năm)</th>
                    <th className="py-3 px-3 text-right">SKU Chậm Luân Chuyển</th>
                    <th className="py-3 px-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {reportData?.byCategory.map((cat, idx) => {
                    const isExpanded = expandedCategories.has(cat.categoryId);
                    return (
                      <React.Fragment key={cat.categoryId}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <FolderTree className="w-4 h-4 text-primary-500 shrink-0" />
                            <span>{cat.categoryName}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium">
                            {formatNumber(cat.skuCount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatCurrency(cat.totalValue)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {cat.avgTurnoverDays} ngày
                          </td>
                          <td className="py-3 px-5">
                            <TurnoverRatioBar ratio={cat.turnoverRatio} size="md" />
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <span
                              className={`font-semibold ${
                                cat.slowMovingCount > 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {cat.slowMovingCount}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {cat.slowMovingSkus && cat.slowMovingSkus.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleCategoryExpand(cat.categoryId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>Thu gọn</span>
                                    <ChevronDown className="w-3 h-3" />
                                  </>
                                ) : (
                                  <>
                                    <span>Xem SKU chậm</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Slow Moving List in Category */}
                        {isExpanded && cat.slowMovingSkus && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                            <td colSpan={8} className="py-3 px-6">
                              <div className="pl-6 border-l-2 border-rose-500 space-y-2">
                                <div className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>Mã hàng ứ đọng trong nhóm {cat.categoryName}:</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {cat.slowMovingSkus.map((s, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-sm"
                                    >
                                      <div>
                                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                                          {s.productName}
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-400">
                                          {s.sku} • Tồn: {s.physicalStock} chiếc
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                          {formatCurrency(s.stockValue)}
                                        </div>
                                        <div className="mt-0.5">
                                          <SlowMovingBadge days={s.daysSinceLastMovement} />
                                        </div>
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 4: Top Slow Moving List (SCRUM-827) */}
        {reportData && reportData.slowMovingList.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-950/60 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Danh Sách Hàng Chậm Luân Chuyển Cần Xử Lý (Top {reportData.slowMovingList.length} SKU)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Các mặt hàng không phát sinh giao dịch xuất &gt;30 ngày, cần kích cầu hoặc điều chuyển
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {reportData.slowMovingList.slice(0, 9).map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col justify-between space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                        {item.productName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        SKU: {item.sku} • {item.warehouseName}
                      </div>
                    </div>
                    {getSeverityBadge(item.severity, item.daysSinceLastMovement)}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">
                      Tồn: <b>{formatNumber(item.physicalStock)}</b>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatCurrency(item.stockValue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};
