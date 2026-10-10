import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  CreditCard,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Minus,
  Trash2,
  X,
  PackageCheck,
  Send,
  Loader2,
  MapPin,
  Clock,
  LogOut,
} from 'lucide-react';
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
import { portalService, PortalProduct, PortalCredit, PortalProfile, PortalDeliveryAddress, CartCalculationResult } from '../../services/portalService';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/formatters';

interface CartItem {
  product: PortalProduct;
  quantity: number;
}

export const PortalOrderPage: React.FC = () => {
  const { logout } = useAuth();

  // State
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [credit, setCredit] = useState<PortalCredit | null>(null);
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [deliveryAddresses, setDeliveryAddresses] = useState<PortalDeliveryAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Calculation & Submit
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<CartCalculationResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load initial portal data
  useEffect(() => {
    loadPortalData();
  }, []);

  const loadPortalData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [profData, credData, prodsData, addrData] = await Promise.all([
        portalService.getProfile(),
        portalService.getCredit(),
        portalService.getProducts({ limit: 100 }),
        portalService.getDeliveryAddresses(),
      ]);
      setProfile(profData);
      setCredit(credData);
      setProducts(prodsData.items);
      setDeliveryAddresses(addrData);
      if (addrData.length > 0) {
        const defaultAddr = addrData.find((a) => a.is_default) || addrData[0];
        setSelectedAddressId(defaultAddr.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tải dữ liệu cổng đại lý.');
    } finally {
      setLoading(false);
    }
  };

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [products, search]);

  // Handle Cart Updates
  const updateQuantity = (product: PortalProduct, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (!existing && delta > 0) {
        return [...prev, { product, quantity: delta }];
      }
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) {
          return prev.filter((item) => item.product.id !== product.id);
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: newQty } : item
        );
      }
      return prev;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Recalculate cart totals with Server
  useEffect(() => {
    if (cart.length === 0) {
      setCalcResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCalculating(true);
      try {
        const payload = cart.map((c) => ({
          product_id: c.product.id,
          quantity: c.quantity,
          unit: c.product.unit,
        }));
        const result = await portalService.calculateCart(payload);
        setCalcResult(result);
      } catch (err: any) {
        console.error('Lỗi tính giỏ hàng:', err);
      } finally {
        setCalculating(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cart]);

  // Totals
  const totalItemsCount = useMemo(() => cart.reduce((sum, itm) => sum + itm.quantity, 0), [cart]);
  const estimatedTotal = useMemo(() => {
    if (calcResult) return calcResult.total_amount;
    return cart.reduce((sum, itm) => sum + itm.product.sale_price * itm.quantity, 0);
  }, [cart, calcResult]);

  // Credit limit calculation
  const availableCredit = credit ? credit.available_credit : 0;
  const isCreditExceeded = availableCredit > 0 && estimatedTotal > availableCredit;

  // Handle Submit Order
  const handleSubmitOrder = async () => {
    if (!selectedAddressId) {
      alert('Vui lòng chọn địa chỉ nhận hàng.');
      return;
    }
    if (cart.length === 0) return;
    if (isCreditExceeded) {
      alert('Đơn hàng vượt hạn mức công nợ còn lại. Vui lòng thanh toán nợ cũ hoặc giảm số lượng.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const idempotencyKey = generateUUID();
      const payload = {
        expected_total: estimatedTotal,
        delivery_address_id: selectedAddressId,
        delivery_notes: deliveryNotes.trim() || undefined,
        items: cart.map((c) => ({
          product_id: c.product.id,
          quantity: c.quantity,
          unit: c.product.unit,
        })),
      };

      const res = await portalService.createOrder(payload, idempotencyKey);
      setSuccessOrder(res);
      setCart([]);
      setIsCartOpen(false);
      // Reload credit status
      const cred = await portalService.getCredit();
      setCredit(cred);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể gửi đơn hàng.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 pb-28">
      {/* 1. Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">CỔNG ĐẶT HÀNG ĐẠI LÝ</div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {profile?.customer_name || 'Đại lý của bạn'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition"
              title="Xem giỏ hàng"
            >
              <ShoppingBag className="w-5 h-5" />
              {totalItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-pulse">
                  {totalItemsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => logout()}
              className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Error notification */}
        {errorMessage && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
            <div className="flex-1">{errorMessage}</div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. Credit limit & Debt status banner */}
        {credit && (
          <section className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Hạn mức & Công nợ
                </span>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                credit.allow_order_on_credit
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
              }`}>
                {credit.allow_order_on_credit ? 'Đủ điều kiện đặt nợ' : 'Hạn chế mua nợ'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-2 text-center">
              <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Hạn mức cấp</div>
                <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {formatCurrency(credit.credit_limit)}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Đã dùng (Đơn + Chờ)</div>
                <div className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {formatCurrency(credit.total_used_credit)}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Hạn mức còn lại</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(credit.available_credit)}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-2">
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    credit.credit_limit > 0 && (credit.total_used_credit / credit.credit_limit) > 0.85
                      ? 'bg-red-500'
                      : (credit.total_used_credit / credit.credit_limit) > 0.6
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${credit.credit_limit > 0 ? Math.min(100, (credit.total_used_credit / credit.credit_limit) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </section>
        )}

        {/* 3. Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 4. Product Catalog List */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-sm">Đang tải danh mục sản phẩm theo bảng giá...</span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8">
            <PackageCheck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Không tìm thấy sản phẩm nào</h3>
            <p className="text-xs text-slate-400 mt-1">Các sản phẩm ngoài bảng giá đại lý đã được ẩn tự động.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProducts.map((p) => {
              const inCart = cart.find((item) => item.product.id === p.id);
              const qty = inCart ? inCart.quantity : 0;
              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between hover:border-indigo-300 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{p.sku}</div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 mt-0.5">
                          {p.name}
                        </h4>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                          p.stock_status === 'IN_STOCK'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : p.stock_status === 'LOW_STOCK'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                        }`}
                      >
                        {p.stock_status === 'IN_STOCK' ? 'Còn hàng' : p.stock_status === 'LOW_STOCK' ? 'Sắp hết' : 'Tạm hết'}
                      </span>
                    </div>

                    {p.packaging_spec && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Quy cách: {p.packaging_spec}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">Giá đại lý ({p.unit})</div>
                      <div className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(p.sale_price)}
                      </div>
                    </div>

                    {/* Stepper counter */}
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
                      <button
                        onClick={() => updateQuantity(p, -1)}
                        disabled={qty <= 0}
                        className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:scale-95 transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs text-slate-800 dark:text-slate-100">
                        {qty}
                      </span>
                      <button
                        onClick={() => updateQuantity(p, 1)}
                        className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs active:scale-95 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 5. Sticky Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 p-3 sm:p-4 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Đã chọn <span className="font-bold text-slate-800 dark:text-slate-200">{totalItemsCount}</span> sản phẩm
              </div>
              <div className="text-base sm:text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                {formatCurrency(estimatedTotal)}
              </div>
            </div>
            <button
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/30 transition text-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Xem giỏ & Gửi đơn</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. Cart & Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Giỏ hàng đại lý</h3>
                <span className="text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full">
                  {cart.length} mục
                </span>
              </div>
              <button onClick={() => setIsCartOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Delivery Address Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                  Điểm giao hàng nhận hàng:
                </label>
                {deliveryAddresses.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl">
                    Chưa có địa chỉ giao hàng đã lưu. Vui lòng liên hệ NVKD để thêm địa chỉ.
                  </div>
                ) : (
                  <select
                    value={selectedAddressId || ''}
                    onChange={(e) => setSelectedAddressId(Number(e.target.value))}
                    className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {deliveryAddresses.map((addr) => (
                      <option key={addr.id} value={addr.id}>
                        {addr.name} - {addr.receiver_name} ({addr.phone}) - {addr.address}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Delivery Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Ghi chú đơn hàng (Thời gian giao, yêu cầu bốc dỡ):
                </label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Ví dụ: Giao sáng mai trước 10h, xe tải dưới 5 tấn..."
                  className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Items List */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Chi tiết mặt hàng
                </div>
                {cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {product.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatCurrency(product.sale_price)} / {product.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateQuantity(product, -1)}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(product, 1)}
                        className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeFromCart(product.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Calculation Summary */}
              <div className="p-3.5 bg-slate-100 dark:bg-slate-900/80 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Tạm tính tiền hàng:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatCurrency(calcResult ? calcResult.subtotal : estimatedTotal)}
                  </span>
                </div>
                {calcResult && calcResult.total_discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Chiết khấu sản lượng:</span>
                    <span>-{formatCurrency(calcResult.total_discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>Tổng thanh toán:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(estimatedTotal)}
                  </span>
                </div>
              </div>

              {/* Credit Exceeded Warning */}
              {isCreditExceeded && (
                <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Đơn hàng vượt hạn mức công nợ còn lại!</span>
                    <div>
                      Hạn mức còn lại là {formatCurrency(availableCredit)}, đơn hàng này cần {formatCurrency(estimatedTotal)} (vượt {formatCurrency(estimatedTotal - availableCredit)}).
                      Vui lòng giảm bớt số lượng hoặc thanh toán bớt công nợ cũ để gửi đơn.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
              <button
                onClick={() => setIsCartOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              >
                Tiếp tục chọn
              </button>
              <button
                onClick={handleSubmitOrder}
                disabled={submitting || calculating || isCreditExceeded || cart.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold py-2.5 px-4 rounded-xl shadow-md transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang gửi đơn...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Gửi Đơn Đặt Hàng (Chờ duyệt)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Success Order Confirmation Modal */}
      {successOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Đặt hàng thành công!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Đơn hàng đã được tiếp nhận và chuyển đến NVKD phụ trách để xác nhận.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl text-xs space-y-1.5 text-left font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Mã đơn:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{successOrder.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Trạng thái:</span>
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Chờ duyệt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tổng tiền:</span>
                <span className="font-bold text-indigo-600">{formatCurrency(successOrder.total)}</span>
              </div>
            </div>

            <button
              onClick={() => setSuccessOrder(null)}
              className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md"
            >
              Hoàn tất & Tiếp tục đặt hàng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default PortalOrderPage;
