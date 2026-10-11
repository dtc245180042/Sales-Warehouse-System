import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Package,
  AlertTriangle,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Search,
  Download,
  Eye,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatNumber } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { stockLedgerService } from '../../services/stockLedgerService';
import { StockBalanceItem } from '../../types/StockLedger';
import { ProductStockCardModal } from '../../components/inventory/ProductStockCardModal';
import { useToast } from '../../contexts/ToastContext';

export const InventoryOverview: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('q') || '';
  const urlWarehouse = searchParams.get('warehouse') || 'all';
  const urlStatus = searchParams.get('status') || 'all';

  const [search, setSearch] = useState(urlSearch);
  const [warehouseFilter, setWarehouseFilter] = useState(urlWarehouse);
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [balances, setBalances] = useState<StockBalanceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modal Thẻ kho
  const [selectedStockCardProductId, setSelectedStockCardProductId] = useState<string | null>(null);

  // Đồng bộ hai chiều từ URL -> State
  useEffect(() => {
    setSearch(urlSearch);
    setWarehouseFilter(urlWarehouse);
    setStatusFilter(urlStatus);
  }, [urlSearch, urlWarehouse, urlStatus]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let whId: number | undefined = undefined;
      if (warehouseFilter === '1' || warehouseFilter === 'Kho Tổng Hà Nội') whId = 1;
      else if (warehouseFilter === '2' || warehouseFilter === 'Kho Đà Nẵng') whId = 2;
      else if (warehouseFilter === '3' || warehouseFilter === 'Kho Tổng TP. HCM') whId = 3;
      else if (warehouseFilter !== 'all' && !isNaN(Number(warehouseFilter))) whId = Number(warehouseFilter);

      const res = await stockLedgerService.getBalances({
        page,
        size: pageSize,
        warehouse_id: whId,
        stock_status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() || undefined,
      });

      setBalances(res.items);
      setTotal(res.total);
    } catch (err: any) {
      console.warn('Lỗi tải sổ tồn kho:', err);
      showToast('Không thể tải dữ liệu sổ tồn kho từ máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, warehouseFilter, statusFilter, search, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (newSearch.trim()) params.set('q', newSearch.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  const handleWarehouseChange = (newWarehouse: string) => {
    setWarehouseFilter(newWarehouse);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (newWarehouse && newWarehouse !== 'all') params.set('warehouse', newWarehouse);
    else params.delete('warehouse');
    setSearchParams(params, { replace: true });
  };

  const handleStatusChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (newStatus && newStatus !== 'all') params.set('status', newStatus);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };

  // KPIs
  const totalPhysical = balances.reduce((sum, item) => sum + item.physical_stock, 0);
  const totalReserved = balances.reduce((sum, item) => sum + item.reserved_stock, 0);
  const totalAvailable = balances.reduce((sum, item) => sum + item.available_stock, 0);
  const lowStockCount = balances.filter((i) => i.is_low_stock).length;
  const outOfStockCount = balances.filter((i) => i.available_stock <= 0).length;

  const handleExportCSV = () => {
    exportToCSV({
      filename: `so_ton_kho_3_cot_${Date.now()}`,
      headers: [
        'SKU',
        'Sản phẩm',
        'Kho hàng',
        'Tồn thực tế (Cột 1)',
        'Đang giữ chỗ (Cột 2)',
        'Khả dụng (Cột 3)',
        'Tồn an toàn',
        'Cảnh báo tồn thấp',
      ],
      rows: balances.map((item) => [
        item.sku,
        item.product_name,
        item.warehouse_name,
        item.physical_stock,
        item.reserved_stock,
        item.available_stock,
        item.min_stock,
        item.is_low_stock ? 'Có' : 'Không',
      ]),
    });
    showToast(`Đã xuất ${balances.length} bản ghi số dư tồn kho thành công!`, 'success');
  };

  const columns: Column<StockBalanceItem>[] = [
    {
      key: 'sku',
      header: 'Mã SKU',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
    },
    {
      key: 'product_name',
      header: 'Sản Phẩm',
      sortable: true,
      className: 'min-w-[200px]',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="truncate">
            <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
              {item.product_name}
            </span>
            <span className="text-[11px] text-slate-400">Đơn vị: {item.unit || 'cái'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'warehouse_name',
      header: 'Kho Hàng',
      sortable: true,
      render: (item) => (
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {item.warehouse_name}
        </span>
      ),
    },
    {
      key: 'physical_stock',
      header: 'Tồn Thực Tế',
      sortable: true,
      className: 'text-right',
      render: (item) => (
        <span className="font-bold text-slate-800 dark:text-slate-100">
          {formatNumber(item.physical_stock)}
        </span>
      ),
    },
    {
      key: 'reserved_stock',
      header: 'Đang Giữ Chỗ',
      sortable: true,
      className: 'text-right',
      render: (item) => (
        <span
          className={`font-semibold ${
            item.reserved_stock > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
          }`}
        >
          {formatNumber(item.reserved_stock)}
        </span>
      ),
    },
    {
      key: 'available_stock',
      header: 'Tồn Khả Dụng',
      sortable: true,
      className: 'text-right',
      render: (item) => (
        <span
          className={`font-black text-sm ${
            item.available_stock === 0
              ? 'text-rose-600'
              : item.is_low_stock
              ? 'text-amber-600'
              : 'text-emerald-600'
          }`}
        >
          {formatNumber(item.available_stock)}
        </span>
      ),
    },
    {
      key: 'min_stock',
      header: 'Tồn Tối Thiểu',
      sortable: true,
      className: 'text-right',
      render: (item) => (
        <span className="text-xs text-slate-400">{item.min_stock}</span>
      ),
    },
    {
      key: 'is_low_stock',
      header: 'Trạng Thái',
      sortable: true,
      render: (item) => {
        if (item.available_stock <= 0) {
          return <Badge variant="danger" size="sm" dot>Hết hàng</Badge>;
        }
        if (item.is_low_stock) {
          return <Badge variant="warning" size="sm" dot>Tồn thấp ({item.available_stock})</Badge>;
        }
        return <Badge variant="success" size="sm" dot>Khả dụng</Badge>;
      },
    },
    {
      key: 'product_id',
      header: 'Thao Tác',
      render: (item) => (
        <Button
          variant="outline"
          size="sm"
          className="text-xs py-1 px-2.5"
          onClick={() => setSelectedStockCardProductId(item.product_id)}
          leftIcon={<Eye className="w-3.5 h-3.5 text-indigo-600" />}
        >
          Thẻ kho
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title="Sổ Tồn Kho & Thẻ Kho Tập Trung"
      subtitle="Báo cáo 3 cột: Tồn thực tế - Đang giữ chỗ - Tồn khả dụng theo từng kho"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
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
            <span className="text-xs font-bold text-slate-400 uppercase">Tồn Thực Tế (Cột 1)</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatNumber(totalPhysical)} <span className="text-sm font-medium text-slate-400">đơn vị</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Tồn vật lý đếm trong kho</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Đang Giữ Chỗ (Cột 2)</span>
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <History className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {formatNumber(totalReserved)} <span className="text-sm font-medium text-slate-400">đơn vị</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Khóa bởi các đơn đã duyệt</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Tồn Khả Dụng (Cột 3)</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {formatNumber(totalAvailable)} <span className="text-sm font-medium text-slate-400">đơn vị</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Số lượng còn có thể bán</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Cảnh Báo Tồn Thấp</span>
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {lowStockCount} <span className="text-sm font-medium text-slate-400">mặt hàng</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">{outOfStockCount} mặt hàng hết hàng</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="mt-6">
        <DataTable
          data={balances}
          columns={columns}
          keyExtractor={(item) => `${item.product_id}-${item.warehouse_id}`}
          filterComponent={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={warehouseFilter}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tất cả kho hàng</option>
                  <option value="1">Kho Tổng Hà Nội</option>
                  <option value="2">Kho Đà Nẵng</option>
                  <option value="3">Kho Tổng TP. HCM</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="in_stock">Còn hàng</option>
                  <option value="low_stock">Tồn dưới định mức</option>
                  <option value="out_of_stock">Hết hàng</option>
                </select>
              </div>
            </div>
          }
        />
      </div>

      {/* Modal Thẻ kho cho từng sản phẩm */}
      <ProductStockCardModal
        isOpen={Boolean(selectedStockCardProductId)}
        onClose={() => setSelectedStockCardProductId(null)}
        productId={selectedStockCardProductId}
      />
    </PageContainer>
  );
};
