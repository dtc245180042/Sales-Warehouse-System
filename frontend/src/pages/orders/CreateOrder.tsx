import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  Calendar,
  MapPin,
  User,
  ShoppingBag,
  FileText,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Bookmark,
  Send,
  X,
  Clock,
  Phone,
  ChevronDown,
  RefreshCw,
  Boxes,
} from 'lucide-react';
import { customerService } from '../../services/customerService';
import { deliveryAddressService } from '../../services/deliveryAddressService';
import { orderService } from '../../services/orderService';
import { Customer } from '../../types/Customer';
import { DeliveryAddress } from '../../types/DeliveryAddress';
import {
  Order,
  ProductSearchForOrder,
  OrderCalculateItem,
} from '../../types/Order';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency } from '../../utils/formatters';

interface FormItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  discount: number;
  subtotal: number;
  availableUnits: string[];
  appliedDiscountName?: string;
  stock?: number;
}

export const CreateOrder: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  // URL query pre-fill
  const prefillCustomerId = searchParams.get('customerId') || '';
  const editDraftId = searchParams.get('draftId') || '';

  // Form State
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(editDraftId || null);
  const [currentDraftCode, setCurrentDraftCode] = useState<string | null>(null);

  // Customer selection
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Delivery Addresses
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | undefined>(undefined);
  const [customAddress, setCustomAddress] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');

  // Expected Delivery Date (YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>(todayStr);

  // Notes
  const [note, setNote] = useState('');

  // Items in Order
  const [items, setItems] = useState<FormItem[]>([]);

  // Product Search State
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchForOrder[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  // Calculation State
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedSubtotal, setCalculatedSubtotal] = useState(0);
  const [calculatedDiscount, setCalculatedDiscount] = useState(0);
  const [calculatedTotal, setCalculatedTotal] = useState(0);

  // Drafts Drawer State
  const [isDraftsDrawerOpen, setIsDraftsDrawerOpen] = useState(false);
  const [draftOrders, setDraftOrders] = useState<Order[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const productSearchRef = useRef<HTMLDivElement>(null);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  // Load customer list
  useEffect(() => {
    let isMounted = true;
    customerService.getAll().then((list) => {
      if (isMounted) {
        setCustomers(list);
        if (prefillCustomerId) {
          const match = list.find((c) => c.id === prefillCustomerId || c.code === prefillCustomerId);
          if (match) setSelectedCustomer(match);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [prefillCustomerId]);

  // Load drafts count
  const loadDraftsList = async () => {
    setIsLoadingDrafts(true);
    try {
      const drafts = await orderService.getDrafts();
      setDraftOrders(drafts);
    } catch {
      // fallback
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  useEffect(() => {
    loadDraftsList();
  }, []);

  // If editDraftId is provided, load draft details
  useEffect(() => {
    if (editDraftId) {
      orderService.getById(editDraftId).then((draft) => {
        if (draft && draft.status === 'draft') {
          setCurrentDraftId(draft.id);
          setCurrentDraftCode(draft.code);
          if (draft.expectedDeliveryDate) setExpectedDeliveryDate(draft.expectedDeliveryDate);
          if (draft.note) setNote(draft.note);

          // Find customer
          customerService.getAll().then((list) => {
            const c = list.find((cust) => cust.id === draft.customerId || cust.code === draft.customerId);
            if (c) setSelectedCustomer(c);
          });

          // Delivery details
          if (draft.deliveryAddressId) setSelectedAddressId(draft.deliveryAddressId);
          if (draft.deliveryAddress) setCustomAddress(draft.deliveryAddress);
          if (draft.deliveryReceiverName) setReceiverName(draft.deliveryReceiverName);
          if (draft.deliveryPhone) setReceiverPhone(draft.deliveryPhone);

          // Items
          const mappedItems: FormItem[] = draft.items.map((i) => ({
            productId: i.productId,
            sku: i.sku,
            name: i.name,
            unit: i.unit || 'cái',
            price: i.price,
            quantity: i.quantity,
            discount: i.discount || 0,
            subtotal: i.subtotal,
            availableUnits: [i.unit || 'cái', 'hộp', 'thùng'],
          }));
          setItems(mappedItems);
        }
      });
    }
  }, [editDraftId]);

  // Fetch Delivery Addresses when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      deliveryAddressService.getByCustomerId(selectedCustomer.id).then((addresses) => {
        setDeliveryAddresses(addresses);
        if (addresses.length > 0) {
          const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
          setSelectedAddressId(defaultAddr.id);
          setReceiverName(defaultAddr.receiverName);
          setReceiverPhone(defaultAddr.phone);
          setCustomAddress(defaultAddr.address);
        } else {
          setSelectedAddressId(undefined);
          setReceiverName(selectedCustomer.name);
          setReceiverPhone(selectedCustomer.phone);
          setCustomAddress(selectedCustomer.address);
        }
      });
    } else {
      setDeliveryAddresses([]);
      setSelectedAddressId(undefined);
      setCustomAddress('');
      setReceiverName('');
      setReceiverPhone('');
    }
  }, [selectedCustomer]);

  // Handle address select change
  const handleAddressChange = (addrIdStr: string) => {
    if (addrIdStr === 'custom' || !addrIdStr) {
      setSelectedAddressId(undefined);
      return;
    }
    const numId = parseInt(addrIdStr, 10);
    setSelectedAddressId(numId);
    const found = deliveryAddresses.find((a) => a.id === numId);
    if (found) {
      setReceiverName(found.receiverName);
      setReceiverPhone(found.phone);
      setCustomAddress(found.address);
    }
  };

  // Product Search Debounce
  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([]);
      setIsProductDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingProduct(true);
      try {
        const res = await orderService.searchProductsForOrder(productQuery.trim());
        setProductResults(res);
        setIsProductDropdownOpen(true);
      } catch {
        setProductResults([]);
      } finally {
        setIsSearchingProduct(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [productQuery]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time calculation whenever items change
  useEffect(() => {
    if (items.length === 0) {
      setCalculatedSubtotal(0);
      setCalculatedDiscount(0);
      setCalculatedTotal(0);
      return;
    }

    if (!selectedCustomer) {
      // Calculate locally if no customer selected yet
      const sub = items.reduce((sum, itm) => sum + itm.price * itm.quantity, 0);
      setCalculatedSubtotal(sub);
      setCalculatedDiscount(0);
      setCalculatedTotal(sub);
      return;
    }

    let isMounted = true;
    setIsCalculating(true);

    const calcItems: OrderCalculateItem[] = items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      price: i.price,
      unit: i.unit,
    }));

    orderService
      .calculate({
        customer_id: selectedCustomer.id,
        items: calcItems,
      })
      .then((res) => {
        if (!isMounted) return;
        setCalculatedSubtotal(res.subtotal);
        setCalculatedDiscount(res.discount);
        setCalculatedTotal(res.total);

        // Update items with discount names & individual calculations
        setItems((prev) =>
          prev.map((item) => {
            const resItem = res.items.find(
              (ri) => String(ri.product_id) === String(item.productId)
            );
            if (resItem) {
              return {
                ...item,
                discount: resItem.discount_amount || 0,
                subtotal: resItem.subtotal,
                appliedDiscountName: resItem.applied_discount_name || undefined,
              };
            }
            return item;
          })
        );
      })
      .catch((err) => {
        console.warn('Calculation error, fallback local:', err);
        const sub = items.reduce((sum, itm) => sum + itm.price * itm.quantity, 0);
        setCalculatedSubtotal(sub);
        setCalculatedDiscount(0);
        setCalculatedTotal(sub);
      })
      .finally(() => {
        if (isMounted) setIsCalculating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [items.length, items.map((i) => `${i.productId}-${i.quantity}-${i.unit}`).join('|'), selectedCustomer?.id]);

  // Add product to items
  const handleAddProduct = (prod: ProductSearchForOrder) => {
    const existingIndex = items.findIndex((i) => String(i.productId) === String(prod.id));
    if (existingIndex !== -1) {
      // Increase qty
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].subtotal = updated[existingIndex].price * updated[existingIndex].quantity;
      setItems(updated);
    } else {
      // Add new
      const defaultUnit = prod.unit || (prod.available_units?.[0] ?? 'cái');
      const newItem: FormItem = {
        productId: String(prod.id),
        sku: prod.sku,
        name: prod.name,
        unit: defaultUnit,
        price: prod.sale_price || prod.price,
        quantity: 1,
        discount: 0,
        subtotal: prod.sale_price || prod.price,
        availableUnits: prod.available_units || [defaultUnit],
        stock: prod.stock,
      };
      setItems((prev) => [newItem, ...prev]);
    }
    setProductQuery('');
    setIsProductDropdownOpen(false);
  };

  // Update item quantity
  const handleUpdateQty = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, quantity: newQty, subtotal: i.price * newQty - i.discount }
          : i
      )
    );
  };

  // Update item unit
  const handleUpdateUnit = (productId: string, newUnit: string) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, unit: newUnit } : i))
    );
  };

  // Remove item
  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  // Build Payload
  const buildPayload = (status: 'draft' | 'pending') => {
    if (!selectedCustomer) {
      throw new Error('Vui lòng chọn đại lý / khách hàng đặt hàng');
    }
    if (items.length === 0) {
      throw new Error('Vui lòng thêm ít nhất một sản phẩm vào đơn hàng');
    }

    const selectedAddr = deliveryAddresses.find((a) => a.id === selectedAddressId);

    return {
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: receiverPhone || selectedCustomer.phone,
      customerAddress: customAddress || selectedCustomer.address,
      items: items.map((i) => ({
        productId: i.productId,
        sku: i.sku,
        name: i.name,
        unit: i.unit,
        price: i.price,
        quantity: i.quantity,
        discount: i.discount,
        subtotal: i.subtotal,
      })),
      subtotal: calculatedSubtotal,
      discount: calculatedDiscount,
      total: calculatedTotal,
      paidAmount: 0,
      paymentMethod: 'transfer' as const,
      paymentStatus: 'unpaid' as const,
      status: status,
      staffId: user?.id ? String(user.id) : '1',
      staffName: user?.username || user?.fullName || 'Nhân viên kinh doanh',
      note: note.trim() || undefined,
      deliveryAddressId: selectedAddressId,
      deliveryAddressName: selectedAddr?.name,
      deliveryReceiverName: receiverName || selectedCustomer.name,
      deliveryPhone: receiverPhone || selectedCustomer.phone,
      deliveryAddress: customAddress || selectedCustomer.address,
      expectedDeliveryDate: expectedDeliveryDate || todayStr,
    };
  };

  // Handle Save Draft
  const handleSaveDraft = async () => {
    try {
      if (!selectedCustomer) {
        showToast('Vui lòng chọn đại lý trước khi lưu nháp', 'warning');
        return;
      }
      if (items.length === 0) {
        showToast('Vui lòng thêm ít nhất 1 sản phẩm trước khi lưu nháp', 'warning');
        return;
      }

      setIsSavingDraft(true);
      const payload = buildPayload('draft');

      if (currentDraftId) {
        // Cập nhật đơn nháp hiện có
        const updated = await orderService.updateDraft(currentDraftId, {
          customer_id: payload.customerId,
          customer_name: payload.customerName,
          customer_phone: payload.customerPhone,
          customer_address: payload.customerAddress,
          items: payload.items.map((i) => ({
            product_id: i.productId,
            sku: i.sku,
            name: i.name,
            unit: i.unit,
            price: i.price,
            quantity: i.quantity,
            discount: i.discount,
            subtotal: i.subtotal,
          })),
          subtotal: payload.subtotal,
          discount: payload.discount,
          total: payload.total,
          note: payload.note,
          delivery_address_id: payload.deliveryAddressId,
          delivery_address_name: payload.deliveryAddressName,
          delivery_receiver_name: payload.deliveryReceiverName,
          delivery_phone: payload.deliveryPhone,
          delivery_address: payload.deliveryAddress,
          expected_delivery_date: payload.expectedDeliveryDate,
        });
        showToast(`Đã lưu cập nhật đơn nháp [${updated.code || currentDraftId}]`, 'success');
        loadDraftsList();
      } else {
        // Tạo mới đơn nháp
        const created = await orderService.create(payload);
        setCurrentDraftId(created.id);
        setCurrentDraftCode(created.code);
        showToast(`Đã lưu đơn nháp thành công: ${created.code}`, 'success');
        loadDraftsList();
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu đơn nháp', 'error');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle Submit Order
  const handleSubmitOrder = async () => {
    try {
      if (!selectedCustomer) {
        showToast('Vui lòng chọn khách hàng / đại lý', 'warning');
        return;
      }
      if (items.length === 0) {
        showToast('Vui lòng thêm ít nhất 1 sản phẩm vào đơn hàng', 'warning');
        return;
      }

      // Validate expected delivery date
      if (expectedDeliveryDate && expectedDeliveryDate < todayStr) {
        showToast('Ngày giao mong muốn không được là ngày trong quá khứ', 'error');
        return;
      }

      setIsSubmitting(true);

      if (currentDraftId) {
        // 1. Cập nhật nháp trước
        const payload = buildPayload('draft');
        await orderService.updateDraft(currentDraftId, {
          customer_id: payload.customerId,
          customer_name: payload.customerName,
          customer_phone: payload.customerPhone,
          customer_address: payload.customerAddress,
          items: payload.items.map((i) => ({
            product_id: i.productId,
            sku: i.sku,
            name: i.name,
            unit: i.unit,
            price: i.price,
            quantity: i.quantity,
            discount: i.discount,
            subtotal: i.subtotal,
          })),
          subtotal: payload.subtotal,
          discount: payload.discount,
          total: payload.total,
          note: payload.note,
          delivery_address_id: payload.deliveryAddressId,
          delivery_address_name: payload.deliveryAddressName,
          delivery_receiver_name: payload.deliveryReceiverName,
          delivery_phone: payload.deliveryPhone,
          delivery_address: payload.deliveryAddress,
          expected_delivery_date: payload.expectedDeliveryDate,
        });

        // 2. Chốt đơn
        const submitted = await orderService.submitDraft(currentDraftId);
        showToast(`Đã chốt đơn hàng thành công! Mã đơn: ${submitted.code}`, 'success');
        navigate('/orders');
      } else {
        // Tạo trực tiếp đơn chính thức
        const payload = buildPayload('pending');
        const created = await orderService.create(payload);
        showToast(`Đã tạo đơn hàng thành công! Mã đơn: ${created.code}`, 'success');
        navigate('/orders');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi chốt đơn hàng', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resume Draft from Drawer
  const handleResumeDraft = (draft: Order) => {
    setCurrentDraftId(draft.id);
    setCurrentDraftCode(draft.code);
    if (draft.expectedDeliveryDate) setExpectedDeliveryDate(draft.expectedDeliveryDate);
    if (draft.note) setNote(draft.note);

    const c = customers.find((cust) => cust.id === draft.customerId || cust.code === draft.customerId);
    if (c) setSelectedCustomer(c);

    if (draft.deliveryAddressId) setSelectedAddressId(draft.deliveryAddressId);
    if (draft.deliveryAddress) setCustomAddress(draft.deliveryAddress);
    if (draft.deliveryReceiverName) setReceiverName(draft.deliveryReceiverName);
    if (draft.deliveryPhone) setReceiverPhone(draft.deliveryPhone);

    const mappedItems: FormItem[] = draft.items.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      unit: i.unit || 'cái',
      price: i.price,
      quantity: i.quantity,
      discount: i.discount || 0,
      subtotal: i.subtotal,
      availableUnits: [i.unit || 'cái', 'hộp', 'thùng'],
    }));
    setItems(mappedItems);

    setIsDraftsDrawerOpen(false);
    showToast(`Đã khôi phục đơn nháp: ${draft.code}`, 'info');
  };

  // Reset to brand new order
  const handleResetForm = () => {
    setCurrentDraftId(null);
    setCurrentDraftCode(null);
    setItems([]);
    setNote('');
    setExpectedDeliveryDate(todayStr);
    showToast('Đã bắt đầu đơn hàng mới', 'info');
  };

  // Quick chips for date
  const setQuickDate = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    setExpectedDeliveryDate(d.toISOString().split('T')[0]);
  };

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 10);
    const q = customerSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [customers, customerSearch]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28 text-slate-800 dark:text-slate-100">
      {/* Top Header Optimized for Mobile 360px */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
              title="Quay lại"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="truncate">
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                Tạo Đơn Hàng
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsDraftsDrawerOpen(true)}
              className="relative flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 hover:bg-amber-100 active:scale-95 transition-all"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Nháp</span>
              {draftOrders.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                  {draftOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-3 py-3 space-y-3.5">
        {/* Banner if editing a draft */}
        {currentDraftId && (
          <div className="flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2 truncate">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                Đang sửa đơn nháp: <strong className="font-semibold">{currentDraftCode || currentDraftId}</strong>
              </span>
            </div>
            <button
              onClick={handleResetForm}
              className="ml-2 px-2 py-1 text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 active:scale-95 shrink-0"
            >
              Tạo đơn mới
            </button>
          </div>
        )}

        {/* SECTION 1: Chọn Khách hàng & Điểm giao */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 text-xs font-bold">
                1
              </span>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Khách Hàng & Điểm Giao
              </h2>
            </div>
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsCustomerDropdownOpen(true);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Đổi đại lý
              </button>
            )}
          </div>

          {/* Customer Selection */}
          {!selectedCustomer ? (
            <div ref={customerSearchRef} className="relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setIsCustomerDropdownOpen(true);
                  }}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  placeholder="Tìm đại lý theo tên, mã hoặc SĐT..."
                  className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                {customerSearch && (
                  <button
                    onClick={() => setCustomerSearch('')}
                    className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isCustomerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg max-h-60 overflow-y-auto z-20 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      Không tìm thấy đại lý phù hợp
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setIsCustomerDropdownOpen(false);
                          setCustomerSearch('');
                        }}
                        className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors"
                      >
                        <User className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                              {c.name}
                            </span>
                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
                              {c.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            <span>{c.phone || 'Chưa có SĐT'}</span>
                            {c.address && <span className="truncate">&bull; {c.address}</span>}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/60 rounded-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-blue-950 dark:text-blue-100">
                    {selectedCustomer.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-blue-800 dark:text-blue-300 mt-0.5">
                    <span className="font-mono bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                      {selectedCustomer.code}
                    </span>
                    <span>{selectedCustomer.phone}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Address Pick (S3-04) */}
          {selectedCustomer && (
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Điểm giao hàng của đại lý
              </label>

              {deliveryAddresses.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedAddressId ?? 'custom'}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
                  >
                    {deliveryAddresses.map((addr) => (
                      <option key={addr.id} value={addr.id}>
                        {addr.name} {addr.isDefault ? '(Mặc định)' : ''} - {addr.address}
                      </option>
                    ))}
                    <option value="custom">Giao tại địa chỉ khác...</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Đại lý này chưa cấu hình điểm giao hàng phụ. Đơn hàng sẽ giao theo địa chỉ đăng ký.
                </p>
              )}

              {/* Delivery Details Card */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="font-medium truncate">{customAddress || 'Chưa có địa chỉ'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>Người nhận: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{receiverName || 'Chưa rõ'}</strong></span>
                  <span>SĐT: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{receiverPhone || 'Chưa rõ'}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Expected Delivery Date (S3-09) */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ngày giao mong muốn
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="date"
                  min={todayStr}
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Quick shortcut chips */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setQuickDate(0)}
                  className={`px-2 py-2 text-[11px] font-medium rounded-lg border transition-all ${expectedDeliveryDate === todayStr
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(1)}
                  className="px-2 py-2 text-[11px] font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 active:scale-95"
                >
                  +1 ngày
                </button>
              </div>
            </div>
          </div>

          {/* Ghi chú đơn hàng */}
          <div className="space-y-1 pt-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ghi chú giao hàng
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Giao buổi sáng, xe tải vào cổng số 2..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>

        {/* SECTION 2: Thêm dòng hàng & Tìm kiếm sản phẩm */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 text-xs font-bold">
                2
              </span>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Mặt Hàng ({items.length})
              </h2>
            </div>
            {isCalculating && (
              <span className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Đang tính...
              </span>
            )}
          </div>

          {/* Product Search Input */}
          <div ref={productSearchRef} className="relative">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Tìm sản phẩm theo mã SKU hoặc tên..."
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {isSearchingProduct && (
                <RefreshCw className="w-4 h-4 absolute right-3 top-3 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Product Suggestions Dropdown */}
            {isProductDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-72 overflow-y-auto z-20 divide-y divide-slate-100 dark:divide-slate-800">
                {productResults.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    {isSearchingProduct ? 'Đang tìm kiếm...' : 'Không tìm thấy sản phẩm nào'}
                  </div>
                ) : (
                  productResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between gap-2 active:bg-slate-100 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded">
                            {p.sku}
                          </span>
                          <span>Kho: <strong className="text-slate-700 dark:text-slate-300">{p.stock}</strong></span>
                          <span>ĐVT: {p.unit}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          {formatCurrency(p.sale_price || p.price)}
                        </div>
                        <button
                          type="button"
                          className="mt-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                        >
                          + Thêm
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Items List */}
          {items.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <Boxes className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-medium">Chưa có mặt hàng nào trong đơn</p>
              <p className="text-[11px] text-slate-400">
                Tìm kiếm theo mã SKU hoặc tên ở trên để thêm sản phẩm
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className="p-3 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 rounded-xl space-y-2"
                >
                  {/* Row 1: Name, SKU & Delete */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-white leading-tight">
                        {item.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                        <span className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {item.sku}
                        </span>
                        <span>Đơn giá: {formatCurrency(item.price)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.productId)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      title="Xóa dòng"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Row 2: Unit selector & Stepper Quantity & Subtotal */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {/* Unit Selector */}
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] text-slate-500 shrink-0">ĐVT:</label>
                      <select
                        value={item.unit}
                        onChange={(e) => handleUpdateUnit(item.productId, e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {item.availableUnits.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Stepper Quantity (Touch friendly >= 44px) */}
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.productId, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 active:scale-95 transition-all"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateQty(item.productId, parseInt(e.target.value, 10) || 1)
                        }
                        className="w-10 h-8 text-center text-xs font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.productId, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Line Total */}
                    <div className="text-right shrink-0">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  </div>

                  {/* Volume Discount Badge (S3-01) */}
                  {item.appliedDiscountName && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-md border border-emerald-200/80 dark:border-emerald-800/60">
                      <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {item.appliedDiscountName}: -{formatCurrency(item.discount)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3: Tóm tắt thanh toán theo thời gian thực */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span>Tạm tính tiền hàng:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {formatCurrency(calculatedSubtotal)}
            </span>
          </div>

          {calculatedDiscount > 0 && (
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Chiết khấu sản lượng:
              </span>
              <span>-{formatCurrency(calculatedDiscount)}</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="font-bold text-sm text-slate-900 dark:text-white">
              Tổng thanh toán:
            </span>
            <span className="font-black text-base text-blue-600 dark:text-blue-400">
              {formatCurrency(calculatedTotal)}
            </span>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Bar Optimized for 360px Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-2.5 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Price Preview */}
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              Tổng phải thu
            </div>
            <div className="text-base font-black text-blue-600 dark:text-blue-400 leading-tight truncate">
              {formatCurrency(calculatedTotal)}
            </div>
            {calculatedDiscount > 0 && (
              <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                Tiết kiệm: {formatCurrency(calculatedDiscount)}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting || items.length === 0}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 disabled:opacity-50 active:scale-95 transition-all"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-500" />
              <span>{isSavingDraft ? 'Đang lưu...' : 'Lưu nháp'}</span>
            </button>

            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={isSubmitting || isSavingDraft || items.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 active:scale-95 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Đang gửi...' : 'Chốt đơn'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Slide-over Drawer: Danh sách Đơn Nháp */}
      {isDraftsDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Đơn Hàng Đang Soạn Dở ({draftOrders.length})
                </h3>
              </div>
              <button
                onClick={() => setIsDraftsDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {isLoadingDrafts ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                  Đang tải đơn nháp...
                </div>
              ) : draftOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                  <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="font-medium">Không có đơn nháp nào</p>
                  <p className="text-[11px] text-slate-400">
                    Nhấn "Lưu nháp" khi đang tạo đơn để tiếp tục gõ sau.
                  </p>
                </div>
              ) : (
                draftOrders.map((draft) => (
                  <div
                    key={draft.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-1.5 hover:border-amber-400 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {draft.code}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {draft.updatedAt || draft.createdAt}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                      Đại lý: <strong>{draft.customerName}</strong>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-500 text-[11px]">
                        {draft.items.length} món &bull; {formatCurrency(draft.total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleResumeDraft(draft)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all"
                      >
                        Tiếp tục gõ
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
