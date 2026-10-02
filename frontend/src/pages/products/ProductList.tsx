import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Trash2,
  Edit,
  Eye,
  AlertTriangle,
  Boxes,
  FileSpreadsheet,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Modal } from '../../components/common/Modal';
import { formatCurrency, formatDateOnly } from '../../utils/formatters';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';
import { productCategories } from '../../mock/products';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const ProductList: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { role } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Dialogs
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search);
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchStatus = selectedStatus === 'all' || p.status === selectedStatus;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, search, selectedCategory, selectedStatus]);

  // Actions
  const handleDeleteSingle = async () => {
    if (!deleteId) return;
    try {
      await productService.delete(deleteId);
      showToast('Đã xóa sản phẩm thành công', 'success');
      setDeleteId(null);
      loadProducts();
    } catch {
      showToast('Có lỗi xảy ra khi xóa sản phẩm', 'error');
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
    } catch {
      showToast('Có lỗi xảy ra khi xóa nhiều sản phẩm', 'error');
    }
  };

  const handleExportCSV = () => {
    const csvRows = [
      ['Mã SKU', 'Tên sản phẩm', 'Danh mục', 'Giá nhập', 'Giá bán', 'Tồn kho', 'Trạng thái'],
      ...filteredProducts.map((p) => [
        p.sku,
        `"${p.name.replace(/"/g, '""')}"`,
        p.category,
        p.costPrice,
        p.salePrice,
        p.stock,
        p.status,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `danh_sach_san_pham_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã xuất file CSV thành công!', 'success');
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
      header: 'Sản Phẩm',
      sortable: true,
      className: 'min-w-[220px]',
      render: (p) => (
        <div className="flex items-center gap-3">
          <img
            src={p.image}
            alt={p.name}
            className="w-10 h-10 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/images/product-placeholder.jpg"; }}
          />
          <div className="truncate">
            <Link
              to={`/products/${p.id}`}
              className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block"
            >
              {p.name}
            </Link>
            <span className="text-[11px] text-slate-400">{p.supplierName}</span>
          </div>
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
            onClick={() => setDeleteId(p.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="Xóa sản phẩm"
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
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel/CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            Nhập file
          </Button>
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
            onClick={() => setIsBulkDeleteOpen(true)}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Xóa {selectedIds.length} mục đã chọn
          </Button>
        }
        filterComponent={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên, SKU, mã vạch..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Category and Status Dropdowns */}
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả ngành hàng</option>
                {productCategories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Còn hàng</option>
                <option value="low_stock">Sắp hết hàng</option>
                <option value="out_of_stock">Hết hàng</option>
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

      {/* Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Nhập dữ liệu sản phẩm từ Excel"
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>
              Hủy bỏ
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                showToast('Đã nhập 15 sản phẩm từ tệp mẫu thành công!', 'success');
                setIsImportModalOpen(false);
              }}
            >
              Tiến hành nhập file
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs sm:text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Tải lên tệp danh sách sản phẩm theo định dạng chuẩn (.xlsx hoặc .csv).
          </p>
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-indigo-500 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-800/40">
            <FileSpreadsheet className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Kéo thả tệp vào đây hoặc nhấn để chọn
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Hỗ trợ tệp XLSX, CSV tối đa 10MB</p>
          </div>
          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
            Tải về tệp mẫu nhập sản phẩm (.xlsx)
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
