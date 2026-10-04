import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Warehouse,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { Product } from '../../types/Product';
import { StockOutItem, StockOutReason } from '../../types/Inventory';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

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
  const [items, setItems] = useState<StockOutItem[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    productService.getAll().then((data) => {
      setProducts(data);
      const inStock = data.filter((p) => p.stock > 0);
      if (inStock.length > 0) {
        setItems([
          {
            productId: inStock[0].id,
            sku: inStock[0].sku,
            name: inStock[0].name,
            currentStock: inStock[0].stock,
            quantity: 1,
            costPrice: inStock[0].costPrice,
            subtotal: inStock[0].costPrice,
          },
        ]);
      }
    });
  }, []);

  const handleAddItem = () => {
    const inStock = products.filter((p) => p.stock > 0);
    if (inStock.length === 0) {
      showToast('Không có sản phẩm nào còn tồn kho để xuất', 'warning');
      return;
    }
    const prod = inStock[0];
    setItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        currentStock: prod.stock,
        quantity: 1,
        costPrice: prod.costPrice,
        subtotal: prod.costPrice,
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
        currentStock: selected.stock,
        costPrice: selected.costPrice,
        subtotal: Math.min(updated[index].quantity, selected.stock) * selected.costPrice,
      };
      return updated;
    });
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setItems((prev) => {
      const updated = [...prev];
      const maxAvailable = updated[index].currentStock;
      const validQty = Math.max(1, Math.min(qty || 1, maxAvailable));
      
      if (qty > maxAvailable) {
        showToast(
          `Không thể xuất quá ${maxAvailable} (tồn kho hiện tại của ${updated[index].name})`,
          'warning'
        );
      }

      updated[index] = {
        ...updated[index],
        quantity: validQty,
        subtotal: validQty * updated[index].costPrice,
      };
      return updated;
    });
  };

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      showToast('Vui lòng thêm sản phẩm cần xuất', 'warning');
      return;
    }

    // Check if any item exceeds current stock
    for (const it of items) {
      const p = products.find((x) => x.id === it.productId);
      if (p && it.quantity > p.stock) {
        showToast(`Sản phẩm ${it.name} không đủ tồn kho để xuất!`, 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await inventoryService.createStockOutReceipt({
        reason,
        warehouse,
        destinationWarehouse: reason === 'transfer' ? destinationWarehouse : undefined,
        date,
        items,
        totalQuantity,
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
                  Hệ thống tự động kiểm tra số lượng không vượt quá tồn kho khả dụng
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
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Sản phẩm xuất *
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id} disabled={p.stock === 0}>
                            {p.sku} - {p.name} (Tồn: {p.stock})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Số lượng xuất (Max: {item.currentStock}) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={item.currentStock}
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(index, Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-3 text-right">
                      <span className="block text-[11px] text-slate-400 mb-1">Giá trị xuất (giá vốn)</span>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block py-1.5">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
              >
                <option value="sale">Xuất bán hàng thương mại</option>
                <option value="transfer">Xuất điều chuyển giữa các kho</option>
                <option value="damaged">Xuất hủy hàng lỗi / hỏng hóc</option>
                <option value="expired">Xuất hàng hết hạn bảo hành</option>
                <option value="other">Xuất mục đích khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Kho xuất *
              </label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                >
                  <option value="Kho Showroom Quận 1">Kho Showroom Quận 1</option>
                  <option value="Kho Showroom Hà Nội">Kho Showroom Hà Nội</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Ngày xuất *
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
                Ghi chú phiếu xuất
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Số đơn hàng liên quan, lý do chi tiết..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-6 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Tổng số lượng xuất:</span>
              <span className="font-bold text-slate-900 dark:text-white">{totalQuantity} đơn vị</span>
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
        message={`Bạn có chắc chắn muốn xuất ${totalQuantity} sản phẩm khỏi ${warehouse}? Số lượng tồn của sản phẩm sẽ bị giảm trừ tương ứng.`}
        confirmText="Hoàn tất xuất kho"
        variant="warning"
      />
    </PageContainer>
  );
};
