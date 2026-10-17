import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  DollarSign,
  AlertTriangle,
  Clock,
  Warehouse,
  FolderTree,
  Package,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ExportExcelButton } from '../../components/reports/ExportExcelButton';
import { SlowMovingBadge } from '../../components/reports/SlowMovingBadge';
import {
  InventoryReportData,
  InventoryReportFilter,
  InventoryDrillDimension,
} from '../../types/InventoryReport';
import { inventoryReportService } from '../../services/inventoryReportService';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export const InventoryReport: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryDrillDimension>('sku');
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<InventoryReportData | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);
  const [onlySlowMoving, setOnlySlowMoving] = useState<boolean>(false);

  // Expandable rows state for warehouse/category tabs
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await inventoryReportService.getDetailedReport({
        search,
        warehouseId: selectedWarehouse === 'all' ? 'all' : Number(selectedWarehouse),
        categoryId: selectedCategory === 'all' ? 'all' : selectedCategory,
        onlyLowStock,
        onlySlowMoving,
      });
      setReportData(data);
    } catch (err) {
      console.error('[InventoryReport] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedWarehouse, selectedCategory, onlyLowStock, onlySlowMoving]);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categories = useMemo(() => {
    if (!reportData?.categorySummaries) return [];
    return reportData.categorySummaries.map((c) => c.categoryName);
  }, [reportData]);

  const warehouses = useMemo(() => {
    if (!reportData?.warehouseSummaries) return [];
    return reportData.warehouseSummaries.map((w) => ({
      id: w.warehouseId,
      name: w.warehouseName,
    }));
  }, [reportData]);

  const filteredSkus = useMemo(() => {
    if (!reportData?.skuDetails) return [];
    return reportData.skuDetails.filter((item) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          item.sku.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q) ||
          item.categoryName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [reportData, search]);

  return (
    <PageContainer
      title="Báo Cáo Tồn Kho & Giá Trị Lưu Kho"
      subtitle="Đánh giá chi tiết tài sản hàng tồn kho theo kho, nhóm hàng và SKU cảnh báo"
      actions={
        <ExportExcelButton
          id="btn-export-inventory-report"
          label="Xuất Excel Báo Cáo"
          onExport={async () => {
            if (reportData) {
              await inventoryReportService.exportToExcel(reportData, {
                warehouseId: selectedWarehouse === 'all' ? 'all' : Number(selectedWarehouse),
                categoryId: selectedCategory === 'all' ? 'all' : selectedCategory,
              });
            }
          }}
          disabled={!reportData || reportData.skuDetails.length === 0 || loading}
          variant="primary"
        />
      }
    >
      <div className="space-y-6">
        {/* 5 KPI Summary Cards (SCRUM-826) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* KPI 1: Tổng SKU */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tổng Số SKU
              </span>
              <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${formatNumber(reportData?.totalSkus || 0)} mã`
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Đang lưu hành trong kho</div>
          </div>

          {/* KPI 2: Tổng giá trị kho */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Giá Trị Lưu Kho
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {loading ? (
                <div className="h-6 w-28 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                formatCurrency(reportData?.totalStockValue || 0)
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Tính theo đơn giá vốn</div>
          </div>

          {/* KPI 3: SKU dưới mức an toàn */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Dưới Min Tồn
              </span>
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${formatNumber(reportData?.lowStockTotal || 0)} mã`
              )}
            </div>
            <div className="mt-1 text-[11px] text-amber-600/80 dark:text-amber-400/80 font-medium">
              Cần đặt hàng bổ sung
            </div>
          </div>

          {/* KPI 4: SKU chậm luân chuyển */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Chậm Luân Chuyển
              </span>
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {loading ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                `${formatNumber(reportData?.slowMovingTotal || 0)} mã`
              )}
            </div>
            <div className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80 font-medium">
              Không xuất &gt;90 ngày
            </div>
          </div>

          {/* KPI 5: Thời gian lưu kho bình quân */}
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
                `${reportData?.avgStockDays || 45} ngày`
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Chu kỳ quay vòng vốn</div>
          </div>
        </div>

        {/* Filter Bar (SCRUM-826) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-inventory-search"
                type="text"
                placeholder="Tìm mã SKU, tên sản phẩm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Warehouse Filter */}
            <div className="flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-slate-400" />
              <select
                id="select-filter-warehouse"
                aria-label="Lọc theo kho hàng"
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="all">Tất cả kho hàng</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-slate-400" />
              <select
                id="select-filter-category"
                aria-label="Lọc theo nhóm hàng"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="all">Tất cả nhóm ngành hàng</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Toggles */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                id="chk-only-low-stock"
                type="checkbox"
                checked={onlyLowStock}
                onChange={(e) => setOnlyLowStock(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
              />
              <span>Dưới min tồn</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                id="chk-only-slow-moving"
                type="checkbox"
                checked={onlySlowMoving}
                onChange={(e) => setOnlySlowMoving(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
              />
              <span>Chậm luân chuyển</span>
            </label>

            <button
              type="button"
              id="btn-refresh-inventory-report"
              onClick={fetchReport}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            id="tab-view-sku"
            onClick={() => setActiveTab('sku')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'sku'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Chi Tiết Theo SKU ({filteredSkus.length})</span>
          </button>

          <button
            type="button"
            id="tab-view-warehouse"
            onClick={() => setActiveTab('warehouse')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'warehouse'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Warehouse className="w-4 h-4" />
            <span>Tổng Hợp Theo Kho Hàng ({reportData?.warehouseSummaries.length || 0})</span>
          </button>

          <button
            type="button"
            id="tab-view-category"
            onClick={() => setActiveTab('category')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'category'
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Tổng Hợp Theo Nhóm Hàng ({reportData?.categorySummaries.length || 0})</span>
          </button>
        </div>

        {/* Tab 1: Detailed SKU Table */}
        {activeTab === 'sku' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-3">Mã SKU</th>
                    <th className="py-3 px-4 min-w-[200px]">Tên Sản Phẩm</th>
                    <th className="py-3 px-3">Nhóm Hàng</th>
                    <th className="py-3 px-3">Kho Hàng</th>
                    <th className="py-3 px-3 text-right">Tồn Thực</th>
                    <th className="py-3 px-3 text-right">Tồn Giữ Chỗ</th>
                    <th className="py-3 px-3 text-right font-bold">Tồn Khả Dụng</th>
                    <th className="py-3 px-3 text-right">Min Tồn</th>
                    <th className="py-3 px-3 text-right">Giá Vốn</th>
                    <th className="py-3 px-4 text-right">Giá Trị Tồn Kho</th>
                    <th className="py-3 px-3 text-center">GD Cuối</th>
                    <th className="py-3 px-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td colSpan={13} className="py-4 px-4">
                          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : filteredSkus.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        Không tìm thấy mặt hàng nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    filteredSkus.map((sku, idx) => {
                      const isRowLow = sku.isLowStock;
                      const isRowSlow = sku.isSlowMoving;
                      const isOutOfStock = sku.availableStock === 0;

                      return (
                        <tr
                          key={`${sku.sku}-${sku.warehouseName}-${idx}`}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            isOutOfStock
                              ? 'bg-rose-50/40 dark:bg-rose-950/20'
                              : isRowLow
                              ? 'bg-amber-50/40 dark:bg-amber-950/20'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-primary-600 dark:text-primary-400">
                            {sku.sku}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {sku.productName}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                            {sku.categoryName}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                            {sku.warehouseName}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium">
                            {formatNumber(sku.physicalStock)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-500">
                            {formatNumber(sku.reservedStock)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            <span
                              className={
                                sku.availableStock === 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : sku.isLowStock
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }
                            >
                              {formatNumber(sku.availableStock)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400">
                            {formatNumber(sku.minStock)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                            {formatCurrency(sku.costPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatCurrency(sku.stockValue)}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                            {sku.lastMovementDate}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {isOutOfStock ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                  Hết hàng KD
                                </span>
                              ) : isRowLow ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  Dưới min
                                </span>
                              ) : null}

                              {sku.daysSinceLastMovement !== undefined && (
                                <SlowMovingBadge days={sku.daysSinceLastMovement} />
                              )}
                            </div>
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

        {/* Tab 2: Warehouse Summaries */}
        {activeTab === 'warehouse' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-4">Kho Hàng</th>
                    <th className="py-3 px-3 text-right">Số Mặt Hàng (SKU)</th>
                    <th className="py-3 px-3 text-right">Tổng Sản Lượng Lưu Kho</th>
                    <th className="py-3 px-4 text-right">Tổng Giá Trị Tồn Kho</th>
                    <th className="py-3 px-3 text-right">Mã Dưới Min Tồn</th>
                    <th className="py-3 px-3 text-right">Ngày Lưu Kho BQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {reportData?.warehouseSummaries.map((wh, idx) => (
                    <tr key={wh.warehouseId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Warehouse className="w-4 h-4 text-primary-500 shrink-0" />
                        <span>{wh.warehouseName}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium">
                        {formatNumber(wh.totalSkus)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {formatNumber(wh.totalStock)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(wh.totalValue)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span
                          className={`font-semibold ${
                            wh.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'
                          }`}
                        >
                          {wh.lowStockCount}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        {wh.turnoverDays || 38} ngày
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Category Summaries */}
        {activeTab === 'category' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">STT</th>
                    <th className="py-3 px-4">Nhóm Ngành Hàng</th>
                    <th className="py-3 px-3 text-right">Số Mặt Hàng (SKU)</th>
                    <th className="py-3 px-3 text-right">Tổng Sản Lượng Tồn</th>
                    <th className="py-3 px-4 text-right">Tổng Giá Trị Tồn Kho</th>
                    <th className="py-3 px-3 text-right">Mã Chậm Luân Chuyển (&gt;90d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {reportData?.categorySummaries.map((cat, idx) => (
                    <tr key={cat.categoryId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
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
                      <td className="py-3 px-3 text-right font-mono">
                        {formatNumber(cat.totalStock)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(cat.totalValue)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span
                          className={`font-semibold ${
                            cat.slowMovingCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                          }`}
                        >
                          {cat.slowMovingCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};
