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
  Barcode,
  Save,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { UnitQtySelector, UnitQtySelectorValue } from '../../components/common/UnitQtySelector';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { formatCurrency } from '../../utils/formatters';
import { initialSuppliers } from '../../mock/suppliers';
import { unitConfigService } from '../../mock/unitConversions';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { stockReceiptService } from '../../services/stockReceiptService';
import { Product, UnitConversion } from '../../types/Product';
import { StockInItem } from '../../types/Inventory';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

// ── Extended item state (bao gồm thông tin đơn vị, số lô, hạn sử dụng) ──
interface StockInItemState extends StockInItem {
  availableUnits: UnitConversion[];
  baseUnit: string;
  lotNumber?: string;
  expiryDate?: string;
}

// ── Helper: build default units khi sản phẩm chưa có cấu hình ──
const buildDefaultUnits = (product: Product): UnitConversion[] => [
  {
    id: `${product.id}-base`,
    unitName: product.unit || 'cái',
    ratio: 1,
    isBase: true,
  },
];

// ── Helper: khởi tạo item state từ product ──
const buildItemState = (product: Product): StockInItemState => {
  const config = unitConfigService.getByProductId(product.id);
  const availableUnits = config ? config.units : buildDefaultUnits(product);
  const baseUnit = config ? config.baseUnit : (product.unit || 'cái');
  const defaultUnit = availableUnits[0];
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity: 10,
    unitName: defaultUnit.unitName,
    unitRatio: defaultUnit.ratio,
    baseQty: 10 * defaultUnit.ratio,
    costPrice: product.costPrice || 0,
    subtotal: 10 * defaultUnit.ratio * (product.costPrice || 0),
    availableUnits,
    baseUnit,
    lotNumber: '',
    expiryDate: '',
  };
};

export const StockIn: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState(initialSuppliers[0].id);
  const [warehouseId, setWarehouseId] = useState<number>(1);
  const [receiptCode, setReceiptCode] = useState(`PNK-${Date.now().toString().slice(-6)}`);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<StockInItemState[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'confirm'>('confirm');

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

  const handleLotChange = (index: number, lotNumber: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], lotNumber };
      return updated;
    });
  };

  const handleExpiryChange = (index: number, expiryDate: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], expiryDate };
      return updated;
    });
  };

  // Tổng kho tính theo đơn vị cơ sở
  const totalBaseQty = items.reduce((sum, item) => sum + item.baseQty, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const getWarehouseName = (id: number) => {
    if (id === 1) return 'Kho Tổng Hà Nội';
    if (id === 2) return 'Kho Đà Nẵng';
    return 'Kho Tổng TP. HCM';
  };

  const executeSave = async (mode: 'draft' | 'confirm') => {
    if (items.length === 0) {
      showToast('Vui lòng thêm ít nhất một sản phẩm nhập kho', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const supplier = initialSuppliers.find((s) => s.id === supplierId);
      const whName = getWarehouseName(warehouseId);

      // 1. Gọi backend S5-04 API: /api/v1/stock-receipts
      const apiPayload = {
        supplier_id: parseInt(supplierId.replace(/\D/g, '') || '1', 10),
        warehouse_id: warehouseId,
        receipt_code: receiptCode.trim() || `PNK-${Date.now().toString().slice(-6)}`,
        receipt_date: date,
        note: note.trim() || undefined,
        items: items.map((it) => ({
          product_id: it.productId,
          input_quantity: it.quantity,
          input_unit: it.unitName || 'cái',
          conversion_rate: it.unitRatio || 1,
          lot_number: it.lotNumber?.trim() || undefined,
          expiry_date: it.expiryDate?.trim() || undefined,
          note: undefined,
        })),
      };

      try {
        const createdReceipt = await stockReceiptService.create(apiPayload);
        if (mode === 'confirm') {
          await stockReceiptService.confirm(createdReceipt.id);
          showToast(`Đã xác nhận phiếu nhập kho ${createdReceipt.receipt_code}! Đã cộng tồn kho thực tế.`, 'success');
        } else {
          showToast(`Đã lưu phiếu nhập kho nháp ${createdReceipt.receipt_code}! Tồn kho chưa thay đổi.`, 'info');
        }
      } catch (backendErr: any) {
        console.warn('Backend API stock-receipts error, sync local state:', backendErr);
        // Fallback local storage để đảm bảo trải nghiệm offline mượt mà
        const stockInItems: StockInItem[] = items.map((it) => ({
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          quantity: it.baseQty,
          unitName: it.unitName,
          unitRatio: it.unitRatio,
          baseQty: it.baseQty,
          costPrice: it.costPrice,
          subtotal: it.subtotal,
        }));

        await inventoryService.createStockInReceipt({
          supplierId,
          supplierName: supplier?.name || 'Nhà cung cấp',
          warehouse: whName,
          date,
          items: stockInItems,
          totalQuantity: totalBaseQty,
          totalAmount,
          note,
          status: mode === 'confirm' ? 'completed' : 'draft',
          createdBy: user?.name || 'Thủ kho',
        });
        showToast(
          mode === 'confirm' ? 'Tạo phiếu nhập kho thành công! Đã tăng tồn kho.' : 'Đã lưu phiếu nhập kho ở trạng thái nháp.',
          'success'
        );
      }

      navigate('/inventory');
    } catch (err: any) {
      showToast(err.response?.data?.detail || err.message || 'Có lỗi xảy ra', 'error');
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <PageContainer
      title="Tạo Phiếu Nhập Kho Nhà Cung Cấp"
      subtitle="Quy đổi ĐVT về đơn vị cơ sở, quản lý số lô & hạn sử dụng (Sprint 5: S5-04)"
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
                  Chọn sản phẩm, đơn vị nhập, số lô và HSD — hệ thống tự động quy đổi về đơn vị cơ sở
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
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Giá nhập (đ/cơ sở)
                      </label>
                      <CurrencyInput
                        value={item.costPrice}
                        onChange={(val) => handlePriceChange(index, val)}
                        placeholder="0"
                        suffix="đ"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 font-medium"
                        id={`stockin-price-${index}`}
                      />
                    </div>
                  </div>

                  {/* S5-04 AC-3: Lô và Hạn sử dụng */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Barcode className="w-3 h-3 text-indigo-500" /> Số lô sản xuất (Lot No.)
                      </label>
                      <input
                        type="text"
                        value={item.lotNumber || ''}
                        onChange={(e) => handleLotChange(index, e.target.value)}
                        placeholder="VD: LOT-2026-A1"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-500" /> Hạn sử dụng (Expiry Date)
                      </label>
                      <input
                        type="date"
                        value={item.expiryDate || ''}
                        onChange={(e) => handleExpiryChange(index, e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Conversion summary row */}
                  {!item.availableUnits.find((u) => u.unitName === item.unitName)?.isBase && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                      <Scale className="w-3 h-3 text-indigo-500 shrink-0" />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Quy đổi tồn kho:{' '}
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
              Chứng Từ Nhập Kho
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Barcode className="w-3.5 h-3.5 text-slate-400" /> Số chứng từ / Hóa đơn NCC *
              </label>
              <input
                type="text"
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value)}
                placeholder="VD: PNK-2026-001"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-code"
              />
            </div>

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
                value={warehouseId}
                onChange={(e) => setWarehouseId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-warehouse"
              >
                <option value={1}>Kho Tổng Hà Nội</option>
                <option value={2}>Kho Đà Nẵng</option>
                <option value={3}>Kho Tổng TP. HCM</option>
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
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Số hợp đồng, tài xế giao hàng..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="stockin-note"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3 h-3 text-indigo-400" /> Tổng SL cơ sở:
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
              <span className="font-bold text-slate-800 dark:text-slate-200">Tổng tiền dự tính:</span>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          {/* Actions: Draft & Confirm */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs sm:text-sm py-2.5 font-semibold"
                onClick={() => {
                  setSubmitMode('draft');
                  setIsConfirmOpen(true);
                }}
                leftIcon={<Save className="w-4 h-4 text-slate-500" />}
                id="stockin-draft"
              >
                Lưu Nháp (Draft)
              </Button>
              <Button
                variant="primary"
                className="flex-1 text-xs sm:text-sm py-2.5 font-bold"
                onClick={() => {
                  setSubmitMode('confirm');
                  setIsConfirmOpen(true);
                }}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
                id="stockin-submit"
              >
                Xác Nhận Nhập Kho
              </Button>
            </div>
            <Button
              variant="secondary"
              className="w-full text-xs py-2 text-slate-500"
              onClick={() => navigate('/inventory')}
            >
              Hủy bỏ
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => executeSave(submitMode)}
        isLoading={isSubmitting}
        title={submitMode === 'confirm' ? 'Xác nhận nhập kho & cộng tồn' : 'Lưu phiếu nhập kho nháp'}
        message={
          submitMode === 'confirm'
            ? `Bạn có chắc chắn muốn xác nhận phiếu ${receiptCode} với ${totalBaseQty} đơn vị cơ sở vào ${getWarehouseName(warehouseId)}? Tồn kho sẽ được cộng ngay và ghi nhận sổ thẻ kho.`
            : `Lưu phiếu ${receiptCode} ở trạng thái Nháp (DRAFT). Tồn kho sẽ KHÔNG bị thay đổi cho đến khi được xác nhận.`
        }
        confirmText={submitMode === 'confirm' ? 'Xác nhận & Cộng tồn' : 'Lưu bản nháp'}
        variant={submitMode === 'confirm' ? 'info' : 'warning'}
      />
    </PageContainer>
  );
};
