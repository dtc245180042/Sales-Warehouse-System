import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Save,
  Search,
  XCircle,
  Plus,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { MinStockConfig } from '../../types/Inventory';
import { Warehouse } from '../../types/Warehouse';
import { Product } from '../../types/Product';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { productService } from '../../services/productService';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const MinStockConfigPage: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [configs, setConfigs] = useState<MinStockConfig[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Local draft of edited minStock values: { [configId]: newMinStockNumber }
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});

  // Add new config modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProductId, setNewProductId] = useState('');
  const [newWarehouseId, setNewWarehouseId] = useState('');
  const [newMinStock, setNewMinStock] = useState(10);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgList, whList, prodList] = await Promise.all([
        inventoryService.getMinStockConfigs(),
        warehouseService.getAll(),
        productService.getAll(),
      ]);
      setConfigs(cfgList);
      setWarehouses(whList);
      setProducts(prodList);
      if (whList.length > 0 && !newWarehouseId) {
        setNewWarehouseId(whList[0].id);
      }
      if (prodList.length > 0 && !newProductId) {
        setNewProductId(prodList[0].id);
      }
    } catch {
      showToast('Lỗi khi tải dữ liệu định mức tồn kho', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMinStockChange = (id: string, val: number) => {
    setDraftValues((prev) => ({
      ...prev,
      [id]: Math.max(0, val),
    }));
  };

  const handleSaveAll = async () => {
    const keys = Object.keys(draftValues);
    if (keys.length === 0) {
      showToast('Chưa có thay đổi nào cần lưu', 'info');
      return;
    }

    setSaving(true);
    try {
      const updates = keys.map((id) => {
        const original = configs.find((c) => c.id === id);
        return {
          id,
          productId: original?.productId,
          warehouseId: original?.warehouseId,
          sku: original?.sku,
          productName: original?.productName,
          warehouseName: original?.warehouseName,
          minStock: draftValues[id],
          updatedBy: user?.name || 'Quản lý kho',
        };
      });

      await inventoryService.bulkSaveMinStockConfigs(updates as any);
      showToast(`Đã lưu thành công định mức cho ${keys.length} cấu hình`, 'success');
      setDraftValues({});
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu định mức', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNewConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === newProductId);
    const wh = warehouses.find((w) => w.id === newWarehouseId);
    if (!prod || !wh) {
      showToast('Vui lòng chọn sản phẩm và kho hợp lệ', 'error');
      return;
    }

    try {
      await inventoryService.saveMinStockConfig({
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        warehouseId: wh.id,
        warehouseName: wh.name,
        minStock: Number(newMinStock) || 10,
        currentStock: prod.stock || 0,
        updatedBy: user?.name || 'Quản lý kho',
      });
      showToast(`Đã thiết lập mức tồn tối thiểu cho ${prod.name}`, 'success');
      setIsAddModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thêm cấu hình', 'error');
    }
  };

  // Filtered configs
  const filteredConfigs = useMemo(() => {
    return configs.filter((c) => {
      const matchWh = selectedWarehouseId === 'all' || c.warehouseId === selectedWarehouseId;
      const matchSearch =
        c.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.warehouseName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchWh && matchSearch;
    });
  }, [configs, selectedWarehouseId, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    let outOfStock = 0;
    let lowStock = 0;
    let safe = 0;

    filteredConfigs.forEach((c) => {
      const current = c.currentStock ?? 0;
      const effectiveMin = draftValues[c.id] !== undefined ? draftValues[c.id] : c.minStock;
      if (current === 0) {
        outOfStock++;
      } else if (current < effectiveMin) {
        lowStock++;
      } else {
        safe++;
      }
    });

    return { outOfStock, lowStock, safe };
  }, [filteredConfigs, draftValues]);

  const hasDraftChanges = Object.keys(draftValues).length > 0;

  return (
    <PageContainer
      title="Định mức tồn kho tối thiểu (Min-Stock Threshold)"
      subtitle="Khai báo và kiểm soát mức tồn tối thiểu theo từng SKU và từng kho hàng để tự động cảnh báo nhập hàng (SCRUM-601)"
      actions={
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddModalOpen(true)}
          >
            Thêm định mức SKU
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasDraftChanges}
            isLoading={saving}
            leftIcon={<Save className="w-4 h-4" />}
            onClick={handleSaveAll}
          >
            Lưu thay đổi {hasDraftChanges ? `(${Object.keys(draftValues).length})` : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Alert Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">SKU Hết hàng</div>
              <div className="text-2xl font-bold text-rose-600 mt-1">{stats.outOfStock}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Tồn thực tế = 0</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">SKU Dưới ngưỡng tối thiểu</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{stats.lowStock}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Cần tạo phiếu nhập kho</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">SKU Tồn kho an toàn</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.safe}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Đạt hoặc vượt định mức</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm theo mã SKU, tên sản phẩm..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-medium"
            >
              <option value="all">Tất cả kho hàng</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Configurations Table */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Sản phẩm / SKU</th>
                  <th className="py-3 px-4">Kho áp dụng</th>
                  <th className="py-3 px-4 text-center">Tồn thực tế</th>
                  <th className="py-3 px-4 text-center">Ngưỡng tối thiểu (Min-Stock)</th>
                  <th className="py-3 px-4 text-center">Tình trạng tồn</th>
                  <th className="py-3 px-4">Cập nhật cuối</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredConfigs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      {loading ? 'Đang tải cấu hình...' : 'Không có định mức nào phù hợp với bộ lọc'}
                    </td>
                  </tr>
                ) : (
                  filteredConfigs.map((cfg) => {
                    const current = cfg.currentStock ?? 0;
                    const effectiveMin =
                      draftValues[cfg.id] !== undefined ? draftValues[cfg.id] : cfg.minStock;
                    const isEdited = draftValues[cfg.id] !== undefined && draftValues[cfg.id] !== cfg.minStock;

                    let statusVariant: 'danger' | 'warning' | 'success' = 'success';
                    let statusLabel = 'An toàn';
                    if (current === 0) {
                      statusVariant = 'danger';
                      statusLabel = 'HẾT HÀNG';
                    } else if (current < effectiveMin) {
                      statusVariant = 'warning';
                      statusLabel = 'DƯỚI NGƯỠNG';
                    }

                    return (
                      <tr
                        key={cfg.id}
                        className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                          statusVariant === 'danger'
                            ? 'bg-rose-50/30 dark:bg-rose-950/10'
                            : statusVariant === 'warning'
                            ? 'bg-amber-50/20 dark:bg-amber-950/10'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {cfg.productName}
                          </div>
                          <div className="font-mono text-indigo-600 dark:text-indigo-400 text-[11px]">
                            {cfg.sku}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {cfg.warehouseName}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-bold text-sm ${
                              current === 0
                                ? 'text-rose-600'
                                : current < effectiveMin
                                ? 'text-amber-600'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {current}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={effectiveMin}
                              onChange={(e) => handleMinStockChange(cfg.id, Number(e.target.value))}
                              className={`w-20 px-2 py-1 text-center font-bold text-xs rounded-xl border ${
                                isEdited
                                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/30'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                              }`}
                            />
                            {isEdited && (
                              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" title="Đã chỉnh sửa chưa lưu" />
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={statusVariant} size="sm" dot>
                            {statusLabel}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          <div>{cfg.updatedAt}</div>
                          <div>bởi {cfg.updatedBy}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add New Min-Stock Config Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Thêm định mức tồn tối thiểu mới"
        subtitle="Thiết lập ngưỡng tồn cho từng cặp Sản phẩm × Kho hàng"
        maxWidth="md"
      >
        <form onSubmit={handleAddNewConfig} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chọn sản phẩm <span className="text-rose-500">*</span>
            </label>
            <select
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name} (Tồn: {p.stock})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Kho áp dụng <span className="text-rose-500">*</span>
            </label>
            <select
              value={newWarehouseId}
              onChange={(e) => setNewWarehouseId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Mức tồn tối thiểu (Min-Stock) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={newMinStock}
              onChange={(e) => setNewMinStock(Number(e.target.value))}
              placeholder="VD: 15"
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary">
              Lưu định mức
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
