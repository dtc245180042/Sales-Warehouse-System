import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  History,
  Search,
  Filter,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ArrowLeft,
  Calendar,
  User,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Loading } from '../../components/common/Loading';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { priceHistoryService } from '../../services/priceHistoryService';
import { productService } from '../../services/productService';
import { ProductPriceHistory } from '../../types/PriceHistory';
import { Product } from '../../types/Product';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export const ProductPriceHistoryPage: React.FC = () => {
  const { id: paramProductId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { role } = useAuth();
  const canViewCostPrice = role === 'Admin' || role === 'SalesManager' || role === 'Director';

  const initialProductFilter = paramProductId || searchParams.get('product') || 'all';

  const [histories, setHistories] = useState<ProductPriceHistory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductFilter);
  const [searchTerm, setSearchTerm] = useState<string>(searchParams.get('q') || '');
  const [selectedAuthor, setSelectedAuthor] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const loadData = async () => {
    setLoading(true);
    try {
      const [historyData, productData] = await Promise.all([
        priceHistoryService.getAll(),
        productService.getAll(),
      ]);
      setHistories(historyData);
      setProducts(productData);
    } catch {
      showToast('Lỗi khi tải dữ liệu lịch sử giá', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (paramProductId) {
      setSelectedProductId(paramProductId);
    }
  }, [paramProductId]);

  // Authors list for filter
  const authorOptions = useMemo(() => {
    const set = new Set<string>();
    histories.forEach((h) => {
      if (h.changedBy) set.add(h.changedBy);
    });
    return Array.from(set);
  }, [histories]);

  // Filtered list
  const filteredHistories = useMemo(() => {
    return histories.filter((item) => {
      // Filter by product
      if (selectedProductId !== 'all') {
        if (item.productId !== selectedProductId && item.productSku !== selectedProductId) {
          return false;
        }
      }

      // Filter by author
      if (selectedAuthor !== 'all' && item.changedBy !== selectedAuthor) {
        return false;
      }

      // Search keyword
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSku = item.productSku.toLowerCase().includes(q);
        const matchName = item.productName.toLowerCase().includes(q);
        const matchReason = (item.reason || '').toLowerCase().includes(q);
        const matchAuthor = item.changedBy.toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchReason && !matchAuthor) {
          return false;
        }
      }

      return true;
    });
  }, [histories, selectedProductId, selectedAuthor, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredHistories.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedHistories = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredHistories.slice(start, start + pageSize);
  }, [filteredHistories, safePage, pageSize]);

  // Statistics
  const stats = useMemo(() => {
    const totalChanges = filteredHistories.length;
    const increased = filteredHistories.filter((h) => h.newSalePrice > h.oldSalePrice).length;
    const decreased = filteredHistories.filter((h) => h.newSalePrice < h.oldSalePrice).length;
    const uniqueProducts = new Set(filteredHistories.map((h) => h.productId)).size;
    return { totalChanges, increased, decreased, uniqueProducts };
  }, [filteredHistories]);

  const handleExportCSV = () => {
    exportToCSV({
      filename: `lich_su_gia_${Date.now()}`,
      headers: [
        'Mã SKU',
        'Tên sản phẩm',
        'Giá cũ',
        'Giá mới',
        'Chênh lệch (VNĐ)',
        'Tỷ lệ (%)',
        'Người sửa',
        'Thời điểm áp dụng',
        'Lý do điều chỉnh',
      ],
      rows: filteredHistories.map((h) => {
        const diff = h.newSalePrice - h.oldSalePrice;
        const percent = h.oldSalePrice > 0 ? ((diff / h.oldSalePrice) * 100).toFixed(1) + '%' : '0%';
        return [
          h.productSku,
          h.productName,
          h.oldSalePrice,
          h.newSalePrice,
          diff,
          percent,
          h.changedBy,
          h.effectiveDate,
          h.reason || '',
        ];
      }),
    });
    showToast(`Đã xuất ${filteredHistories.length} dòng lịch sử ra file CSV!`, 'success');
  };

  const handleProductFilterChange = (pId: string) => {
    setSelectedProductId(pId);
    setCurrentPage(1);
    const params = new URLSearchParams(searchParams);
    if (pId !== 'all') params.set('product', pId);
    else params.delete('product');
    setSearchParams(params, { replace: true });
  };

  const handleResetFilters = () => {
    setSelectedProductId('all');
    setSelectedAuthor('all');
    setSearchTerm('');
    setCurrentPage(1);
    setSearchParams({}, { replace: true });
  };

  if (loading) {
    return <Loading text="Đang tải lịch sử thay đổi giá..." />;
  }

  const selectedProductObj = products.find((p) => p.id === selectedProductId || p.sku === selectedProductId);

  return (
    <PageContainer
      title="Lịch Sử Thay Đổi Giá Sản Phẩm"
      subtitle={
        selectedProductObj
          ? `Lịch sử điều chỉnh giá của: ${selectedProductObj.name} (${selectedProductObj.sku})`
          : 'Theo dõi toàn bộ biến động giá bán và giá vốn theo từng sản phẩm'
      }
      actions={
        <div className="flex items-center gap-2">
          {selectedProductId !== 'all' && (
            <Link to="/products/price-history" onClick={() => handleProductFilterChange('all')}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Xem tất cả sản phẩm
              </Button>
            </Link>
          )}
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
            onClick={loadData}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {/* ── Thẻ thống kê ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Tổng lượt điều chỉnh</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
              {stats.totalChanges} <span className="text-xs font-normal text-slate-400">lần</span>
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Lượt tăng giá</p>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.increased} <span className="text-xs font-normal text-slate-400">lần</span>
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <ArrowDownRight className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Lượt giảm giá</p>
            <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
              {stats.decreased} <span className="text-xs font-normal text-slate-400">lần</span>
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Số sản phẩm áp dụng</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
              {stats.uniqueProducts} <span className="text-xs font-normal text-slate-400">mã SP</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Bộ lọc & Tìm kiếm ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-6 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Chọn sản phẩm */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-indigo-500" />
              Sản phẩm
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductFilterChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả sản phẩm ({products.length})</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} - {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Người sửa */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              Người thực hiện
            </label>
            <select
              value={selectedAuthor}
              onChange={(e) => {
                setSelectedAuthor(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả người thực hiện</option>
              {authorOptions.map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </div>

          {/* Tìm kiếm */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-500" />
              Tìm kiếm từ khóa
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm mã SKU, tên SP, lý do..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Nút reset filter */}
        {(selectedProductId !== 'all' || selectedAuthor !== 'all' || searchTerm) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
            <span className="text-slate-500">
              Đang lọc: {filteredHistories.length} kết quả phù hợp
            </span>
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Đặt lại tất cả bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* ── Bảng Lịch Sử Thay Đổi Giá ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
              <tr className="text-slate-500 font-bold uppercase text-[11px] tracking-wider">
                <th className="px-4 py-3.5">Sản Phẩm</th>
                <th className="px-4 py-3.5 text-right">Giá Cũ</th>
                <th className="px-4 py-3.5 text-right">Giá Mới</th>
                <th className="px-4 py-3.5 text-center">Biến Động</th>
                <th className="px-4 py-3.5">Người Sửa</th>
                <th className="px-4 py-3.5">Thời Điểm Áp Dụng</th>
                <th className="px-4 py-3.5">Lý Do Điều Chỉnh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedHistories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <EmptyState
                      title="Không tìm thấy lịch sử thay đổi giá"
                      description="Chưa có dữ liệu biến động giá phù hợp với điều kiện tìm kiếm hiện tại."
                    />
                  </td>
                </tr>
              ) : (
                paginatedHistories.map((item) => {
                  const diff = item.newSalePrice - item.oldSalePrice;
                  const percent = item.oldSalePrice > 0
                    ? ((diff / item.oldSalePrice) * 100).toFixed(1)
                    : '0';
                  const isUp = diff > 0;
                  const isDown = diff < 0;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Sản phẩm */}
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/products/${item.productId}`}
                          className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 block line-clamp-1"
                        >
                          {item.productName}
                        </Link>
                        <span className="text-[11px] text-slate-400 font-mono">
                          SKU: {item.productSku}
                        </span>
                      </td>

                      {/* Giá cũ */}
                      <td className="px-4 py-3.5 text-right font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div>{formatCurrency(item.oldSalePrice)}</div>
                        {canViewCostPrice && item.oldCostPrice !== undefined && (
                          <div className="text-[10px] text-slate-400">
                            Vốn: {formatCurrency(item.oldCostPrice)}
                          </div>
                        )}
                      </td>

                      {/* Giá mới */}
                      <td className="px-4 py-3.5 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                        <div>{formatCurrency(item.newSalePrice)}</div>
                        {canViewCostPrice && item.newCostPrice !== undefined && (
                          <div className="text-[10px] text-slate-400">
                            Vốn: {formatCurrency(item.newCostPrice)}
                          </div>
                        )}
                      </td>

                      {/* Biến động */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {isUp ? (
                          <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            +{percent}% (+{formatCurrency(diff)})
                          </span>
                        ) : isDown ? (
                          <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            {percent}% ({formatCurrency(diff)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                            <Minus className="w-3.5 h-3.5" /> Không đổi
                          </span>
                        )}
                      </td>

                      {/* Người sửa */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-xs">
                            {item.changedBy.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                              {item.changedBy}
                            </p>
                            {item.changedByRole && (
                              <span className="text-[10px] text-slate-400">
                                {item.changedByRole}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Thời điểm áp dụng */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.effectiveDate}</span>
                        </div>
                      </td>

                      {/* Lý do */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="font-medium text-slate-700 dark:text-slate-200 text-xs">
                          {item.reason}
                        </p>
                        {item.note && (
                          <p className="text-[11px] text-slate-400 mt-0.5 italic">
                            {item.note}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Phân trang ── */}
        {filteredHistories.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span>/ {filteredHistories.length} lịch sử thay đổi</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(safePage - 1)}
                disabled={safePage <= 1}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pNum: number;
                if (totalPages <= 5) pNum = i + 1;
                else if (safePage <= 3) pNum = i + 1;
                else if (safePage >= totalPages - 2) pNum = totalPages - 4 + i;
                else pNum = safePage - 2 + i;

                return (
                  <button
                    key={pNum}
                    onClick={() => setCurrentPage(pNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                      pNum === safePage
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
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

export default ProductPriceHistoryPage;
