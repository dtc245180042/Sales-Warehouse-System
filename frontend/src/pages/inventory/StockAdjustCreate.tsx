import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Flame,
  CalendarX,
  FileQuestion,
  Warehouse,
  Plus,
  Trash2,
  AlertTriangle,
  Send,
  Save,
  Search,
  X,
  Package,
  Layers,
  UserCheck,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { productService } from '../../services/productService';
import { stockAdjustService } from '../../services/stockAdjustService';
import { Product } from '../../types/Product';
import { AdjustType, StockAdjustItem } from '../../types/StockAdjust';
import { formatNumber } from '../../utils/formatters';

const WAREHOUSE_OPTIONS = [
  'Kho Tổng Hà Nội',
  'Kho Tổng TP. HCM',
  'Kho Đà Nẵng',
  'Kho Cần Thơ',
];

export const StockAdjustCreate: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [warehouse, setWarehouse] = useState<string>(WAREHOUSE_OPTIONS[0]);
  const [adjustType, setAdjustType] = useState<AdjustType>('damaged');
  const [adjustDate, setAdjustDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState<string>('');
  const [items, setItems] = useState<StockAdjustItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Modal product picker state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const list = await productService.getAll();
        setAllProducts(list);
      } catch {
        setAllProducts(productService.getCached());
      } finally {
        setLoadingProducts(false);
      }
    };
    loadProducts();
  }, []);

  const handleOpenProductModal = () => {
    setProductSearch('');
    setIsProductModalOpen(true);
  };

  const handleSelectProduct = (product: Product) => {
    // Check if already in list
    if (items.some((i) => i.productId === product.id || i.sku === product.sku)) {
      showToast('Sản phẩm này đã có trong danh sách', 'warning');
      return;
    }

    const newItem: StockAdjustItem = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentStock: Number(product.stock ?? 10),
      adjustQty: 1,
      costPrice: Number(product.costPrice ?? product.salePrice ?? 0),
      lossValue: Number(product.costPrice ?? product.salePrice ?? 0),
      note: '',
    };

    setItems((prev) => [...prev, newItem]);
    setIsProductModalOpen(false);
    showToast(`Đã thêm "${product.name}"`, 'success');
  };

  const handleUpdateQty = (index: number, qty: number) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const validQty = Math.max(0, qty);
      const lossValue = validQty * current.costPrice;
      next[index] = { ...current, adjustQty: validQty, lossValue };
      return next;
    });
  };

  const handleUpdateItemNote = (index: number, note: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], note };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalLossQty = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.adjustQty || 0), 0),
    [items]
  );

  const totalLossValue = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.lossValue || 0), 0),
    [items]
  );

  const hasInvalidQty = useMemo(() => {
    return items.some((it) => it.adjustQty <= 0 || it.adjustQty > it.currentStock);
  }, [items]);

  const handleSubmit = async () => {
    if (reason.trim().length < 10) {
      showToast('Vui lòng nhập lý do điều chỉnh tối thiểu 10 ký tự', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('Vui lòng thêm ít nhất 1 sản phẩm cần điều chỉnh', 'error');
      return;
    }

    if (hasInvalidQty) {
      showToast(
        'Số lượng điều chỉnh phải lớn hơn 0 và không được vượt quá số lượng tồn kho',
        'error'
      );
      return;
    }

    setSubmitting(true);
    try {
      const newVoucher = await stockAdjustService.create(
        {
          warehouse,
          adjustType,
          adjustDate,
          reason: reason.trim(),
          items,
        },
        {
          id: user?.id,
          name: user?.name || user?.username,
        }
      );
      showToast(`Lập phiếu điều chỉnh ${newVoucher.code} thành công!`, 'success');
      navigate(`/inventory/adjustments/${newVoucher.id}`);
    } catch {
      showToast('Đã xảy ra lỗi khi tạo phiếu điều chỉnh', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredModalProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return allProducts;
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }, [allProducts, productSearch]);

  return (
    <PageContainer
      title="Lập phiếu điều chỉnh tồn kho"
      description="Ghi nhận điều chỉnh hàng hỏng, hàng mất mát hoặc hàng hết hạn (SCRUM-790)"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/inventory/adjustments')}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Quay lại danh sách
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2 cols): Form + Product table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Loại điều chỉnh & Kho */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary-500" />
              1. Thông tin phiếu điều chỉnh
            </h3>

            {/* Adjust Type Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Loại điều chỉnh <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Damaged */}
                <button
                  type="button"
                  onClick={() => setAdjustType('damaged')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    adjustType === 'damaged'
                      ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/30 text-orange-900 dark:text-orange-200 ring-2 ring-orange-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Hàng hỏng / Móp bể</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Vỡ nát, hư hại cơ học
                    </div>
                  </div>
                </button>

                {/* Expired */}
                <button
                  type="button"
                  onClick={() => setAdjustType('expired')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    adjustType === 'expired'
                      ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                    <CalendarX className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Hàng hết hạn</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Quá hạn sử dụng / date
                    </div>
                  </div>
                </button>

                {/* Lost */}
                <button
                  type="button"
                  onClick={() => setAdjustType('lost')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    adjustType === 'lost'
                      ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
                    <FileQuestion className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Hao hụt / Mất mát</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Thất thoát kiểm kê
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Warehouse & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Kho hàng áp dụng <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Warehouse className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value)}
                    aria-label="Kho hàng áp dụng"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    {WAREHOUSE_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Ngày ghi nhận <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={adjustDate}
                  onChange={(e) => setAdjustDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Lý do điều chỉnh <span className="text-rose-500">*</span>
                </label>
                <span
                  className={`text-xs ${
                    reason.trim().length >= 10
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {reason.trim().length}/10 ký tự tối thiểu
                </span>
              </div>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Lô hàng bị dập vỏ trong quá trình bốc xếp; Hoặc phát hiện hết hạn trong đợt kiểm kho ngày 15/10..."
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Card 2: Danh sách sản phẩm điều chỉnh */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-500" />
                2. Danh sách hàng hóa cần giảm trừ
              </h3>
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenProductModal}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Thêm sản phẩm
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Chưa có sản phẩm nào được chọn
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Nhấn "Thêm sản phẩm" để chọn mặt hàng cần điều chỉnh tồn kho
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-3">Sản phẩm / SKU</th>
                      <th className="px-3 py-3 text-center">Tồn kho</th>
                      <th className="px-3 py-3 text-center w-32">SL điều chỉnh</th>
                      <th className="px-3 py-3 text-right">Giá vốn</th>
                      <th className="px-3 py-3 text-right">Tổn thất</th>
                      <th className="px-3 py-3">Ghi chú</th>
                      <th className="px-2 py-3 text-center w-12">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const isOverStock = item.adjustQty > item.currentStock;
                      const isZeroOrNegative = item.adjustQty <= 0;
                      return (
                        <tr
                          key={item.productId}
                          className={`${
                            isOverStock || isZeroOrNegative
                              ? 'bg-rose-50/60 dark:bg-rose-950/20'
                              : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {item.name}
                            </div>
                            <div className="text-xs text-slate-400">{item.sku}</div>
                          </td>
                          <td className="px-3 py-3 text-center font-medium text-slate-600 dark:text-slate-400">
                            {formatNumber(item.currentStock)}
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min={1}
                              max={item.currentStock}
                              value={item.adjustQty === 0 ? '' : item.adjustQty}
                              placeholder="1"
                              onChange={(e) =>
                                handleUpdateQty(idx, parseInt(e.target.value) || 0)
                              }
                              className={`w-full text-center px-2 py-1.5 text-sm rounded-lg border font-semibold ${
                                isOverStock || isZeroOrNegative
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                              }`}
                            />
                            {isOverStock && (
                              <div className="text-[11px] text-rose-500 mt-0.5 text-center">
                                Vượt tồn kho ({item.currentStock})
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-400">
                            {formatNumber(item.costPrice)} đ
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                            {formatNumber(item.lossValue)} đ
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={item.note || ''}
                              onChange={(e) => handleUpdateItemNote(idx, e.target.value)}
                              placeholder="Ghi chú thêm..."
                              className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
                            />
                          </td>
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
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

        {/* Right Column (1 col): Summary Panel Sticky */}
        <div className="space-y-6 lg:sticky lg:top-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
              Tổng kết phiếu điều chỉnh
            </h3>

            <div className="space-y-3.5 text-sm">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Số dòng mặt hàng:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {items.length} mặt hàng
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Tổng số lượng giảm:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatNumber(totalLossQty)} chiếc
                </span>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs uppercase font-medium tracking-wider text-slate-500">
                  Tổng giá trị tổn thất
                </span>
                <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                  {formatNumber(totalLossValue)} đ
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Giá trị sẽ được ghi nhận vào chi phí hao hụt kho sau khi duyệt.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <UserCheck className="w-4 h-4 text-primary-500" />
                  <span>
                    Người lập: <strong>{user?.name || user?.username || 'Bạn'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {hasInvalidQty && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Có sản phẩm điều chỉnh vượt quá số lượng tồn kho hiện tại hoặc số lượng bằng 0.
                </span>
              </div>
            )}

            <div className="pt-2 space-y-2">
              <Button
                variant="primary"
                size="md"
                className="w-full justify-center"
                onClick={handleSubmit}
                isLoading={submitting}
                disabled={hasInvalidQty || items.length === 0}
                leftIcon={<Send className="w-4 h-4" />}
              >
                Gửi phiếu chờ duyệt
              </Button>

              <Button
                variant="outline"
                size="md"
                className="w-full justify-center"
                onClick={() => navigate('/inventory/adjustments')}
              >
                Hủy bỏ
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Chọn sản phẩm */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Chọn sản phẩm cần điều chỉnh
                </h4>
                <p className="text-xs text-slate-500">
                  Tìm kiếm theo tên sản phẩm, mã SKU hoặc ngành hàng
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Nhập tên sản phẩm hoặc mã SKU..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingProducts ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Đang tải danh sách sản phẩm...
                </div>
              ) : filteredModalProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Không tìm thấy sản phẩm nào phù hợp
                </div>
              ) : (
                filteredModalProducts.map((prod) => {
                  const alreadySelected = items.some(
                    (i) => i.productId === prod.id || i.sku === prod.sku
                  );
                  return (
                    <div
                      key={prod.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                          {prod.name}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {prod.sku}
                          </span>
                          <span>Tồn kho: <strong>{formatNumber(prod.stock ?? 10)}</strong></span>
                          <span>Giá vốn: <strong>{formatNumber(prod.costPrice ?? prod.salePrice ?? 0)} đ</strong></span>
                        </div>
                      </div>
                      <Button
                        variant={alreadySelected ? 'outline' : 'primary'}
                        size="sm"
                        disabled={alreadySelected}
                        onClick={() => handleSelectProduct(prod)}
                      >
                        {alreadySelected ? 'Đã thêm' : 'Chọn'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsProductModalOpen(false)}
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
