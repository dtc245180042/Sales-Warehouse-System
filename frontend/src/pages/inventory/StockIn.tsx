import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Building2,
  Calendar,
  Warehouse,
  FileText,
  CheckCircle2,
  PackagePlus,
  DollarSign,
  Scale,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { UnitQtySelector, UnitQtySelectorValue } from '../../components/common/UnitQtySelector';
import { formatCurrency } from '../../utils/formatters';
import { initialSuppliers } from '../../mock/suppliers';
import { unitConfigService } from '../../mock/unitConversions';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { Product } from '../../types/Product';
import { UnitConversion } from '../../types/Product';
import { StockInItem } from '../../types/Inventory';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

// ── Extended item state (bao gồm thông tin đơn vị) ──
interface StockInItemState extends StockInItem {
  availableUnits: UnitConversion[];
  baseUnit: string;
}

// ── Helper: build default units khi sản phẩm chưa có cấu hình ──
const buildDefaultUnits = (product: Product): UnitConversion[] => [
  {
    id: `${product.id}-base`,
    unitName: product.unit,
    ratio: 1,
    isBase: true,
  },
];

// ── Helper: khởi tạo item state từ product ──
const buildItemState = (product: Product): StockInItemState => {
  const config = unitConfigService.getByProductId(product.id);
  const availableUnits = config ? config.units : buildDefaultUnits(product);
  const baseUnit = config ? config.baseUnit : product.unit;
  const defaultUnit = availableUnits[0];
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity: 10,
    unitName: defaultUnit.unitName,
    unitRatio: defaultUnit.ratio,
    baseQty: 10 * defaultUnit.ratio,
    costPrice: product.costPrice,
    subtotal: 10 * defaultUnit.ratio * product.costPrice,
    availableUnits,
    baseUnit,
  };
};

export const StockIn: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState(initialSuppliers[0].id);
  const [warehouse, setWarehouse] = useState('Kho Tổng TP. HCM');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<StockInItemState[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    productService.getAll().then((data) => {
      setProducts(data);
      if (data.length > 0) {
        setItems([buildItemState(data[0])]);
      }
    });
  }, []);

  const handleAddItem = () => {
    if (products.length === 0) return;
    setItems((prev) => [...prev, buildItemState(products[0])]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, newProdId: string) => {
    const selected = products.find((p) => p.id === newProdId);
    if (!selected) return;
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = buildItemState(selected);
      return updated;
    });
  };

  const handleUnitQtyChange = (index: number, val: UnitQtySelectorValue) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: val.quantity,
        unitName: val.unitName,
        unitRatio: val.unitRatio,
        baseQty: val.baseQty,
        subtotal: val.baseQty * updated[index].costPrice,
      };
      return updated;
    });
  };

  const handlePriceChange = (index: number, price: number) => {
    const validPrice = Math.max(0, price || 0);
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        costPrice: validPrice,
        subtotal: updated[index].baseQty * validPrice,
      };
      return updated;
    });
  };

  // Tổng kho tính theo đơn vị cơ sở
  const totalBaseQty = items.reduce((sum, item) => sum + item.baseQty, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      showToast('Vui lòng thêm ít nhất một sản phẩm nhập kho', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const supplier = initialSuppliers.find((s) => s.id === supplierId);
      // Gửi baseQty làm quantity chính thức vào kho
      const stockInItems: StockInItem[] = items.map((it) => ({
        productId: it.productId,
        sku: it.sku,
        name: it.name,
        quantity: it.baseQty,      // luôn lưu theo đơn vị cơ sở
        unitName: it.unitName,
        unitRatio: it.unitRatio,
        baseQty: it.baseQty,
        costPrice: it.costPrice,
        subtotal: it.subtotal,
      }));

      await inventoryService.createStockInReceipt({
        supplierId,
        supplierName: supplier?.name || 'Nhà cung cấp',
        warehouse,
        date,
        items: stockInItems,
        totalQuantity: totalBaseQty,
        totalAmount,
        note,
        status: 'completed',
        createdBy: user?.name || 'Thủ kho',
      });

      showToast('Tạo phiếu nhập kho thành công! Đã tăng tồn kho.', 'success');
      navigate('/inventory');
    } catch (err: any) {
      showToast(err.message || 'Có lỗi xảy ra', 'error');
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <PageContainer
      title="Tạo Phiếu Nhập Kho"
      subtitle="Nhập thêm hàng hóa từ nhà cung cấp vào kho lưu trữ"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items list (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Danh Sách Mặt Hàng Nhập
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chọn sản phẩm, đơn vị nhập và số lượng — hệ thống tự quy đổi về đơn vị cơ sở
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Thêm sản phẩm
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
                >
                  {/* Row header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase">
                      Mục #{index + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                        title="Xóa mục này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Product selector */}
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Sản phẩm *
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                        id={`stockin-product-${index}`}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Unit + Quantity selector */}
                    <div className="sm:col-span-4">
                      <UnitQtySelector
                        units={item.availableUnits}
                        baseUnit={item.baseUnit}
                        value={{
                          quantity: item.quantity,
                          unitName: item.unitName,
                          unitRatio: item.unitRatio,
                          baseQty: item.baseQty,
                        }}
                        onChange={(val) => handleUnitQtyChange(index, val)}
                        label="Số lượng nhập"
                        idPrefix={`stockin-uqs-${index}`}
                      />
                    </div>

                    {/* Cost price */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Giá nhập (đ/cơ sở)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={item.costPrice}
                        onChange={(e) => handlePriceChange(index, Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                        id={`stockin-price-${index}`}
                      />
                    </div>

                    {/* Subtotal */}
                    <div className="sm:col-span-1 text-right">
                      <span className="block text-[11px] text-slate-400 mb-1">Thành tiền</span>
                      <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 block py-1.5">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  </div>

                  {/* Conversion summary row */}
                  {!item.availableUnits.find((u) => u.unitName === item.unitName)?.isBase && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                      <Scale className="w-3 h-3 text-indigo-500 shrink-0" />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Giá trị nhập:{' '}
                        <strong className="text-indigo-600 dark:text-indigo-400">
                          {item.quantity} {item.unitName}
                        </strong>
                        {' = '}
                        <strong className="text-slate-700 dark:text-slate-300">
                          {item.baseQty} {item.baseUnit}
                        </strong>
                        {' × '}
                        {formatCurrency(item.costPrice)}
                        {' = '}
                        <strong className="text-indigo-700 dark:text-indigo-300">
                          {formatCurrency(item.subtotal)}
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Receipt details & Summary (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-indigo-500" />
              Thông Tin Phiếu Nhập
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Nhà cung cấp *
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-supplier"
              >
                {initialSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-slate-400" /> Kho nhập *
              </label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-warehouse"
              >
                <option value="Kho Tổng TP. HCM">Kho Tổng TP. HCM</option>
                <option value="Kho Tổng Hà Nội">Kho Tổng Hà Nội</option>
                <option value="Kho Showroom Quận 1">Kho Showroom Quận 1</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Ngày nhập *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-date"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Ghi chú phiếu nhập
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Số hợp đồng, hóa đơn đỏ kèm theo..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-note"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3 h-3 text-indigo-400" /> Tổng SL (đơn vị cơ sở):
              </span>
              <span className="font-bold text-slate-900 dark:text-white">{totalBaseQty}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3 h-3 text-indigo-400" /> Số dòng hàng:
              </span>
              <span className="font-medium">{items.length} mục</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-indigo-200/60 dark:border-indigo-900/60">
              <span className="font-bold text-slate-800 dark:text-slate-200">Tổng tiền nhập:</span>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => navigate('/inventory')}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="primary"
              className="flex-1 font-bold"
              onClick={() => setIsConfirmOpen(true)}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
              id="stockin-submit"
            >
              Xác nhận nhập kho
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
        title="Xác nhận nhập kho"
        message={`Bạn có chắc chắn muốn nhập ${totalBaseQty} đơn vị (cơ sở) với tổng giá trị ${formatCurrency(totalAmount)} vào ${warehouse}? Tồn kho sẽ được cộng ngay.`}
        confirmText="Hoàn tất nhập kho"
        variant="info"
      />
    </PageContainer>
  );
};
