import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutGrid,
  List,
  Filter,
  Package,
  Layers,
  Sparkles,
  ArrowUpDown,
  ShoppingBag,
} from 'lucide-react';
import { api } from '../../services/api';
import { ProductItem, mockCategories } from '../../data/mockData';
import { ProductCard } from '../../components/user/ProductCard';
import { ProductTable } from '../../components/user/ProductTable';
import { SearchBar } from '../../components/user/SearchBar';
import { Pagination } from '../../components/user/Pagination';

export const Products: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState(urlSearch);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả danh mục');
  const [selectedStock, setSelectedStock] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const pageSize = 8;

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const res = await api.products.getAll({
        search,
        category: selectedCategory,
        stockStatus: selectedStock,
        sortBy,
        page: currentPage,
        limit: pageSize,
      });
      setProducts(res.products);
      setTotalItems(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (urlSearch !== search) {
      setSearch(urlSearch);
    }
  }, [urlSearch]);

  useEffect(() => {
    loadProducts();
  }, [search, selectedCategory, selectedStock, sortBy, currentPage]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
    if (val) {
      setSearchParams({ search: val });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-indigo-600" />
            <span>Danh mục sản phẩm</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tra cứu thông tin, giá bán lẻ và kiểm tra số lượng tồn kho theo thời gian thực
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
            title="Dạng lưới thẻ"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Lưới thẻ</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'table'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
            title="Dạng bảng chi tiết"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Bảng</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-soft space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="sm:col-span-2 lg:col-span-1">
            <SearchBar
              value={search}
              onChange={handleSearchChange}
              placeholder="Tìm theo tên hoặc mã SP..."
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
            >
              {mockCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div>
            <select
              value={selectedStock}
              onChange={(e) => {
                setSelectedStock(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
            >
              <option value="all">Tất cả tình trạng tồn</option>
              <option value="in_stock">Còn hàng (&gt; 10 cái)</option>
              <option value="low_stock">Sắp hết hàng (1 - 10 cái)</option>
              <option value="out_of_stock">Hết hàng (0 cái)</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
            >
              <option value="default">Sắp xếp: Mặc định</option>
              <option value="price_asc">Giá bán: Thấp đến cao</option>
              <option value="price_desc">Giá bán: Cao đến thấp</option>
              <option value="name_asc">Tên sản phẩm: A - Z</option>
              <option value="stock_desc">Tồn kho: Nhiều nhất</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products Display */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 animate-pulse space-y-3"
            >
              <div className="bg-slate-200 dark:bg-slate-800 aspect-4/3 rounded-xl" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200 dark:border-slate-800 text-center shadow-soft">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-slate-400 mx-auto mb-4">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            Không tìm thấy sản phẩm phù hợp
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Hãy thử tìm kiếm với từ khóa khác hoặc điều chỉnh lại bộ lọc danh mục và trạng thái tồn kho.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedCategory('Tất cả danh mục');
              setSelectedStock('all');
              setSortBy('default');
              setSearchParams({});
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-colors"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <ProductTable products={products} />
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};

export { Products as ProductsPage };
export default Products;
