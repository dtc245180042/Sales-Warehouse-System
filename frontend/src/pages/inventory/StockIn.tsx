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
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { initialSuppliers } from '../../mock/suppliers';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { Product } from '../../types/Product';
import { StockInItem } from '../../types/Inventory';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export const StockIn: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState(initialSuppliers[0].id);
  const [warehouse, setWarehouse] = useState('Kho Tổng TP. HCM');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<StockInItem[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    productService.getAll().then((data) => {
      setProducts(data);
      if (data.length > 0) {
        // Init with 1 item default
        setItems([
          {
            productId: data[0].id,
            sku: data[0].sku,
            name: data[0].name,
            quantity: 10,
            costPrice: data[0].costPrice,
            subtotal: 10 * data[0].costPrice,
          },
        ]);
      }
    });
  }, []);

  const handleAddItem = () => {
    if (products.length === 0) return;
    const defaultProd = products[0];
    setItems((prev) => [
      ...prev,
      {
        productId: defaultProd.id,
        sku: defaultProd.sku,
        name: defaultProd.name,
        quantity: 5,
        costPrice: defaultProd.costPrice,
        subtotal: 5 * defaultProd.costPrice,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, newProdId: string) => {
    const selected = products.find((p) => p.id === newProdId);
    if (!selected) return;

    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        productId: selected.id,
        sku: selected.sku,
        name: selected.name,
        costPrice: selected.costPrice,
        subtotal: updated[index].quantity * selected.costPrice,
      };
      return updated;
    });
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const validQty = Math.max(1, qty || 0);
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: validQty,
        subtotal: validQty * updated[index].costPrice,
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
        subtotal: updated[index].quantity * validPrice,
      };
      return updated;
    });
  };

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      showToast('Vui lòng thêm ít nhất một sản phẩm nhập kho', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const supplier = initialSuppliers.find((s) => s.id === supplierId);
      await inventoryService.createStockInReceipt({
        supplierId,
        supplierName: supplier?.name || 'Nhà cung cấp',
        warehouse,
        date,
        items,
        totalQuantity,
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
                  Chọn sản phẩm, số lượng và đơn giá nhập thực tế
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
                    <div className="sm:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Sản phẩm *
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Số lượng *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(index, Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Giá nhập (đ) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={item.costPrice}
                        onChange={(e) => handlePriceChange(index, Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-2 text-right">
                      <span className="block text-[11px] text-slate-400 mb-1">Thành tiền</span>
                      <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 block py-1.5">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Receipt details & Summary (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Thông Tin Phiếu Nhập
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Nhà cung cấp *
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {initialSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Kho nhập *
              </label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Kho Tổng TP. HCM">Kho Tổng TP. HCM</option>
                <option value="Kho Tổng Hà Nội">Kho Tổng Hà Nội</option>
                <option value="Kho Showroom Quận 1">Kho Showroom Quận 1</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Ngày nhập *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Ghi chú phiếu nhập
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Số hợp đồng, hóa đơn đỏ kèm theo..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-6 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Tổng số lượng:</span>
              <span className="font-bold text-slate-900 dark:text-white">{totalQuantity} chiếc</span>
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
        message={`Bạn có chắc chắn muốn nhập ${totalQuantity} sản phẩm với tổng giá trị ${formatCurrency(totalAmount)} vào ${warehouse}? Tồn kho sẽ được cộng ngay.`}
        confirmText="Hoàn tất nhập kho"
        variant="info"
      />
    </PageContainer>
  );
};
