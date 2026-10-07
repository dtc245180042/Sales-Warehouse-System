import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Warehouse,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Scale,
  FileText,
  Calendar,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { UnitQtySelector, UnitQtySelectorValue } from '../../components/common/UnitQtySelector';
import { formatCurrency } from '../../utils/formatters';
import { unitConfigService } from '../../mock/unitConversions';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { Product } from '../../types/Product';
import { UnitConversion } from '../../types/Product';
import { StockOutItem, StockOutReason } from '../../types/Inventory';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

// ── Extended item state ──
interface StockOutItemState extends StockOutItem {
  availableUnits: UnitConversion[];
  baseUnit: string;
}

const buildDefaultUnits = (product: Product): UnitConversion[] => [
  {
    id: `${product.id}-base`,
    unitName: product.unit,
    ratio: 1,
    isBase: true,
  },
];

const buildItemState = (product: Product): StockOutItemState => {
  const config = unitConfigService.getByProductId(product.id);
  const availableUnits = config ? config.units : buildDefaultUnits(product);
  const baseUnit = config ? config.baseUnit : product.unit;
  const defaultUnit = availableUnits[0];
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    currentStock: product.stock,
    quantity: 1,
    unitName: defaultUnit.unitName,
    unitRatio: defaultUnit.ratio,
    baseQty: 1 * defaultUnit.ratio,
    costPrice: product.costPrice,
    subtotal: 1 * defaultUnit.ratio * product.costPrice,
    availableUnits,
    baseUnit,
  };
};

export const StockOut: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [reason, setReason] = useState<StockOutReason>('sale');
  const [warehouse, setWarehouse] = useState('Kho Tổng TP. HCM');
  const [destinationWarehouse, setDestinationWarehouse] = useState('Kho Showroom Quận 1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<StockOutItemState[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    productService.getAll().then((data) => {
      setProducts(data);
      const inStock = data.filter((p) => p.stock > 0);
      if (inStock.length > 0) {
        setItems([buildItemState(inStock[0])]);
      }
    });
  }, []);

  const handleAddItem = () => {
    const inStock = products.filter((p) => p.stock > 0);
    if (inStock.length === 0) {
      showToast('Không có sản phẩm nào còn tồn kho để xuất', 'warning');
      return;
    }
    setItems((prev) => [...prev, buildItemState(inStock[0])]);
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
      const maxBase = updated[index].currentStock;
      const clampedBase = Math.min(val.baseQty, maxBase);
      const clampedQty = val.unitRatio > 0 ? Math.floor(clampedBase / val.unitRatio) : val.quantity;

      if (val.baseQty > maxBase) {
        showToast(
          `Không thể xuất quá ${maxBase} ${updated[index].baseUnit} (tồn kho hiện tại)`,
          'warning'
        );
      }

      updated[index] = {
        ...updated[index],
        quantity: clampedQty,
        unitName: val.unitName,
        unitRatio: val.unitRatio,
        baseQty: clampedBase,
        subtotal: clampedBase * updated[index].costPrice,
      };
      return updated;
    });
  };

  const totalBaseQty = items.reduce((sum, item) => sum + item.baseQty, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      showToast('Vui lòng thêm sản phẩm cần xuất', 'warning');
      return;
    }

    for (const it of items) {
      const p = products.find((x) => x.id === it.productId);
      if (p && it.baseQty > p.stock) {
        showToast(`Sản phẩm ${it.name} không đủ tồn kho để xuất!`, 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const stockOutItems: StockOutItem[] = items.map((it) => ({
        productId: it.productId,
        sku: it.sku,
        name: it.name,
        currentStock: it.currentStock,
        quantity: it.baseQty,     // luôn lưu theo đơn vị cơ sở
        unitName: it.unitName,
        unitRatio: it.unitRatio,
        baseQty: it.baseQty,
        costPrice: it.costPrice,
        subtotal: it.subtotal,
      }));

      await inventoryService.createStockOutReceipt({
        reason,
        warehouse,
        destinationWarehouse: reason === 'transfer' ? destinationWarehouse : undefined,
        date,
        items: stockOutItems,
        totalQuantity: totalBaseQty,
        totalAmount,
        note,
        status: 'completed',
        createdBy: user?.name || 'Thủ kho',
      });

      showToast('Xuất kho thành công! Đã trừ số lượng tồn.', 'success');
      navigate('/inventory');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi tạo phiếu xuất kho', 'error');
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <PageContainer
      title="Tạo Phiếu Xuất Kho"
      subtitle="Xuất hàng hóa phục vụ bán hàng, điều chuyển nội bộ hoặc hủy hàng lỗi"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Danh Sách Mặt Hàng Xuất
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hệ thống tự kiểm tra tồn kho và quy đổi về đơn vị cơ sở khi trừ kho
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
              {items.map((item, index) => {
                const overLimit = item.baseQty > item.currentStock;
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border space-y-3 transition-colors ${
                      overLimit
                        ? 'border-rose-300 dark:border-rose-700 bg-rose-50/40 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
                    }`}
                  >
                    {/* Row header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">
                          Mục #{index + 1}
                        </span>
                        {overLimit && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle className="w-2.5 h-2.5" /> Vượt tồn kho
                          </span>
                        )}
                      </div>
                      {items.length > 1 && (
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* Product selector */}
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          Sản phẩm xuất *
                        </label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleProductChange(index, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                          id={`stockout-product-${index}`}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id} disabled={p.stock === 0}>
                              {p.sku} - {p.name} (Tồn: {p.stock})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Unit + Quantity */}
                      <div className="sm:col-span-5">
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
                          maxBaseQty={item.currentStock}
                          label="Số lượng xuất"
                          idPrefix={`stockout-uqs-${index}`}
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="sm:col-span-2 text-right">
                        <span className="block text-[11px] text-slate-400 mb-1">Giá trị vốn</span>
                        <span className={`font-bold text-sm block py-1.5 ${overLimit ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>
                    </div>

                    {/* Conversion summary */}
                    {!item.availableUnits.find((u) => u.unitName === item.unitName)?.isBase && (
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <Scale className="w-3 h-3 text-amber-500 shrink-0" />
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Xuất{' '}
                          <strong className="text-amber-600 dark:text-amber-400">
                            {item.quantity} {item.unitName}
                          </strong>
                          {' = '}
                          <strong className="text-slate-700 dark:text-slate-300">
                            {item.baseQty} {item.baseUnit}
                          </strong>
                          {' — Tồn còn lại sau xuất: '}
                          <strong className={item.currentStock - item.baseQty < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}>
                            {item.currentStock - item.baseQty} {item.baseUnit}
                          </strong>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Info & Submit (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Thông Tin Phiếu Xuất
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Lý do xuất kho *
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as StockOutReason)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockout-reason"
              >
                <option value="sale">Xuất bán hàng thương mại</option>
                <option value="transfer">Xuất điều chuyển giữa các kho</option>
                <option value="damaged">Xuất hủy hàng lỗi / hỏng hóc</option>
                <option value="expired">Xuất hàng hết hạn bảo hành</option>
                <option value="other">Xuất mục đích khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-slate-400" /> Kho xuất *
              </label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockout-warehouse"
              >
                <option value="Kho Tổng TP. HCM">Kho Tổng TP. HCM</option>
                <option value="Kho Tổng Hà Nội">Kho Tổng Hà Nội</option>
              </select>
            </div>

            {reason === 'transfer' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Kho nhận đích đến *
                </label>
                <select
                  value={destinationWarehouse}
                  onChange={(e) => setDestinationWarehouse(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  id="stockout-dest"
                >
                  <option value="Kho Showroom Quận 1">Kho Showroom Quận 1</option>
                  <option value="Kho Showroom Hà Nội">Kho Showroom Hà Nội</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Ngày xuất *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockout-date"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Ghi chú phiếu xuất
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Số đơn hàng liên quan, lý do chi tiết..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockout-note"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3 h-3 text-amber-500" /> Tổng SL xuất (cơ sở):
              </span>
              <span className="font-bold text-slate-900 dark:text-white">{totalBaseQty}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Số dòng hàng:</span>
              <span className="font-medium">{items.length} mục</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-amber-200/60 dark:border-amber-900/60">
              <span className="font-bold text-slate-800 dark:text-slate-200">Tổng giá trị vốn:</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-400">
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
              variant="danger"
              className="flex-1 font-bold"
              onClick={() => setIsConfirmOpen(true)}
              leftIcon={<ArrowUpRight className="w-4 h-4" />}
              id="stockout-submit"
            >
              Xác nhận xuất kho
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
        title="Xác nhận xuất kho"
        message={`Bạn có chắc chắn muốn xuất ${totalBaseQty} đơn vị (cơ sở) khỏi ${warehouse}? Số lượng tồn của sản phẩm sẽ bị giảm trừ tương ứng.`}
        confirmText="Hoàn tất xuất kho"
        variant="warning"
      />
    </PageContainer>
  );
};
