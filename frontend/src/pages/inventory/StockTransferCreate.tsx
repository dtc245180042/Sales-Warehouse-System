import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Search,
  Package,
  Calendar,
  Truck,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { QuantityStepper } from '../../components/common/QuantityStepper';
import { stockTransferService } from '../../services/stockTransferService';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';
import { StockTransferItem } from '../../types/StockTransfer';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

const WAREHOUSE_OPTIONS = [
  'Kho Tổng Hà Nội',
  'Kho Tổng TP. HCM',
  'Kho Đà Nẵng',
  'Kho Cần Thơ',
];

const PRESET_REASONS = [
  'Điều chuyển cân đối hàng tồn giữa các kho chi nhánh',
  'Bổ sung hàng tồn tối thiểu cho kho thiếu hụt',
  'Điều hàng phục vụ đơn hàng đại lý trọng điểm',
  'Tập kết hàng phục vụ chương trình khuyến mãi tháng',
];

/**
 * Ước lượng hoặc tra cứu giá vốn mặc định hợp lý cho sản phẩm (> 0)
 */
export const getInitialCostPrice = (
  product: { id?: string | number; sku?: string; name?: string; costPrice?: number; salePrice?: number; price?: number },
  whCost?: number
): number => {
  if (whCost && whCost > 0) return whCost;
  if (product.costPrice && product.costPrice > 0) return product.costPrice;
  if (product.salePrice && product.salePrice > 0) return Math.round(product.salePrice * 0.8);
  if (product.price && product.price > 0) return Math.round(product.price * 0.8);

  const text = `${product.name || ''} ${product.sku || ''}`.toLowerCase();
  if (
    text.includes('laptop') ||
    text.includes('dell') ||
    text.includes('macbook') ||
    text.includes('thinkpad') ||
    text.includes('precision') ||
    text.includes('xps')
  ) {
    return 20000000;
  }
  if (
    text.includes('iphone') ||
    text.includes('samsung') ||
    text.includes('galaxy') ||
    text.includes('phone') ||
    text.includes('điện thoại')
  ) {
    return 18000000;
  }
  if (text.includes('màn hình') || text.includes('monitor') || text.includes('ultrasharp') || text.includes('display')) {
    return 9000000;
  }
  if (text.includes('tai nghe') || text.includes('airpods') || text.includes('headphone')) {
    return 3500000;
  }
  if (text.includes('chuột') || text.includes('mouse') || text.includes('bàn phím') || text.includes('keyboard')) {
    return 1500000;
  }
  if (text.includes('ipad') || text.includes('tablet') || text.includes('máy tính bảng')) {
    return 12000000;
  }
  return 1000000;
};

/**
 * Component ô nhập đơn giá vốn trực quan:
 * - Hiển thị có định dạng tiền tệ (VNĐ)
 * - Cho phép click và nhập số tự do
 * - Tự động tính lại thành tiền ngay lập tức
 */
const CostPriceInput: React.FC<{
  value: number;
  onChange: (val: number) => void;
}> = ({ value, onChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState('');

  const displayFormatted = value ? `${formatNumber(value)} đ` : '0 đ';

  return (
    <div className="relative inline-flex items-center">
      <input
        type="text"
        inputMode="numeric"
        title="Nhấp để sửa đơn giá vốn sản phẩm"
        value={isFocused ? rawText : displayFormatted}
        onFocus={() => {
          setIsFocused(true);
          setRawText(value ? formatNumber(value) : '');
        }}
        onBlur={() => {
          setIsFocused(false);
          const clean = rawText.replace(/\D/g, '');
          const num = clean ? parseInt(clean, 10) : 0;
          onChange(num);
        }}
        onChange={(e) => {
          const clean = e.target.value.replace(/\D/g, '');
          setRawText(clean ? formatNumber(parseInt(clean, 10)) : '');
          const num = clean ? parseInt(clean, 10) : 0;
          onChange(num);
        }}
        className="w-36 px-2.5 py-1 text-right text-xs font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm"
        placeholder="0 đ"
      />
    </div>
  );
};

export const StockTransferCreate: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { role } = useAuth();
  const canViewCostPrice = ['Admin', 'SalesManager', 'WarehouseManager', 'Accountant', 'Director'].includes(role);

  const [sourceWarehouse, setSourceWarehouse] = useState<string>('Kho Tổng Hà Nội');
  const [destWarehouse, setDestWarehouse] = useState<string>('Kho Đà Nẵng');
  const [note, setNote] = useState<string>('Điều chuyển cân đối hàng tồn giữa các kho chi nhánh');
  const [items, setItems] = useState<StockTransferItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [warehouseStockMap, setWarehouseStockMap] = useState<Record<string, number>>({});
  const [warehouseCostMap, setWarehouseCostMap] = useState<Record<string, number>>({});
  const [warehouseUnitMap, setWarehouseUnitMap] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Tải danh sách sản phẩm từ hệ thống
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const prods = await productService.getAll();
        setAllProducts(prods);

        // Nạp tồn kho theo kho xuất
        await loadWarehouseStocks(sourceWarehouse);
      } catch (err: any) {
        console.warn('Error loading products:', err);
      }
    };
    loadProducts();
  }, []);

  // Khi thay đổi kho xuất -> cập nhật lại bản đồ tồn kho tại kho xuất đó
  const loadWarehouseStocks = async (wh: string) => {
    try {
      const whStocks = await stockTransferService.getWarehouseStocks(wh);
      const stockMap: Record<string, number> = {};
      const costMap: Record<string, number> = {};
      const unitMap: Record<string, string> = {};

      whStocks.forEach((ws) => {
        stockMap[ws.product_id] = ws.stock;
        if (ws.cost_price && ws.cost_price > 0) {
          costMap[ws.product_id] = ws.cost_price;
        }
        if (ws.unit) {
          unitMap[ws.product_id] = ws.unit;
        }
      });

      setWarehouseStockMap(stockMap);
      setWarehouseCostMap(costMap);
      setWarehouseUnitMap(unitMap);
    } catch (err) {
      console.warn('Error loading wh stocks:', err);
    }
  };

  useEffect(() => {
    loadWarehouseStocks(sourceWarehouse);
  }, [sourceWarehouse]);

  // Tự động cập nhật lại số lượng tồn khả dụng cho các dòng hàng khi đổi kho xuất
  useEffect(() => {
    setItems((prev) =>
      prev.map((i) => ({
        ...i,
        available_stock: warehouseStockMap[i.product_id] ?? i.available_stock,
      }))
    );
  }, [warehouseStockMap]);

  // Tự động kiểm tra và bù giá vốn hợp lý cho các sản phẩm nếu đang bị = 0 (khắc phục dữ liệu cũ)
  useEffect(() => {
    setItems((prev) => {
      let changed = false;
      const updated = prev.map((item) => {
        if (!item.cost_price || item.cost_price <= 0) {
          changed = true;
          const autoCost = getInitialCostPrice(
            { id: item.product_id, sku: item.sku, name: item.product_name },
            warehouseCostMap[item.product_id]
          );
          return { ...item, cost_price: autoCost };
        }
        return item;
      });
      return changed ? updated : prev;
    });
  }, [warehouseCostMap]);

  // Kiểm tra ràng buộc kho trùng nhau
  const isSameWarehouse = sourceWarehouse === destWarehouse;

  // Tìm kiếm sản phẩm
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      return allProducts.slice(0, 8);
    }
    const term = searchTerm.toLowerCase().trim();
    return allProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode && p.barcode.toLowerCase().includes(term))
      )
      .slice(0, 10);
  }, [searchTerm, allProducts]);

  // Thêm sản phẩm vào phiếu chuyển
  const handleAddProduct = (product: Product) => {
    // Nếu sản phẩm đã có trong danh sách -> tăng số lượng
    const existingIndex = items.findIndex((i) => i.product_id === product.id);
    const availableStock = warehouseStockMap[product.id] ?? (product.stock || 50);

    if (existingIndex !== -1) {
      const updated = [...items];
      const cur = updated[existingIndex];
      if (cur.transfer_quantity + 1 > availableStock) {
        showToast(`Số lượng không được vượt quá tồn khả dụng tại kho xuất (${availableStock} ${cur.unit})`, 'error');
        return;
      }
      cur.transfer_quantity += 1;
      setItems(updated);
    } else {
      const resolvedCost = getInitialCostPrice(product, warehouseCostMap[product.id]);
      const resolvedUnit = warehouseUnitMap[product.id] || product.unit || 'Chiếc';

      const newItem: StockTransferItem = {
        product_id: product.id,
        sku: product.sku,
        product_name: product.name,
        unit: resolvedUnit,
        transfer_quantity: 1,
        cost_price: resolvedCost,
        available_stock: availableStock,
      };
      setItems([...items, newItem]);
    }

    setSearchTerm('');
    setIsSearching(false);
  };

  // Cập nhật số lượng chuyển
  const handleUpdateQuantity = (index: number, qty: number) => {
    const updated = [...items];
    const item = updated[index];
    if (!item) return;
    item.transfer_quantity = qty;
    setItems(updated);
  };

  // Cập nhật đơn giá vốn của dòng sản phẩm
  const handleUpdateCostPrice = (index: number, newCost: number) => {
    setItems((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          cost_price: Math.max(0, newCost),
        };
      }
      return updated;
    });
  };

  // Xóa sản phẩm khỏi danh sách
  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Tính tổng
  const totalQuantity = useMemo(() => items.reduce((sum, i) => sum + i.transfer_quantity, 0), [items]);
  const totalValue = useMemo(() => items.reduce((sum, i) => sum + i.transfer_quantity * (i.cost_price || 0), 0), [items]);

  // Kiểm tra tính hợp lệ của toàn bộ form
  const isFormValid = useMemo(() => {
    if (isSameWarehouse) return false;
    if (items.length === 0) return false;
    for (const it of items) {
      if (it.transfer_quantity <= 0) return false;
      const avail = it.available_stock ?? warehouseStockMap[it.product_id] ?? 999;
      if (it.transfer_quantity > avail) return false;
    }
    return true;
  }, [isSameWarehouse, items, warehouseStockMap]);

  // Xử lý gửi form
  const handleSubmit = async (shipImmediately: boolean) => {
    if (!isFormValid) {
      if (isSameWarehouse) {
        showToast('Kho xuất và kho nhập không được trùng nhau!', 'error');
      } else if (items.length === 0) {
        showToast('Vui lòng chọn ít nhất một mặt hàng cần chuyển!', 'error');
      }
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        source_warehouse: sourceWarehouse,
        destination_warehouse: destWarehouse,
        note: note.trim() || undefined,
        ship_immediately: shipImmediately,
        items: items.map((it) => ({
          product_id: it.product_id,
          sku: it.sku,
          product_name: it.product_name,
          unit: it.unit,
          transfer_quantity: it.transfer_quantity,
          cost_price: it.cost_price,
        })),
      };

      const result = await stockTransferService.createTransfer(payload);
      showToast(
        shipImmediately
          ? `Lập và xuất kho thành công phiếu ${result.code}! Hàng đang trên đường vận chuyển.`
          : `Lưu thành công bản nháp phiếu chuyển kho ${result.code}!`,
        'success'
      );
      navigate(`/inventory/transfers/${result.id}`);
    } catch (err: any) {
      showToast('Lỗi lập phiếu: ' + (err.message || ''), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Lập Phiếu Chuyển Kho Nội Bộ"
      subtitle="Điều động hàng hóa giữa các kho trực thuộc, tự động kiểm tra tồn kho nguồn và theo dõi hàng trên đường"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/inventory/transfers')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Hủy & Quay lại
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!isFormValid || submitting}
            onClick={() => handleSubmit(false)}
          >
            Lưu bản nháp
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!isFormValid || submitting}
            onClick={() => handleSubmit(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
          >
            <Truck className="w-4 h-4" />
            Xuất chuyển đi ngay
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cột trái: Thông tin kho và danh sách hàng hóa */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card lộ trình điều chuyển */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-blue-600" />
              Lộ trình kho điều chuyển
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Kho xuất (Nguồn hàng đi) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={sourceWarehouse}
                  onChange={(e) => setSourceWarehouse(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {WAREHOUSE_OPTIONS.map((wh) => (
                    <option key={`src-${wh}`} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">Tồn kho sẽ được trừ tại kho này khi xuất chuyển</p>
              </div>

              <div className="md:col-span-1 flex justify-center pt-4 md:pt-0">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>

              <div className="md:col-span-5 space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  Kho nhập (Đích đến) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={destWarehouse}
                  onChange={(e) => setDestWarehouse(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {WAREHOUSE_OPTIONS.map((wh) => (
                    <option key={`dest-${wh}`} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">Hàng chỉ được cộng vào kho này khi xác nhận nhận đủ</p>
              </div>
            </div>

            {/* Cảnh báo nếu 2 kho trùng nhau */}
            {isSameWarehouse && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>
                  <strong>Lỗi ràng buộc:</strong> Kho xuất và kho nhập không được trùng nhau! Vui lòng chọn hai kho hàng khác nhau.
                </span>
              </div>
            )}

            {/* Lý do / Ghi chú */}
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Ghi chú / Lý do điều chuyển
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Điều chuyển cân đối hàng tồn cho chi nhánh Miền Trung..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_REASONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNote(preset)}
                    className="text-[11px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card chọn sản phẩm và danh sách mặt hàng */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Danh sách hàng hóa cần chuyển ({items.length} mặt hàng)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tồn kho khả dụng hiển thị theo kho xuất đang chọn ({sourceWarehouse})
                </p>
              </div>
            </div>

            {/* Thanh tìm kiếm và chọn sản phẩm */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsSearching(true);
                }}
                onFocus={() => setIsSearching(true)}
                placeholder="Gõ mã SKU hoặc tên sản phẩm để thêm vào phiếu..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />

              {/* Popup kết quả gợi ý sản phẩm */}
              {isSearching && filteredProducts.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.map((p) => {
                    const avail = warehouseStockMap[p.id] ?? (p.stock || 50);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleAddProduct(p)}
                        className="p-3 hover:bg-blue-50/60 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center font-bold text-xs">
                            {p.unit || 'cái'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{p.name}</p>
                            <p className="text-xs font-mono text-slate-400">SKU: {p.sku}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                              avail > 0
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                            }`}
                          >
                            Tồn tại kho: {avail} {p.unit}
                          </span>
                          {canViewCostPrice && (
                            <p className="text-xs text-slate-400 mt-0.5 font-mono">
                              Giá vốn: {formatCurrency(getInitialCostPrice(p, warehouseCostMap[p.id]))}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bảng danh sách hàng đã chọn */}
            {items.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                <Package className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Chưa có sản phẩm nào được chọn
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Nhập mã SKU hoặc tên sản phẩm vào thanh tìm kiếm phía trên để thêm mặt hàng
                </p>
              </div>
            ) : (
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-3 px-4">Sản phẩm</th>
                      <th className="py-3 px-4 text-center">Tồn kho nguồn</th>
                      <th className="py-3 px-4 text-center whitespace-nowrap min-w-[140px]">Số lượng chuyển</th>
                      {canViewCostPrice && (
                        <>
                          <th className="py-3 px-4 text-right min-w-[170px]">Đơn giá vốn</th>
                          <th className="py-3 px-4 text-right min-w-[150px]">Thành tiền</th>
                        </>
                      )}
                      <th className="py-3 px-4 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const avail = item.available_stock ?? warehouseStockMap[item.product_id] ?? 999;
                      const isOverStock = item.transfer_quantity > avail;
                      const subtotal = item.transfer_quantity * (item.cost_price || 0);

                      return (
                        <tr key={item.product_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{item.product_name}</p>
                            <p className="text-xs font-mono text-slate-400">SKU: {item.sku || 'N/A'}</p>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                avail > 0
                                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                              }`}
                            >
                              {avail} {item.unit}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <QuantityStepper
                              value={item.transfer_quantity}
                              min={1}
                              max={avail}
                              onChange={(val) => handleUpdateQuantity(idx, val)}
                            />
                            {isOverStock && (
                              <p className="text-[10px] text-rose-500 mt-1 font-semibold">Vượt tồn kho!</p>
                            )}
                          </td>

                      {canViewCostPrice && (
                        <>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <CostPriceInput
                                value={item.cost_price || 0}
                                onChange={(val) => handleUpdateCostPrice(idx, val)}
                              />
                              <span className="text-[10px] text-slate-400 mt-0.5">Nhấp để chỉnh sửa</span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right font-semibold font-mono text-slate-900 dark:text-slate-100 text-sm">
                            {formatCurrency(subtotal)}
                          </td>
                        </>
                      )}

                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Cột phải: Tổng kết và thông tin phiếu */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-sm sticky top-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              Tổng kết phiếu chuyển kho
            </h3>

            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Kho xuất (Đi):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{sourceWarehouse}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Kho nhập (Đến):</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{destWarehouse}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Số lượng dòng SKU:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{items.length} mặt hàng</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Tổng số lượng chuyển:</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {formatNumber(totalQuantity)}
                </span>
              </div>

              {canViewCostPrice && (
                <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Tổng giá trị vốn:</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(totalValue)}
                  </span>
                </div>
              )}
            </div>

            {/* Quy trình điều chuyển minh họa */}
            <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs space-y-2 text-slate-500 dark:text-slate-400">
              <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                Cơ chế đồng bộ số liệu:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Khi xuất kho: Tồn kho xuất giảm ngay, ghi nhận hàng đang trên đường.</li>
                <li>Kho đến CHƯA được cộng tồn kho cho tới khi xác nhận nhận đủ.</li>
                <li>Nếu nhận thiếu hoặc thừa, bắt buộc phải nhập lý do chênh lệch.</li>
              </ul>
            </div>

            {/* Nút hành động */}
            <div className="mt-6 space-y-2.5">
              <Button
                variant="primary"
                size="lg"
                disabled={!isFormValid || submitting}
                onClick={() => handleSubmit(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
              >
                <Truck className="w-4 h-4" />
                Xuất chuyển đi ngay
              </Button>

              <Button
                variant="outline"
                size="md"
                disabled={!isFormValid || submitting}
                onClick={() => handleSubmit(false)}
                className="w-full"
              >
                Lưu thành bản nháp
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
