import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Download,
  Upload,
  Trash2,
  Edit,
  Eye,
  AlertTriangle,
  RefreshCw,
  X,
  Layers,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Modal } from '../../components/common/Modal';
import { ExcelImportModal } from '../../components/products/ExcelImportModal';
import { formatCurrency, formatDateOnly } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { productService } from '../../services/productService';
import { categoryService } from '../../services/categoryService';
import { CategoryTree } from '../../types/Category';
import { Product } from '../../types/Product';
import { productCategories } from '../../mock/products';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

// Chuẩn hóa bỏ dấu tiếng Việt để tìm kiếm và lọc không phân biệt dấu
export function normalizeSearchText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// SCRUM-220 & SCRUM-214: Thu thập toàn bộ họ hàng cha - con - cháu của một nhóm hàng trong cây danh mục
export function getCategoryFamily(
  selectedVal: string,
  tree: CategoryTree[]
): { ids: Set<number>; keywords: Set<string> } {
  const ids = new Set<number>();
  const keywords = new Set<string>();

  if (!selectedVal || selectedVal === 'all') {
    return { ids, keywords };
  }

  const normSelected = normalizeSearchText(selectedVal);

  function findNode(nodes: CategoryTree[]): CategoryTree | null {
    for (const node of nodes) {
      if (
        String(node.id) === selectedVal ||
        normalizeSearchText(node.name) === normSelected ||
        (node.code && normalizeSearchText(node.code) === normSelected)
      ) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNode(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  const targetNode = findNode(tree);

  function collectAllDescendants(node: CategoryTree) {
    ids.add(node.id);
    const nodeNorm = normalizeSearchText(node.name);
    keywords.add(nodeNorm);
    // Bổ sung các cụm từ con (ví dụ: "Điện thoại & Máy tính bảng" -> "dien thoai", "may tinh bang")
    nodeNorm.split(/&|,|\(|\)|\//).forEach((part) => {
      const p = part.trim();
      if (p.length >= 2) keywords.add(p);
    });

    if (node.children && node.children.length > 0) {
      node.children.forEach(collectAllDescendants);
    }
  }

  if (targetNode) {
    collectAllDescendants(targetNode);
  } else {
    // Nếu không khớp node trong cây, dùng chính giá trị lọc làm từ khóa tra cứu
    keywords.add(normSelected);
    normSelected.split(/&|,|\(|\)|\//).forEach((part) => {
      const p = part.trim();
      if (p.length >= 2) keywords.add(p);
    });
  }

  return { ids, keywords };
}

export const ProductList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { role } = useAuth();

  // Đọc giá trị ban đầu từ URL Query Parameters
  const urlSearch = searchParams.get('q') || '';
  const urlCategory = searchParams.get('category') || 'all';
  const urlStatus = searchParams.get('status') || 'all';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>(urlSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>(urlCategory);
  const [categoryTree, setCategoryTree] = useState<CategoryTree[]>([]);
  const [categoryFilterOptions, setCategoryFilterOptions] = useState<{ id: string; name: string; label: string }[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>(urlStatus);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Đồng bộ hai chiều từ URL -> State khi người dùng nhấn Back / Forward trên trình duyệt
  useEffect(() => {
    setSearch(urlSearch);
    setSelectedCategory(urlCategory);
    setSelectedStatus(urlStatus);
  }, [urlSearch, urlCategory, urlStatus]);

  // Hàm cập nhật URL Search Params khi bộ lọc thay đổi
  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    const params = new URLSearchParams(searchParams);
    if (newSearch.trim()) params.set('q', newSearch.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  const handleCategoryChange = (newCat: string) => {
    setSelectedCategory(newCat);
    const params = new URLSearchParams(searchParams);
    if (newCat && newCat !== 'all') params.set('category', newCat);
    else params.delete('category');
    setSearchParams(params, { replace: true });
  };

  const handleStatusChange = (newStat: string) => {
    setSelectedStatus(newStat);
    const params = new URLSearchParams(searchParams);
    if (newStat && newStat !== 'all') params.set('status', newStat);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };

  // Dialogs
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // SCRUM-220 & SCRUM-381: Chặn xóa sản phẩm đã có giao dịch và cho phép chuyển sang ngừng kinh doanh
  const [blockedProduct, setBlockedProduct] = useState<Product | null>(null);
  const [bulkBlockedProducts, setBulkBlockedProducts] = useState<Product[]>([]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await productService.getAll();
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();

    // Tải danh mục ngành hàng / nhóm hàng dạng cây 3 cấp (SCRUM-214)
    categoryService.getTree().then((tree) => {
      if (tree && tree.length > 0) {
        setCategoryTree(tree);
        const opts: { id: string; name: string; label: string }[] = [];
        const traverse = (nodes: CategoryTree[], depth: number = 0) => {
          nodes.forEach((n) => {
            const prefix = '  '.repeat(depth);
            const tag = n.level === 1 ? '📁 [Ngành]' : n.level === 2 ? '📁 [Nhóm]' : '📄 [Tiểu nhóm]';
            opts.push({
              id: String(n.id),
              name: n.name,
              label: `${prefix}${tag} ${n.name}`,
            });
            if (n.children && n.children.length > 0) {
              traverse(n.children, depth + 1);
            }
          });
        };
        traverse(tree);
        setCategoryFilterOptions(opts);
      }
    }).catch((err) => {
      console.warn('Không thể tải cây ngành hàng để lọc:', err);
    });
  }, []);

  // SCRUM-220: Bộ lọc thông minh phân cấp Cha - Con và tìm kiếm Full-text không dấu
  const filteredProducts = useMemo(() => {
    const q = normalizeSearchText(search);
    const catFamily = getCategoryFamily(selectedCategory, categoryTree);
    const hasCatFilter = selectedCategory && selectedCategory !== 'all';
    const normSelectedStatus = (selectedStatus || 'all').toLowerCase();

    return products.filter((p) => {
      // 1. Tìm kiếm Full-text không dấu trên Tên, SKU, Barcode, Danh mục, Nhà cung cấp
      if (q) {
        const pName = normalizeSearchText(p.name);
        const pSku = normalizeSearchText(p.sku);
        const pBarcode = normalizeSearchText(p.barcode);
        const pCat = normalizeSearchText(p.category);
        const pSupplier = normalizeSearchText(p.supplierName);

        const matchSearch =
          pName.includes(q) ||
          pSku.includes(q) ||
          pBarcode.includes(q) ||
          pCat.includes(q) ||
          pSupplier.includes(q);

        if (!matchSearch) return false;
      }

      // 2. Lọc theo Ngành hàng & Nhóm hàng (Phân cấp Cha - Con thông minh)
      if (hasCatFilter) {
        let matchCat = false;
        // Khớp theo categoryId nếu sản phẩm có gán categoryId nằm trong gia đình nhóm được chọn
        if (p.categoryId !== undefined && catFamily.ids.has(Number(p.categoryId))) {
          matchCat = true;
        }
        // Khớp theo từ khóa nhóm hàng (không dấu)
        if (!matchCat && p.category) {
          const pNormCat = normalizeSearchText(p.category);
          for (const kw of catFamily.keywords) {
            if (pNormCat.includes(kw) || kw.includes(pNormCat)) {
              matchCat = true;
              break;
            }
          }
        }
        if (!matchCat) return false;
      }

      // 3. Lọc theo trạng thái kinh doanh / tồn kho
      if (normSelectedStatus !== 'all') {
        const pStatus = (p.status || '').toLowerCase();
        if (normSelectedStatus === 'active' && pStatus !== 'active') return false;
        if (normSelectedStatus === 'low_stock' && pStatus !== 'low_stock') return false;
        if (normSelectedStatus === 'out_of_stock' && pStatus !== 'out_of_stock') return false;
        if (normSelectedStatus === 'inactive' && pStatus !== 'inactive') return false;
      }

      return true;
    });
  }, [products, search, selectedCategory, categoryTree, selectedStatus]);

  // Actions
  const handleRequestDelete = (product: Product) => {
    if (product.hasTransactions) {
      setBlockedProduct(product);
    } else {
      setDeleteId(product.id);
    }
  };

  const handleDeleteSingle = async () => {
    if (!deleteId) return;
    try {
      await productService.delete(deleteId);
      showToast('Đã xóa sản phẩm thành công', 'success');
      setDeleteId(null);
      loadProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi xóa sản phẩm';
      showToast(msg, 'error');
    }
  };

  const handleDeactivateSingle = async () => {
    if (!blockedProduct) return;
    try {
      await productService.deactivateProduct(blockedProduct.id);
      showToast(
        `Đã chuyển sản phẩm "${blockedProduct.name}" sang trạng thái "Ngừng kinh doanh".`,
        'success'
      );
      setBlockedProduct(null);
      loadProducts();
    } catch {
      showToast('Có lỗi xảy ra khi cập nhật trạng thái', 'error');
    }
  };

  const handleRequestBulkDelete = () => {
    const blocked = products.filter((p) => selectedIds.includes(p.id) && p.hasTransactions);
    if (blocked.length > 0) {
      setBulkBlockedProducts(blocked);
    } else {
      setIsBulkDeleteOpen(true);
    }
  };

  const handleDeactivateBulkBlocked = async () => {
    try {
      for (const p of bulkBlockedProducts) {
        await productService.deactivateProduct(p.id);
      }
      showToast(
        `Đã chuyển ${bulkBlockedProducts.length} sản phẩm sang trạng thái "Ngừng kinh doanh".`,
        'success'
      );
      setBulkBlockedProducts([]);
      setSelectedIds([]);
      loadProducts();
    } catch {
      showToast('Có lỗi xảy ra khi cập nhật trạng thái', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await productService.bulkDelete(selectedIds);
      showToast(`Đã xóa ${selectedIds.length} sản phẩm thành công`, 'success');
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      loadProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi xóa nhiều sản phẩm';
      showToast(msg, 'error');
    }
  };

  const handleExportCSV = () => {
    exportToCSV({
      filename: `danh_sach_san_pham_${Date.now()}`,
      headers: ['Mã SKU', 'Mã vạch', 'Tên sản phẩm', 'Danh mục', 'Giá nhập', 'Giá bán', 'Tồn kho', 'Đơn vị tính', 'Trạng thái'],
      rows: filteredProducts.map((p) => [
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.costPrice,
        p.salePrice,
        p.stock,
        p.unit,
        p.status,
      ]),
    });
    showToast(`Đã xuất ${filteredProducts.length} sản phẩm ra file Excel/CSV thành công!`, 'success');
  };

  // SCRUM-202: Giá vốn và biên lợi nhuận chỉ lộ ra với vai trò Quản lý kinh doanh (và Admin/Ban giám đốc)
  const canViewCostPrice = role === 'Admin' || role === 'SalesManager' || role === 'Director';

  const columns: Column<Product>[] = useMemo(() => {
    const rawCols: Column<Product>[] = [
    {
      key: 'sku',
      header: 'Mã SKU',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
      render: (p) => (
        <div>
          <div>{p.sku}</div>
          <div className="text-[10px] text-slate-400">{p.barcode}</div>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Tên Sản Phẩm',
      sortable: true,
      className: 'min-w-[280px]',
      render: (p) => (
        <div className="py-0.5">
          <Link
            to={`/products/${p.id}`}
            className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors block text-sm leading-snug"
          >
            {p.name}
          </Link>
          {p.supplierName && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 block">
              {p.supplierName}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Danh Mục',
      sortable: true,
      render: (p) => (
        <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium">
          {p.category}
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'ĐVT / Quy Cách',
      sortable: true,
      render: (p) => (
        <div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
            {p.unit}
          </span>
          {p.packagingSpecification && (
            <div className="text-[11px] text-slate-400 mt-0.5">
              {p.packagingSpecification}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'costPrice',
      header: 'Giá Nhập',
      sortable: true,
      render: (p) => <span className="text-slate-500 dark:text-slate-400">{formatCurrency(p.costPrice)}</span>,
    },
    {
      key: 'salePrice',
      header: 'Giá Bán',
      sortable: true,
      render: (p) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">
          {formatCurrency(p.salePrice)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Tồn Kho',
      sortable: true,
      render: (p) => (
        <div>
          <span
            className={`font-bold ${
              p.stock === 0
                ? 'text-rose-600'
                : p.stock <= p.minStock
                ? 'text-amber-600'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {p.stock} {p.unit}
          </span>
          <div className="text-[10px] text-slate-400">Tối thiểu: {p.minStock}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (p) => {
        const statusMap = {
          active: { label: 'Còn hàng', variant: 'success' as const },
          low_stock: { label: 'Sắp hết', variant: 'warning' as const },
          out_of_stock: { label: 'Hết hàng', variant: 'danger' as const },
          inactive: { label: 'Ngừng kinh doanh', variant: 'neutral' as const },
        };
        const config = statusMap[p.status] || statusMap.active;
        return (
          <Badge variant={config.variant} size="sm" dot>
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Cập Nhật',
      sortable: true,
      render: (p) => <span className="text-xs text-slate-400">{formatDateOnly(p.updatedAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (p) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/products/${p.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Xem chi tiết"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <Link
            to={`/products/${p.id}/edit`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Chỉnh sửa"
          >
            <Edit className="w-4 h-4" />
          </Link>
          <button
            onClick={() => handleRequestDelete(p)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title={p.hasTransactions ? 'Sản phẩm đã phát sinh giao dịch - Chỉ có thể ngừng kinh doanh' : 'Xóa sản phẩm'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // SCRUM-202: Giá vốn và biên lợi nhuận chỉ hiển thị với vai trò Quản lý kinh doanh (Admin / SalesManager / Director)
  if (!canViewCostPrice) {
    return rawCols.filter((col) => col.key !== 'costPrice');
  }
  return rawCols;
}, [canViewCostPrice]);

  return (
    <PageContainer
      title="Danh Sách Sản Phẩm"
      subtitle={`Quản lý toàn diện ${products.length} mặt hàng, mức tồn kho và giá bán lẻ`}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadProducts();
              showToast('Đang làm mới danh mục sản phẩm từ CSDL MySQL...', 'info');
            }}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Làm mới
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel/CSV
          </Button>
          <Link to="/products/import">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Upload className="w-4 h-4" />}
            >
              Nhập từ Excel
            </Button>
          </Link>
          <Link to="/products/create">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Thêm sản phẩm
            </Button>
          </Link>
        </>
      }
    >
      <DataTable
        data={filteredProducts}
        columns={columns}
        keyExtractor={(p) => p.id}
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        bulkActions={
          <Button
            variant="danger"
            size="sm"
            onClick={handleRequestBulkDelete}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Xóa {selectedIds.length} mục đã chọn
          </Button>
        }
        filterComponent={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            {/* Search Input with Clear Button */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm theo tên, SKU, mã vạch, nhóm hàng..."
                className="w-full pl-9 pr-9 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Xóa tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category and Status Dropdowns & Counter Badge */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 shrink-0">
                Hiển thị {filteredProducts.length.toLocaleString('vi-VN')} / {products.length.toLocaleString('vi-VN')} sp
              </span>

              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans max-w-[260px] shadow-sm truncate"
                title="Lọc theo ngành hàng hoặc nhóm hàng"
              >
                <option value="all">Tất cả ngành hàng & nhóm hàng</option>
                {categoryFilterOptions.length > 0 ? (
                  categoryFilterOptions.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.label}
                    </option>
                  ))
                ) : (
                  productCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Còn hàng</option>
                <option value="low_stock">Sắp hết hàng</option>
                <option value="out_of_stock">Hết hàng</option>
                <option value="inactive">Ngừng kinh doanh</option>
              </select>
            </div>
          </div>
        }
      />

      {/* Delete Single Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteSingle}
        title="Xác nhận xóa sản phẩm"
        message="Hành động này sẽ xóa vĩnh viễn sản phẩm khỏi hệ thống. Bạn có chắc chắn muốn tiếp tục?"
        confirmText="Xóa vĩnh viễn"
        variant="danger"
      />

      {/* Bulk Delete Dialog */}
      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Xác nhận xóa ${selectedIds.length} sản phẩm`}
        message="Tất cả các sản phẩm đã chọn sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác."
        confirmText="Xóa tất cả"
        variant="danger"
      />

      {/* SCRUM-220 & SCRUM-381: Cảnh báo không thể xóa sản phẩm đã có giao dịch */}
      <Modal
        isOpen={!!blockedProduct}
        onClose={() => setBlockedProduct(null)}
        title="Không Thể Xóa Sản Phẩm Đã Có Giao Dịch"
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockedProduct(null)}>
              Đóng
            </Button>
            <Button variant="primary" onClick={handleDeactivateSingle}>
              Chuyển sang "Ngừng kinh doanh"
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">
                Quy định hệ thống: Sản phẩm đã phát sinh giao dịch thì KHÔNG ĐƯỢC XÓA!
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Sản phẩm <strong>{blockedProduct?.name}</strong> (SKU: <strong>{blockedProduct?.sku}</strong>) đã được ghi nhận trong đơn hàng hoặc lịch sử nhập xuất kho. Để đảm bảo toàn vẹn dữ liệu sổ sách kế toán, bạn chỉ có thể chuyển sang trạng thái <strong>Ngừng kinh doanh</strong>.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Khi chuyển sang <em>Ngừng kinh doanh</em>, sản phẩm sẽ không còn xuất hiện trong danh sách bán hàng mới nhưng dữ liệu lịch sử cũ vẫn được lưu trữ nguyên vẹn.
          </p>
        </div>
      </Modal>

      {/* Cảnh báo xóa nhiều khi có sản phẩm đã có giao dịch */}
      <Modal
        isOpen={bulkBlockedProducts.length > 0}
        onClose={() => setBulkBlockedProducts([])}
        title={`Cảnh Báo: ${bulkBlockedProducts.length} Sản Phẩm Không Thể Xóa`}
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkBlockedProducts([])}>
              Hủy bỏ
            </Button>
            <Button variant="primary" onClick={handleDeactivateBulkBlocked}>
              Chuyển {bulkBlockedProducts.length} sản phẩm sang "Ngừng kinh doanh"
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">
                Phát hiện {bulkBlockedProducts.length} sản phẩm đã có giao dịch
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Các sản phẩm này không thể xóa bỏ hoàn toàn. Bạn có muốn chuyển tất cả chúng sang trạng thái <strong>Ngừng kinh doanh</strong>?
              </p>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-900">
            {bulkBlockedProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
                  {p.name}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold">
                  {p.sku}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={(count) => {
          showToast(`Đã nhập thành công ${count} sản phẩm vào hệ thống!`, 'success');
          setIsImportModalOpen(false);
          loadProducts();
        }}
      />
    </PageContainer>
  );
};
