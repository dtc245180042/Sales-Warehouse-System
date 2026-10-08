import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Barcode,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  QrCode,
  Printer,
  CheckCircle2,
  ShoppingCart,
  User,
  X,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { productService } from '../../services/productService';
import { orderService } from '../../services/orderService';
import { customerService } from '../../services/customerService';
import { Product } from '../../types/Product';
import { Customer } from '../../types/Customer';
import { OrderItem, PaymentMethod } from '../../types/Order';
import { productCategories } from '../../mock/products';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface CartItem extends OrderItem {
  image: string;
  stock: number;
}

export const POS: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('CUS-010'); // Default Walk-in
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [barcodeInput, setBarcodeInput] = useState<string>('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0); // 0% or 8% or 10%
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashGiven, setCashGiven] = useState<number>(0);

  // Completed order receipt modal
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    productService.getAll().then(setProducts);
    customerService.getAll().then(setCustomers);
  }, []);

  // Filter products for POS grid
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search);
      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, search]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showToast(`${product.name} đã hết hàng trong kho`, 'error');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showToast(`Chỉ còn ${product.stock} sản phẩm khả dụng trong kho`, 'warning');
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.price,
              }
            : item
        );
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            price: product.salePrice,
            quantity: 1,
            discount: 0,
            subtotal: product.salePrice,
            image: product.image,
            stock: product.stock,
          },
        ];
      }
    });
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            if (newQty > item.stock) {
              showToast(`Đã đạt giới hạn tồn kho (${item.stock})`, 'warning');
              return item;
            }
            return {
              ...item,
              quantity: newQty,
              subtotal: newQty * item.price,
            };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const found = products.find(
      (p) => p.barcode === barcodeInput.trim() || p.sku.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    if (found) {
      addToCart(found);
      setBarcodeInput('');
      showToast(`Đã thêm ${found.name}`, 'info');
    } else {
      showToast(`Không tìm thấy sản phẩm có mã "${barcodeInput}"`, 'error');
    }
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = Math.round((subtotal - discount) * (taxRate / 100));
  const total = Math.max(0, subtotal - discount + taxAmount);
  const changeAmount = Math.max(0, (cashGiven || 0) - total);

  // Set default cash given to exact total whenever total changes if cashGiven was 0
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setCashGiven(total);
    }
  }, [total, paymentMethod]);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showToast('Giỏ hàng đang trống! Vui lòng chọn sản phẩm.', 'warning');
      return;
    }

    if (paymentMethod === 'cash' && cashGiven < total) {
      showToast('Số tiền khách đưa chưa đủ để thanh toán', 'warning');
      return;
    }

    setIsPaying(true);
    try {
      const customer = customers.find((c) => c.id === selectedCustomerId);
      const newOrder = await orderService.create({
        customerId: customer?.id || 'CUS-010',
        customerName: customer?.name || 'Khách Lẻ Tại Quầy',
        customerPhone: customer?.phone || '0900000000',
        items: cart.map(({ image, stock, ...rest }) => rest),
        subtotal,
        discount,
        tax: taxAmount,
        total,
        paidAmount: paymentMethod === 'cash' ? cashGiven : total,
        changeAmount: paymentMethod === 'cash' ? changeAmount : 0,
        paymentMethod,
        paymentStatus: 'paid',
        status: 'completed',
        staffId: user?.id || 'USR-003',
        staffName: user?.name || 'Thu Ngân',
        note: 'Đơn hàng POS bán tại quầy',
      });

      // Update local product stock
      const updatedProducts = await productService.getAll();
      setProducts(updatedProducts);

      setCompletedOrder(newOrder);
      setIsReceiptModalOpen(true);
      setCart([]);
      setDiscount(0);
      showToast(`Thanh toán thành công! Mã đơn: ${newOrder.code}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi thanh toán đơn hàng', 'error');
    } finally {
      setIsPaying(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* LEFT SIDE: Product Catalogue & Scanner (60%) */}
      <div className="lg:w-3/5 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
        {/* Search & Barcode Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên sản phẩm, mã SKU..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <form onSubmit={handleBarcodeSubmit} className="relative sm:w-56">
            <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Quét mã vạch (Enter)..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </form>
        </div>

        {/* Category Pills */}
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0 no-scrollbar">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              categoryFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Tất cả ({products.length})
          </button>
          {productCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.name)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                categoryFilter === c.name
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map((p) => {
            const isOutOfStock = p.stock <= 0;
            return (
              <div
                key={p.id}
                onClick={() => !isOutOfStock && addToCart(p)}
                className={`group relative p-3 rounded-2xl border transition-all flex flex-col justify-between select-none ${
                  isOutOfStock
                    ? 'border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/50'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-indigo-500 hover:shadow-md cursor-pointer active:scale-95'
                }`}
              >
                <div>
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-2 bg-slate-100 dark:bg-slate-800">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-1.5 right-1.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-md ${
                          p.stock <= 0
                            ? 'bg-rose-500/90 text-white'
                            : p.stock <= p.minStock
                            ? 'bg-amber-500/90 text-white'
                            : 'bg-slate-900/80 text-white'
                        }`}
                      >
                        Tồn: {p.stock}
                      </span>
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                    {p.name}
                  </h4>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{p.sku}</span>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(p.salePrice)}
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT SIDE: Cart, Customer & Checkout (40%) */}
      <div className="lg:w-2/5 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
        {/* Customer Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <User className="w-4 h-4 text-indigo-600 shrink-0" />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="bg-transparent border-none text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer flex-1 truncate"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full shrink-0">
            {cart.reduce((s, i) => s + i.quantity, 0)} sp
          </span>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2">
          {cart.length > 0 ? (
            cart.map((item) => (
              <div
                key={item.productId}
                className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-10 h-10 rounded-lg object-cover shrink-0 bg-slate-100"
                  />
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                    </p>
                    <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleUpdateQty(item.productId, -1)}
                    className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-slate-900 dark:text-white">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => handleUpdateQty(item.productId, 1)}
                    className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-right shrink-0 min-w-[70px]">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {formatCurrency(item.subtotal)}
                  </p>
                  <button
                    onClick={() => handleUpdateQty(item.productId, -item.quantity)}
                    className="text-[10px] text-slate-400 hover:text-rose-500"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <ShoppingCart className="w-12 h-12 stroke-[1.2] mb-2 opacity-50" />
              <p className="text-xs">Chưa có sản phẩm nào trong giỏ hàng</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Nhấp vào thẻ sản phẩm bên trái để bắt đầu thanh toán
              </p>
            </div>
          )}
        </div>

        {/* Payment Summary Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 p-4 space-y-3">
          {/* Discount & Tax Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Giảm giá (VNĐ):</span>
              <input
                type="number"
                min={0}
                step={10000}
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value))}
                placeholder="0"
                className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Thuế VAT:</span>
              <select
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
              >
                <option value={0}>0% (Không thuế)</option>
                <option value={8}>8% (VAT ưu đãi)</option>
                <option value={10}>10% (VAT tiêu chuẩn)</option>
              </select>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Phương thức thanh toán
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-semibold border transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>Tiền mặt</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-semibold border transition-all ${
                  paymentMethod === 'transfer'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>Chuyển khoản</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-semibold border transition-all ${
                  paymentMethod === 'card'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Quẹt thẻ</span>
              </button>
            </div>
          </div>

          {/* If Cash: show cash given and change */}
          {paymentMethod === 'cash' && (
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Khách đưa (VNĐ):</span>
                <CurrencyInput
                  value={cashGiven}
                  onChange={(val) => setCashGiven(val)}
                  placeholder="0"
                  className="w-36 px-2.5 py-1 text-right bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tiền thừa trả khách:</span>
                <span className="font-bold text-emerald-600">{formatCurrency(changeAmount)}</span>
              </div>
            </div>
          )}

          {/* Total & Checkout button */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block">Tổng thanh toán:</span>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {formatCurrency(total)}
              </span>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handleCheckout}
              isLoading={isPaying}
              disabled={cart.length === 0}
              className="px-8 shadow-lg shadow-indigo-500/25 font-bold"
            >
              Thanh Toán
            </Button>
          </div>
        </div>
      </div>

      {/* POS Receipt Modal after Checkout */}
      {completedOrder && (
        <Modal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          title="Hóa Đơn Bán Lẻ POS"
          maxWidth="sm"
          footer={
            <div className="w-full flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setIsReceiptModalOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="primary"
                onClick={handlePrintReceipt}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                In hóa đơn (Print)
              </Button>
            </div>
          }
        >
          {/* Printable receipt container */}
          <div id="printable-receipt" className="p-4 bg-white text-slate-900 text-xs font-mono">
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <h2 className="text-base font-bold uppercase tracking-wider">Sales Warehouse System POS</h2>
              <p className="text-[11px] text-slate-500">Hệ Thống Quản Lý Kho & Bán Hàng</p>
              <p className="text-[10px] text-slate-400 mt-1">Đ/c: 128 Lê Lợi, Bến Nghé, Q1, TP. HCM</p>
              <p className="text-[10px] text-slate-400">Hotline: 1900 6868</p>
            </div>

            <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Mã đơn:</span>
                <span className="font-bold">{completedOrder.code}</span>
              </div>
              <div className="flex justify-between">
                <span>Thời gian:</span>
                <span>{formatDate(completedOrder.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Thu ngân:</span>
                <span>{completedOrder.staffName}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách hàng:</span>
                <span className="font-bold">{completedOrder.customerName}</span>
              </div>
            </div>

            {/* Items */}
            <div className="py-2.5 border-b border-dashed border-slate-300 space-y-2">
              {completedOrder.items.map((it: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start text-[11px]">
                  <div className="flex-1 pr-2">
                    <p className="font-semibold">{it.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {it.quantity} x {formatCurrency(it.price)}
                    </p>
                  </div>
                  <span className="font-bold shrink-0">{formatCurrency(it.subtotal)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="pt-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Tạm tính:</span>
                <span>{formatCurrency(completedOrder.subtotal)}</span>
              </div>
              {completedOrder.discount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Giảm giá:</span>
                  <span>-{formatCurrency(completedOrder.discount)}</span>
                </div>
              )}
              {completedOrder.tax > 0 && (
                <div className="flex justify-between">
                  <span>VAT:</span>
                  <span>+{formatCurrency(completedOrder.tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-slate-400">
                <span>TỔNG CỘNG:</span>
                <span className="text-indigo-600">{formatCurrency(completedOrder.total)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Phương thức:</span>
                <span className="uppercase">{completedOrder.paymentMethod}</span>
              </div>
              {completedOrder.paymentMethod === 'cash' && (
                <>
                  <div className="flex justify-between">
                    <span>Tiền khách đưa:</span>
                    <span>{formatCurrency(completedOrder.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tiền thối lại:</span>
                    <span className="font-bold">{formatCurrency(completedOrder.changeAmount)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="text-center pt-4 text-[10px] text-slate-400 border-t border-dashed border-slate-300 mt-3">
              <p>Cảm ơn quý khách và hẹn gặp lại!</p>
              <p>Quý khách vui lòng kiểm tra hàng trước khi rời quầy.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
