import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  DollarSign,
  AlertTriangle,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Search,
  Download,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';
import { productCategories } from '../../mock/products';
import { useToast } from '../../contexts/ToastContext';

interface InventoryItemView {
  productId: string;
  sku: string;
  name: string;
  image: string;
  category: string;
  warehouse: string;
  initialStock: number;
  imported: number;
  exported: number;
  currentStock: number;
  minStock: number;
  unit: string;
  costPrice: number;
  totalValue: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export const InventoryOverview: React.FC = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    productService.getAll().then(setProducts);
  }, []);

  // Compute inventory data
  const inventoryItems: InventoryItemView[] = useMemo(() => {
    return products.map((p, index) => {
      const initialStock = p.stock + (index % 3) * 5;
      const imported = (index % 4) * 8 + 4;
      const exported = initialStock + imported - p.stock;
      const currentStock = p.stock;
      const totalValue = currentStock * p.costPrice;

      let status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';
      if (currentStock === 0) status = 'out_of_stock';
      else if (currentStock <= p.minStock) status = 'low_stock';

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        image: p.image,
        category: p.category,
        warehouse: index % 2 === 0 ? 'Kho Tổng TP. HCM' : 'Kho Tổng Hà Nội',
        initialStock,
        imported,
        exported: Math.max(0, exported),
        currentStock,
        minStock: p.minStock,
        unit: p.unit,
        costPrice: p.costPrice,
        totalValue,
        status,
      };
    });
  }, [products]);

  // Filters
  const filteredItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase());
      const matchWarehouse = warehouseFilter === 'all' || item.warehouse === warehouseFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchWarehouse && matchStatus;
    });
  }, [inventoryItems, search, warehouseFilter, statusFilter]);

  // Overall KPIs
  const totalUnits = inventoryItems.reduce((sum, item) => sum + item.currentStock, 0);
  const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + item.totalValue, 0);
  const lowStockCount = inventoryItems.filter((i) => i.status === 'low_stock').length;
  const outOfStockCount = inventoryItems.filter((i) => i.status === 'out_of_stock').length;

  const handleExportCSV = () => {
    const csvRows = [
      ['SKU', 'Sản phẩm', 'Kho', 'Tồn đầu', 'Nhập kỳ', 'Xuất kỳ', 'Tồn cuối', 'Giá trị tồn (VNĐ)', 'Trạng thái'],
      ...filteredItems.map((item) => [
        item.sku,
        `"${item.name.replace(/"/g, '""')}"`,
        item.warehouse,
        item.initialStock,
        item.imported,
        item.exported,
        item.currentStock,
        item.totalValue,
        item.status,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bao_cao_ton_kho_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã xuất báo cáo tồn kho thành công!', 'success');
  };

  const columns: Column<InventoryItemView>[] = [
    {
      key: 'sku',
      header: 'Mã SKU',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
    },
    {
      key: 'name',
      header: 'Sản Phẩm',
      sortable: true,
      className: 'min-w-[200px]',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <img
            src={item.image}
            alt={item.name}
            className="w-9 h-9 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/images/product-placeholder.jpg"; }}
          />
          <div className="truncate">
            <Link
              to={`/products/${item.productId}`}
              className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 truncate block"
            >
              {item.name}
            </Link>
            <span className="text-[11px] text-slate-400">{item.category}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Kho Hàng',
      sortable: true,
      render: (item) => (
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {item.warehouse}
        </span>
      ),
    },
    {
      key: 'initialStock',
      header: 'Tồn Đầu',
      sortable: true,
      render: (item) => <span className="text-slate-500">{item.initialStock}</span>,
    },
    {
      key: 'imported',
      header: 'Nhập (+)',
      sortable: true,
      render: (item) => <span className="text-emerald-600 font-semibold">+{item.imported}</span>,
    },
    {
      key: 'exported',
      header: 'Xuất (-)',
      sortable: true,
      render: (item) => <span className="text-rose-500 font-semibold">-{item.exported}</span>,
    },
    {
      key: 'currentStock',
      header: 'Tồn Cuối',
      sortable: true,
      render: (item) => (
        <span
          className={`font-black text-sm ${
            item.currentStock === 0
              ? 'text-rose-600'
              : item.currentStock <= item.minStock
              ? 'text-amber-600'
              : 'text-slate-900 dark:text-white'
          }`}
        >
          {item.currentStock} {item.unit}
        </span>
      ),
    },
    {
      key: 'totalValue',
      header: 'Giá Trị Tồn',
      sortable: true,
      render: (item) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">
          {formatCurrency(item.totalValue)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (item) => {
        if (item.status === 'out_of_stock') {
          return <Badge variant="danger" size="sm" dot>Hết hàng</Badge>;
        }
        if (item.status === 'low_stock') {
          return <Badge variant="warning" size="sm" dot>Sắp hết ({item.currentStock})</Badge>;
        }
        return <Badge variant="success" size="sm" dot>Còn hàng</Badge>;
      },
    },
  ];

  return (
    <PageContainer
      title="Tổng Quan Tồn Kho"
      subtitle="Theo dõi biến động xuất nhập tồn kho hàng thời gian thực"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel
          </Button>
          <Link to="/inventory/history">
            <Button variant="secondary" size="sm" leftIcon={<History className="w-4 h-4" />}>
              Lịch sử kho
            </Button>
          </Link>
          <Link to="/inventory/stock-out">
            <Button variant="outline" size="sm" leftIcon={<ArrowUpRight className="w-4 h-4" />}>
              Xuất kho
            </Button>
          </Link>
          <Link to="/inventory/stock-in">
            <Button variant="primary" size="sm" leftIcon={<ArrowDownLeft className="w-4 h-4" />}>
              Nhập kho mới
            </Button>
          </Link>
        </div>
      }
    >
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Tổng Tồn Kho</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatNumber(totalUnits)} <span className="text-sm font-medium text-slate-400">đơn vị</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Trên 2 tổng kho chính</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Tổng Giá Trị Tồn</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatCurrency(totalInventoryValue)}
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Theo đơn giá giá nhập</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Sắp Hết Hàng</span>
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {lowStockCount} <span className="text-sm font-medium text-slate-400">mặt hàng</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Dưới ngưỡng an toàn</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Hết Tồn Kho</span>
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {outOfStockCount} <span className="text-sm font-medium text-slate-400">mặt hàng</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Cần đặt hàng gấp</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="mt-6">
        <DataTable
          data={filteredItems}
          columns={columns}
          keyExtractor={(item) => item.productId}
          filterComponent={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tất cả kho hàng</option>
                  <option value="Kho Tổng TP. HCM">Kho Tổng TP. HCM</option>
                  <option value="Kho Tổng Hà Nội">Kho Tổng Hà Nội</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="in_stock">Còn hàng</option>
                  <option value="low_stock">Sắp hết</option>
                  <option value="out_of_stock">Hết hàng</option>
                </select>
              </div>
            </div>
          }
        />
      </div>
    </PageContainer>
  );
};
