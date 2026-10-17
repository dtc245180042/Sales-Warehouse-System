import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Tag,
  Clock,
  User,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  DollarSign,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { priceHistoryService } from '../../services/priceHistoryService';
import { ProductPriceHistoryItem } from '../../types/PriceHistory';

const PRICE_TYPE_LABELS: Record<string, { label: string; color: 'blue' | 'indigo' | 'amber' | 'slate' }> = {
  LISTED_PRICE: { label: 'Giá niêm yết', color: 'blue' },
  SALE_PRICE: { label: 'Giá bán đại lý', color: 'indigo' },
  FLOOR_PRICE: { label: 'Giá sàn tối thiểu', color: 'amber' },
};

const CUSTOMER_GROUP_LABELS: Record<string, string> = {
  ALL: 'Tất cả nhóm',
  TIER_1: 'Đại lý Cấp 1 (TIER_1)',
  TIER_2: 'Đại lý Cấp 2 (TIER_2)',
  WHOLESALE: 'Khách buôn (WHOLESALE)',
  VIP: 'Khách VIP',
  RETAIL: 'Bán lẻ (RETAIL)',
};

export const PriceHistoryPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlProductId = searchParams.get('productId') || '';

  // Nạp tức thì từ RAM cache (0ms) khi chuyển trang
  const cachedHistory = priceHistoryService.getCached();
  const [items, setItems] = useState<ProductPriceHistoryItem[]>(() => cachedHistory?.items || []);
  const [loading, setLoading] = useState<boolean>(() => !cachedHistory || cachedHistory.items.length === 0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [total, setTotal] = useState<number>(() => cachedHistory?.total || 0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(() => cachedHistory?.totalPages || 1);

  // Filters
  const [search, setSearch] = useState<string>(urlProductId);
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [selectedPriceType, setSelectedPriceType] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>(urlProductId);

  const loadData = useCallback(async (showSpinner: boolean = false) => {
    if (showSpinner) setLoading(true);
    setIsSyncing(true);
    try {
      const res = await priceHistoryService.getAllPriceHistories({
        search: search.trim() || undefined,
        productId: selectedProductId.trim() || undefined,
        customerGroup: selectedGroup !== 'ALL' ? selectedGroup : undefined,
        priceType: selectedPriceType !== 'ALL' ? selectedPriceType : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to load price history:', err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [search, selectedProductId, selectedGroup, selectedPriceType, fromDate, toDate, page, pageSize]);

  useEffect(() => {
    const hasCache = items.length > 0;
    loadData(!hasCache);
  }, [loadData]);

  // Statistics KPIs
  const stats = useMemo(() => {
    let priceIncreaseCount = 0;
    let priceDecreaseCount = 0;
    const uniqueProducts = new Set<string>();

    items.forEach((item) => {
      uniqueProducts.add(item.productId);
      if (item.changeDiff > 0) priceIncreaseCount++;
      if (item.changeDiff < 0) priceDecreaseCount++;
    });

    return {
      totalAdjustments: total,
      uniqueProductsCount: uniqueProducts.size,
      priceIncreaseCount,
      priceDecreaseCount,
    };
  }, [items, total]);

  // Chart data if filtering by a single product
  const chartData = useMemo(() => {
    if (!selectedProductId && items.length > 0) {
      // If no single product filter, pick the first 10 items reversed for general trend
      return [...items]
        .reverse()
        .slice(-15)
        .map((it) => ({
          date: it.effectiveFrom ? it.effectiveFrom.split('T')[0] : '',
          name: it.productSku || it.productName.slice(0, 15),
          price: it.newPrice,
          oldPrice: it.oldPrice,
        }));
    }
    return [...items]
      .reverse()
      .map((it) => ({
        date: it.effectiveFrom ? it.effectiveFrom.split('T')[0] : '',
        name: it.productSku || it.productName,
        price: it.newPrice,
        oldPrice: it.oldPrice,
      }));
  }, [items, selectedProductId]);

  return (
    <PageContainer
      title="Lịch Sử Thay Đổi Giá"
      description="Tra cứu và theo dõi toàn bộ lịch sử biến động giá bán, giá niêm yết và lý do điều chỉnh để giải thích minh bạch với đại lý."
    >
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng Lần Điều Chỉnh</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.totalAdjustments.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Lần Tăng Giá (Đợt này)</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats.priceIncreaseCount}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Lần Giảm Giá (Đợt này)</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.priceDecreaseCount}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Dữ Liệu Bất Biến</p>
            <div className="flex items-center gap-1.5 mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Append-Only 100%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm mb-6 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên sản phẩm, mã SKU hoặc lý do đổi giá..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Customer Group Filter */}
          <div>
            <select
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value);
                setPage(1);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Object.entries(CUSTOMER_GROUP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Price Type Filter */}
          <div>
            <select
              value={selectedPriceType}
              onChange={(e) => {
                setSelectedPriceType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Tất cả loại giá</option>
              <option value="LISTED_PRICE">Giá niêm yết</option>
              <option value="SALE_PRICE">Giá bán phân phối</option>
              <option value="FLOOR_PRICE">Giá sàn tối thiểu</option>
            </select>
          </div>
        </div>

        {/* Date Filters & Clear */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Từ ngày:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Đến ngày:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(search || selectedGroup !== 'ALL' || selectedPriceType !== 'ALL' || fromDate || toDate || selectedProductId) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedGroup('ALL');
                  setSelectedPriceType('ALL');
                  setFromDate('');
                  setToDate('');
                  setSelectedProductId('');
                  setPage(1);
                }}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium px-2 py-1 transition"
              >
                Xóa tất cả bộ lọc
              </button>
            )}
            <button
              type="button"
              onClick={() => loadData()}
              className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 px-3 py-1.5 bg-slate-100 dark:bg-slate-700/50 rounded-lg transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Price Trend Chart Preview */}
      {chartData.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Biểu Đồ Xu Hướng Mức Giá Theo Dòng Thời Gian</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedProductId ? `Biến động giá của SKU: ${selectedProductId}` : 'Xu hướng mức giá các đợt cập nhật gần nhất'}
              </p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), 'Giá']}
                  labelFormatter={(lbl) => `Thời điểm: ${lbl}`}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#4f46e5' }}
                  activeDot={{ r: 6 }}
                  name="Mức giá mới"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* History Data Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12">
            <Loading message="Đang nạp dữ liệu lịch sử giá..." />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="Không tìm thấy lịch sử thay đổi giá"
              description="Chưa có bản ghi biến động giá nào phù hợp với bộ lọc hiện tại."
              icon={<Tag className="w-12 h-12 text-slate-300" />}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Thời Điểm</th>
                  <th className="py-3 px-4">Sản Phẩm (SKU)</th>
                  <th className="py-3 px-4">Loại Giá / Bảng Giá</th>
                  <th className="py-3 px-4">Mức Giá Cũ</th>
                  <th className="py-3 px-4">Mức Giá Mới</th>
                  <th className="py-3 px-4">Chênh Lệch</th>
                  <th className="py-3 px-4 min-w-[200px]">Lý Do Thay Đổi (Giải trình)</th>
                  <th className="py-3 px-4">Người Thực Hiện</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {items.map((item) => {
                  const typeInfo = PRICE_TYPE_LABELS[item.priceType] || {
                    label: item.priceType,
                    color: 'slate',
                  };
                  const isUp = item.changeDiff > 0;
                  const isDown = item.changeDiff < 0;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-750/50 transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDate(item.effectiveFrom)}</span>
                        </div>
                      </td>

                      {/* Product */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.productName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            onClick={() => {
                              setSelectedProductId(item.productSku || item.productId);
                              setPage(1);
                            }}
                            className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            {item.productSku || `ID: ${item.productId}`}
                          </span>
                        </div>
                      </td>

                      {/* Price Type & Scope */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant={typeInfo.color}>{typeInfo.label}</Badge>
                        {(item.priceListName || item.customerGroup) && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            {item.priceListName || item.customerGroup}
                          </div>
                        )}
                      </td>

                      {/* Old Price */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 line-through">
                        {formatCurrency(item.oldPrice)}
                      </td>

                      {/* New Price */}
                      <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-900 dark:text-white">
                        {formatCurrency(item.newPrice)}
                      </td>

                      {/* Change Diff & Percent */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isUp ? (
                          <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>+{formatCurrency(item.changeDiff)}</span>
                            <span className="text-[11px]">({item.changePercent}%)</span>
                          </div>
                        ) : isDown ? (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>{formatCurrency(item.changeDiff)}</span>
                            <span className="text-[11px]">({item.changePercent}%)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-400">
                            <Minus className="w-3.5 h-3.5" />
                            <span>Không đổi</span>
                          </div>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-4">
                        <div className="bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                          <p className="font-medium">{item.reason}</p>
                          {item.batchId && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Mã đợt: {item.batchId}</p>
                          )}
                        </div>
                      </td>

                      {/* Changed By */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.changedByName}</span>
                        </div>
                        {item.changedByRole && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.changedByRole}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Hiển thị <strong>{(page - 1) * pageSize + 1}</strong> đến{' '}
              <strong>{Math.min(page * pageSize, total)}</strong> trên tổng số <strong>{total}</strong> dòng
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};
export default PriceHistoryPage;
