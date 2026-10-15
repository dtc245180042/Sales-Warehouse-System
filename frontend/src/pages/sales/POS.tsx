import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ShoppingCart,
  User,
  X,
  Sparkles,
  TrendingDown,
  Layers,
  Info,
  ArrowRight,
  ShieldAlert,
  Lock,
  FolderOpen,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { productService } from '../../services/productService';
import { orderService } from '../../services/orderService';
import { customerService } from '../../services/customerService';
import { categoryService } from '../../services/categoryService';
import { Product } from '../../types/Product';
import { Customer } from '../../types/Customer';
import { Category } from '../../types/Category';
import { OrderItem, PaymentMethod } from '../../types/Order';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { VOLUME_DISCOUNT_TIERS, getVolumeDiscountInfo } from '../../services/volumeDiscountService';
import { VolumeDiscountPolicyModal } from '../../components/sales/VolumeDiscountPolicyModal';

interface CartItem extends OrderItem {
  image?: string;
  stock: number;
  discountPct: number;
  discountAmt: number;
  neededForNext: number;
  nextTierPct: number;
}

export const POS: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Nạp tức thì từ RAM cache (0ms) khi mở quầy POS
  const [products, setProducts] = useState<Product[]>(() => productService.getCached());
  const [categories, setCategories] = useState<Category[]>(() => categoryService.getCachedList());
  const [customers, setCustomers] = useState<Customer[]>(() => customerService.getCached());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('CUS-010'); // Default Walk-in
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  // Phân trang 20 sản phẩm / trang
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 20;

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0); // 0% or 8% or 10%
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashGiven, setCashGiven] = useState<number>(0);

  // Modal Bậc chiết khấu
  const [showTierModal, setShowTierModal] = useState(false);

  // Completed order receipt modal
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    productService.getAll().then(setProducts);
    customerService.getAll().then(setCustomers);
    categoryService.getList().then((cats) => {
      if (Array.isArray(cats)) {
        setCategories(cats);
      }
    });
  }, []);

  // Tự động cuộn tab đang chọn vào vùng nhìn thấy (horizontal scroll)
  useEffect(() => {
    if (tabRefs.current[categoryFilter]) {
      tabRefs.current[categoryFilter]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [categoryFilter]);

  // Đóng dropdown khách hàng khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Danh mục nhóm hàng với số đếm sản phẩm thực tế (lấy động từ API /api/v1/categories)
  const categoryTabs = useMemo(() => {
    // 1. Đếm số lượng sản phẩm thực tế theo categoryId
    const countsByCatId: Record<string, number> = {};
    const fallbackNames: Record<string, string> = {};

    products.forEach((p) => {
      const rawId = p.categoryId !== undefined ? String(p.categoryId) : (p.category_id !== undefined ? String(p.category_id) : '');
      const cId = rawId || 'unclassified';
      countsByCatId[cId] = (countsByCatId[cId] || 0) + 1;
      if (p.category && !fallbackNames[cId]) {
        fallbackNames[cId] = p.category;
      }
    });

    // 2. Xác định các danh mục cha/con để chỉ hiển thị các nhóm cấp lá hoặc các nhóm trực tiếp có sản phẩm
    const parentIdSet = new Set(categories.map((c) => c.parent_id).filter(Boolean));

    const mappedTabs: { id: string; name: string; count: number }[] = [];
    const addedIds = new Set<string>();

    categories.forEach((cat) => {
      const catIdStr = String(cat.id);
      const isLeaf = !parentIdSet.has(cat.id);
      const actualCount = countsByCatId[catIdStr] || 0;

      // Hiển thị nếu là danh mục cấp lá hoặc trực tiếp có sản phẩm gán vào
      if (isLeaf || actualCount > 0) {
        mappedTabs.push({
          id: catIdStr,
          name: cat.name,
          count: actualCount,
        });
        addedIds.add(catIdStr);
      }
    });

    // 3. Nếu có sản phẩm chưa phân loại
    if (countsByCatId['unclassified']) {
      mappedTabs.push({
        id: 'unclassified',
        name: 'Chưa phân loại',
        count: countsByCatId['unclassified'],
      });
      addedIds.add('unclassified');
    }

    // 4. Bổ sung các nhóm hàng có trong products nhưng chưa có trong categories API
    Object.keys(countsByCatId).forEach((cId) => {
      if (!addedIds.has(cId)) {
        mappedTabs.push({
          id: cId,
          name: fallbackNames[cId] || `Nhóm hàng #${cId}`,
          count: countsByCatId[cId],
        });
        addedIds.add(cId);
      }
    });

    return mappedTabs;
  }, [products, categories]);

  // Filter products for POS grid - So sánh chính xác theo Category ID và từ khóa
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      // 1. Lọc theo nhóm hàng (Category ID - so sánh ID cùng kiểu string)
      let matchCat = categoryFilter === 'all';
      if (!matchCat) {
        const pCatId = p.categoryId !== undefined ? String(p.categoryId) : (p.category_id !== undefined ? String(p.category_id) : '');
        if (categoryFilter === 'unclassified') {
          matchCat = !pCatId;
        } else {
          matchCat = pCatId === String(categoryFilter);
        }
      }

      // 2. Lọc theo từ khóa tìm kiếm (Tên, SKU, Barcode) - giữ nguyên khi đổi tab
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ? String(p.barcode).toLowerCase().includes(q) : false);

      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, search]);

  // Reset về trang 1 khi thay đổi từ khóa tìm kiếm hoặc danh mục
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Lọc danh sách khách hàng tìm kiếm trong giỏ hàng POS
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.toLowerCase().trim();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.id && c.id.toLowerCase().includes(q))
      )
      .slice(0, 40);
  }, [customers, customerSearchQuery]);

  // Helper tính dòng giỏ hàng kèm chiết khấu theo số lượng (SCRUM-486)
  const buildCartItem = (product: Product, quantity: number): CartItem => {
    const { discountPct, nextTier, neededForNext } = getVolumeDiscountInfo(quantity);
    const rawTotal = product.salePrice * quantity;
    const discountAmt = Math.round((rawTotal * discountPct) / 100);
    const subtotal = rawTotal - discountAmt;

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price: product.salePrice,
      quantity,
      discount: discountAmt,
      discountPct,
      discountAmt,
      subtotal,
      image: product.image,
      stock: product.stock,
      neededForNext,
      nextTierPct: nextTier ? nextTier.discountPct : discountPct,
    };
  };

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  const isCustomerLocked = selectedCustomer?.status === 'locked';

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
        const newQty = existing.quantity + 1;
        return prev.map((item) =>
          item.productId === product.id ? buildCartItem(product, newQty) : item
        );
      } else {
        return [...prev, buildCartItem(product, 1)];
      }
    });
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            if (newQty > item.stock) {
              showToast(`Đã đạt giới hạn tồn kho (${item.stock})`, 'warning');
              return item;
            }
            if (newQty <= 0) return { ...item, quantity: 0 };
            return buildCartItem(product, newQty);
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

  // Calculations theo thời gian thực (SCRUM-480 + SCRUM-486)
  const rawSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const volumeDiscountTotal = cart.reduce((sum, item) => sum + item.discountAmt, 0);
  const afterVolumeDiscount = rawSubtotal - volumeDiscountTotal;
  const totalDiscount = volumeDiscountTotal + (manualDiscount || 0);
  const taxAmount = Math.round(Math.max(0, afterVolumeDiscount - manualDiscount) * (taxRate / 100));
  const total = Math.max(0, afterVolumeDiscount - manualDiscount + taxAmount);
  const changeAmount = Math.max(0, (cashGiven || 0) - total);

  // Set default cash given to exact total whenever total changes if cashGiven was 0
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setCashGiven(total);
    }
  }, [total, paymentMethod]);

  const handleCheckout = async () => {
    if (isCustomerLocked) {
      showToast(`Đại lý '${selectedCustomer?.name}' đang bị khoá giao dịch. Không thể tạo đơn mới!`, 'error');
      return;
    }

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
        items: cart.map(({ image, stock, discountPct, discountAmt, neededForNext, nextTierPct, ...rest }) => rest),
        subtotal: rawSubtotal,
        discount: totalDiscount,
        tax: taxAmount,
        total,
        paidAmount: paymentMethod === 'cash' ? cashGiven : total,
        changeAmount: paymentMethod === 'cash' ? changeAmount : 0,
        paymentMethod,
        paymentStatus: 'paid',
        status: 'completed',
        staffId: user?.id || 'USR-003',
        staffName: user?.name || 'Thu Ngân',
        note: `Đơn hàng POS bán tại quầy${volumeDiscountTotal > 0 ? ` (Chiết khấu SL: ${formatCurrency(volumeDiscountTotal)})` : ''}`,
      });

      setCompletedOrder({
        ...newOrder,
        volumeDiscountTotal,
        items: [...cart],
      });
      setIsReceiptModalOpen(true);
      setCart([]);
      setManualDiscount(0);
      showToast(`Thanh toán thành công! Mã đơn: ${newOrder.code}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi thanh toán đơn hàng';
      showToast(msg, 'error');
    } finally {
      setIsPaying(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* LEFT SIDE: Product Catalogue & Scanner (54%) */}
      <div className="lg:w-[54%] xl:w-[55%] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
        {/* Search & Barcode Bar */}
        <div className="p-3 sm:p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên sản phẩm, mã SKU..."
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <form onSubmit={handleBarcodeSubmit} className="relative sm:w-52">
            <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Quét mã vạch (Enter)..."
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </form>

          {/* Nút xem chính sách chiết khấu số lượng */}
          <button
            type="button"
            onClick={() => setShowTierModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl hover:bg-indigo-100 transition shrink-0"
            title="Xem chính sách chiết khấu số lượng"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bậc CK</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
          <button
            ref={(el) => { tabRefs.current['all'] = el; }}
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              categoryFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Tất cả ({products.length})
          </button>
          {categoryTabs.map((c) => (
            <button
              key={c.id}
              ref={(el) => { tabRefs.current[c.id] = el; }}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                categoryFilter === c.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{c.name}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                  categoryFilter === c.id
                    ? 'bg-indigo-700 text-indigo-100'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {c.count}
              </span>
            </button>
          ))}
        </div>

        {/* Product Cards Grid (Thu nhỏ ô sản phẩm, hiển thị 20 sản phẩm/trang) */}
        <div className="flex-1 overflow-y-auto p-3">
          {paginatedProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
              {paginatedProducts.map((p) => {
                const isOutOfStock = p.stock <= 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && addToCart(p)}
                    className={`group relative p-2.5 rounded-xl border transition-all flex flex-col justify-between select-none min-h-[135px] ${
                      isOutOfStock
                        ? 'border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/50'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-indigo-500 hover:shadow-sm cursor-pointer active:scale-95'
                    }`}
                  >
                    {/* Phần trên: Tên sản phẩm & SKU */}
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight">
                        {p.name}
                      </h4>
                      <span className="text-[9px] text-slate-400 block mt-0.5 font-mono truncate">
                        {p.sku}
                      </span>
                    </div>

                    {/* Phần dưới: Tồn kho & CK số lượng, kèm Giá & Nút thêm */}
                    <div className="space-y-1.5 mt-auto pt-1.5">
                      {/* Badges: Tồn kho & Chiết khấu số lượng */}
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            p.stock <= 0
                              ? 'bg-rose-500 text-white'
                              : p.stock <= p.minStock
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-800 text-white dark:bg-slate-700'
                          }`}
                        >
                          Tồn: {p.stock}
                        </span>
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                          CK đến 15%
                        </span>
                      </div>

                      {/* Giá bán & Nút thêm */}
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] sm:text-xs font-black text-indigo-600 dark:text-indigo-400 truncate">
                          {formatCurrency(p.salePrice)}
                        </span>
                        <div className="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                          <Plus className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-500 flex items-center justify-center mb-2.5">
                <FolderOpen className="w-7 h-7 stroke-[1.5]" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Không có sản phẩm trong nhóm này
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                {search.trim()
                  ? `Không tìm thấy sản phẩm nào khớp với từ khóa "${search}" trong nhóm này.`
                  : 'Nhóm hàng hiện chưa có sản phẩm kinh doanh hoặc đã hết hàng.'}
              </p>
              <div className="mt-4 flex items-center gap-2">
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                  >
                    Xóa tìm kiếm
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setCategoryFilter('all'); setSearch(''); }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
                >
                  Xem tất cả sản phẩm
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Thanh Phân Trang 20 Sản Phẩm / Trang */}
        {filteredProducts.length > 0 && (
          <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Trang <strong className="text-slate-800 dark:text-slate-200">{currentPage}</strong> / {totalPages} &bull; Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} / {filteredProducts.length} sp
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5 transition-all shadow-2xs"
                title="Trang trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Trước</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((page, idx) =>
                    typeof page === 'string' ? (
                      <span key={`dots-${idx}`} className="px-1 text-slate-400 text-xs">...</span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5 transition-all shadow-2xs"
                title="Trang sau"
              >
                <span className="hidden sm:inline">Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT SIDE: Cart, Customer & Checkout (46% - Mở rộng to ra) */}
      <div className="lg:w-[46%] xl:w-[45%] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
        {/* Customer Header với Ô Tìm Kiếm Có Thể Điền Trực Tiếp */}
        <div ref={customerSearchRef} className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 relative z-10">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              Khách hàng / Đại lý:
            </span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full shrink-0">
              {cart.reduce((s, i) => s + i.quantity, 0)} sp
            </span>
          </div>

          <div className="relative">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={
                  isCustomerDropdownOpen
                    ? customerSearchQuery
                    : selectedCustomer
                    ? `${selectedCustomer.name} (${selectedCustomer.phone || selectedCustomer.id})`
                    : customerSearchQuery
                }
                onFocus={() => {
                  setCustomerSearchQuery('');
                  setIsCustomerDropdownOpen(true);
                }}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setIsCustomerDropdownOpen(true);
                }}
                placeholder="Gõ tên, SĐT hoặc mã khách hàng để tìm..."
                className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId('CUS-010');
                    setCustomerSearchQuery('');
                    setIsCustomerDropdownOpen(false);
                  }}
                  className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="Đặt lại về Khách Lẻ"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Dropdown danh sách gợi ý khách hàng gõ tìm kiếm */}
            {isCustomerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">
                    Không tìm thấy khách hàng nào khớp
                  </div>
                ) : (
                  filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setCustomerSearchQuery('');
                        setIsCustomerDropdownOpen(false);
                      }}
                      className={`p-2 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                        selectedCustomerId === c.id ? 'bg-indigo-50 dark:bg-indigo-950/60 font-bold text-indigo-600' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{c.name}</span>
                          {c.status === 'locked' && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                              ⛔ Khoá GD
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {c.phone || 'Chưa có SĐT'} &bull; Mã: {c.id}
                        </div>
                      </div>
                      {selectedCustomerId === c.id && (
                        <span className="text-[10px] text-indigo-600 font-bold shrink-0">Đang chọn</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Banner cảnh báo đại lý bị khoá trên POS (SC-228) */}
        {isCustomerLocked && (
          <div
            id="pos-customer-locked-alert"
            className="p-3 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-2.5 text-xs animate-pulse"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900 dark:text-rose-100">
                ĐẠI LÝ ĐANG BỊ KHOÁ GIAO DỊCH
              </p>
              <p className="text-[11px] mt-0.5 text-rose-700 dark:text-rose-300">
                Đại lý '{selectedCustomer?.name}' đang bị khoá giao dịch. Không thể tạo đơn mới trên hệ thống POS!
              </p>
            </div>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2">
          {cart.length > 0 ? (
            cart.map((item) => (
              <div
                key={item.productId}
                className="p-2 flex flex-col gap-1 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-9 h-9 rounded-lg object-cover shrink-0 bg-slate-100"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                    )}
                    <div className="truncate flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.discountPct > 0 ? (
                          <>
                            <span className="text-[10px] line-through text-slate-400">
                              {formatCurrency(item.price)}
                            </span>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                              {formatCurrency(Math.round(item.price * (1 - item.discountPct / 100)))}
                            </span>
                            <span className="inline-flex items-center text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              CK {item.discountPct}%
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            {formatCurrency(item.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1 shrink-0">
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

        {/* Payment Summary Footer với chiết khấu số lượng thời gian thực (SCRUM-480) */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 p-3.5 space-y-2">
          {/* Discount details */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Tạm tính (giá gốc):</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(rawSubtotal)}</span>
            </div>

            {/* Dòng Chiết khấu sản lượng hiển thị cố định xuống dưới theo yêu cầu */}
            <div className={`flex justify-between items-center ${
              volumeDiscountTotal > 0
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              <span className="flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
                Chiết khấu sản lượng:
              </span>
              <div className="text-right">
                <span className={volumeDiscountTotal > 0 ? 'font-bold' : 'font-medium'}>
                  {volumeDiscountTotal > 0 ? `-${formatCurrency(volumeDiscountTotal)}` : '0 đ'}
                </span>
                {volumeDiscountTotal === 0 && (
                  <span className="block text-[10px] text-slate-400 font-normal">
                    (Mua từ 5 sp để hưởng mức CK)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Manual Discount & Tax Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Giảm giá thêm (VNĐ):</span>
              <input
                type="number"
                min={0}
                step={10000}
                value={manualDiscount || ''}
                onChange={(e) => setManualDiscount(Number(e.target.value))}
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
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Phương thức thanh toán:
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
              id="btn-pos-checkout"
              variant={isCustomerLocked ? "secondary" : "primary"}
              size="lg"
              onClick={handleCheckout}
              isLoading={isPaying}
              disabled={cart.length === 0 || isCustomerLocked}
              className={`px-8 font-bold ${
                isCustomerLocked
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                  : 'shadow-lg shadow-indigo-500/25'
              }`}
              leftIcon={isCustomerLocked ? <Lock className="w-4 h-4 text-slate-400" /> : undefined}
            >
              {isCustomerLocked ? 'Đại lý bị khoá' : 'Thanh Toán'}
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Bậc Chiết Khấu Số Lượng (SCRUM-486 / SCRUM-487) */}
      <VolumeDiscountPolicyModal
        isOpen={showTierModal}
        onClose={() => setShowTierModal(false)}
        onPolicyUpdated={() => {
          setCart((prev) =>
            prev.map((it) => {
              const { discountPct, nextTier, neededForNext } = getVolumeDiscountInfo(it.quantity);
              const discountAmt = Math.round((it.price * it.quantity * discountPct) / 100);
              return {
                ...it,
                discountPct,
                discountAmt,
                subtotal: it.price * it.quantity - discountAmt,
                neededForNext,
                nextTierPct: nextTier ? nextTier.discountPct : discountPct,
              };
            })
          );
        }}
      />

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
                      {it.discountAmt > 0 && ` (-${formatCurrency(it.discountAmt)})`}
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
                  <span>Tổng giảm giá:</span>
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

export default POS;
