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
  ShieldAlert,
  Ban,
  CreditCard,
  Banknote,
  QrCode,
  Receipt,
} from 'lucide-react';
import { CustomerCreditBanner, CustomerCreditStatusInfo } from '../../components/orders/CustomerCreditBanner';
import { customerService } from '../../services/customerService';
import { deliveryAddressService } from '../../services/deliveryAddressService';
import { orderService } from '../../services/orderService';
import { pricingService } from '../../services/pricingService';
import { EffectivePriceListResponse } from '../../types/Pricing';
import { Customer } from '../../types/Customer';
import { DeliveryAddress } from '../../types/DeliveryAddress';
import {
  Order,
  ProductSearchForOrder,
  OrderCalculateItem,
} from '../../types/Order';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, formatCurrencyInput } from '../../utils/formatters';

interface FormItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  originalPrice?: number;
  floorPrice?: number;
  isBelowFloor?: boolean;
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
  const [creditStatus, setCreditStatus] = useState<CustomerCreditStatusInfo | null>(null);
  const [effectivePriceList, setEffectivePriceList] = useState<EffectivePriceListResponse | null>(null);
  const [isLoadingPriceList, setIsLoadingPriceList] = useState(false);

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

  // Payment & Settlement State (Thanh toán tại chỗ / Quyết toán công nợ)
  const [paymentMode, setPaymentMode] = useState<'credit' | 'full' | 'partial'>('credit');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer');

  const unpaidAmount = useMemo(() => {
    return Math.max(0, calculatedTotal - paidAmount);
  }, [calculatedTotal, paidAmount]);

  // Đồng bộ số tiền thanh toán khi tổng tiền hoặc chế độ quyết toán thay đổi
  useEffect(() => {
    if (paymentMode === 'full') {
      setPaidAmount(calculatedTotal);
    } else if (paymentMode === 'credit') {
      setPaidAmount(0);
    } else if (paymentMode === 'partial') {
      if (paidAmount > calculatedTotal) {
        setPaidAmount(calculatedTotal);
      }
    }
  }, [calculatedTotal, paymentMode]);

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

  // S4-01: Tải Bảng giá hiệu lực của khách hàng
  useEffect(() => {
    if (selectedCustomer) {
      setIsLoadingPriceList(true);
      pricingService
        .getEffectivePriceList(selectedCustomer.id)
        .then((res) => {
          setEffectivePriceList(res);
        })
        .catch((err) => {
          console.warn('Lỗi lấy bảng giá hiệu lực:', err);
          setEffectivePriceList(null);
        })
        .finally(() => {
          setIsLoadingPriceList(false);
        });
    } else {
      setEffectivePriceList(null);
    }
  }, [selectedCustomer?.id]);

  // Kiểm tra xem đơn hàng có dòng nào bán dưới giá sàn không (SCRUM-490 & SCRUM-495)
  const hasBelowFloor = useMemo(() => {
    return items.some((i) => i.isBelowFloor);
  }, [items]);

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

  // Tự động nạp gợi ý sản phẩm khi focus vào ô tìm kiếm
  const handleFocusProductSearch = async () => {
    if (productResults.length === 0) {
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
    } else {
      setIsProductDropdownOpen(true);
    }
  };

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

  // Add product to items (SCRUM-488, SCRUM-489, SCRUM-492, SCRUM-493)
  const handleAddProduct = async (prod: ProductSearchForOrder) => {
    if (!selectedCustomer) {
      showToast('Vui lòng chọn đại lý / khách hàng trước khi thêm sản phẩm để áp đúng bảng giá', 'warning');
      return;
    }

    try {
      const pricing = await pricingService.lookupLinePricing({
        customer_id: selectedCustomer.id,
        product_id: String(prod.id),
        sku: prod.sku,
        quantity: 1,
      });

      // SCRUM-492: Chặn thêm dòng hàng khi SKU không có bảng giá hiệu lực và trả thông báo lỗi
      if (!pricing.success && pricing.message) {
        showToast(pricing.message, 'error');
        return;
      }

      const existingIndex = items.findIndex((i) => String(i.productId) === String(prod.id));
      if (existingIndex !== -1) {
        // Tăng số lượng và tính lại chiết khấu
        const currentQty = items[existingIndex].quantity + 1;
        await handleUpdateQty(String(prod.id), currentQty);
      } else {
        // Thêm dòng mới với giá tự động và giá sàn
        const defaultUnit = prod.unit || (prod.available_units?.[0] ?? 'cái');
        const newItem: FormItem = {
          productId: String(prod.id),
          sku: prod.sku,
          name: prod.name,
          unit: defaultUnit,
          price: pricing.applied_unit_price,
          originalPrice: pricing.default_price,
          floorPrice: pricing.floor_price,
          isBelowFloor: pricing.is_below_floor,
          quantity: 1,
          discount: pricing.total_discount,
          subtotal: pricing.line_total,
          availableUnits: prod.available_units || [defaultUnit],
          stock: prod.stock,
          appliedDiscountName: pricing.applied_discount_policy_name || undefined,
        };
        setItems((prev) => [newItem, ...prev]);
        showToast(`Đã áp giá tự động cho "${prod.name}": ${formatCurrency(pricing.applied_unit_price)}`, 'success');
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi áp giá sản phẩm';
      showToast(msg, 'error');
      return;
    }

    setProductQuery('');
    setIsProductDropdownOpen(false);
  };

  // Update item quantity (SCRUM-491: Tính lại chiết khấu theo sản lượng khi đổi số lượng)
  const handleUpdateQty = async (productId: string, newQty: number) => {
    if (newQty < 1) return;
    const itm = items.find((i) => i.productId === productId);
    if (!itm) return;

    if (selectedCustomer) {
      try {
        const pricing = await pricingService.lookupLinePricing({
          customer_id: selectedCustomer.id,
          product_id: productId,
          sku: itm.sku,
          quantity: newQty,
          custom_price: itm.price,
        });

        setItems((prev) =>
          prev.map((i) =>
            i.productId === productId
              ? {
                  ...i,
                  quantity: newQty,
                  discount: pricing.total_discount,
                  subtotal: pricing.line_total,
                  appliedDiscountName: pricing.applied_discount_policy_name || undefined,
                  isBelowFloor: pricing.is_below_floor,
                }
              : i
          )
        );
        return;
      } catch (err) {
        console.warn('Lỗi tính chiết khấu khi đổi số lượng:', err);
      }
    }

    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, quantity: newQty, subtotal: Math.max(0, i.price * newQty - i.discount) }
          : i
      )
    );
  };

  // S4-01: Update item price manually & kiểm tra giá sàn (SCRUM-490 & SCRUM-495)
  const handleUpdatePrice = (productId: string, newPrice: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.productId === productId) {
          const belowFloor = Boolean(i.floorPrice && i.floorPrice > 0 && newPrice < i.floorPrice);
          return {
            ...i,
            price: newPrice,
            isBelowFloor: belowFloor,
            subtotal: Math.max(0, newPrice * i.quantity - i.discount),
          };
        }
        return i;
      })
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

    const willRequireApproval = hasBelowFloor || Boolean(creditStatus?.isExceeded);
    const finalStatus = (status === 'draft') ? 'draft' : (willRequireApproval ? 'pending_approval' : status);

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
        floor_price: i.floorPrice,
        is_below_floor: i.isBelowFloor,
      })),
      subtotal: calculatedSubtotal,
      discount: calculatedDiscount,
      total: calculatedTotal,
      paidAmount: paidAmount,
      paymentMethod: paymentMethod,
      paymentStatus: (paidAmount >= calculatedTotal && calculatedTotal > 0
        ? 'paid'
        : paidAmount > 0
        ? 'partial'
        : 'unpaid') as any,
      status: finalStatus as any,
      requiresApproval: willRequireApproval,
      approvalReason: hasBelowFloor
        ? 'Có sản phẩm bán dưới giá sàn quy định'
        : creditStatus?.isExceeded
        ? 'Vượt hạn mức công nợ đại lý'
        : undefined,
      staffId: user?.id ? String(user.id) : '1',
      staffName: user?.name || user?.username || user?.fullName || 'Nhân viên kinh doanh',
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

      // S4-02: Kiểm tra nợ quá hạn - Chặn tạo/chốt đơn hoàn toàn
      if (creditStatus?.isBlocked) {
        showToast(
          creditStatus.blockReason || 'Đại lý đang có khoản nợ quá hạn. Hệ thống chặn tạo đơn hoàn toàn theo quy định!',
          'error'
        );
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
        if (submitted.status === 'pending_approval' || submitted.requiresApproval) {
          showToast(`Đơn hàng vượt hạn mức công nợ [${submitted.code}] đã được gửi Chờ duyệt!`, 'info');
        } else {
          showToast(`Đã chốt đơn hàng thành công! Mã đơn: ${submitted.code}`, 'success');
        }
        navigate('/orders');
      } else {
        // Tạo trực tiếp đơn chính thức
        const payload = buildPayload('pending');
        const created = await orderService.create(payload);
        if (created.status === 'pending_approval' || created.requiresApproval) {
          showToast(`Đơn hàng vượt hạn mức công nợ [${created.code}] đã được tạo ở trạng thái Chờ duyệt!`, 'info');
        } else {
          showToast(`Đã tạo đơn hàng thành công! Mã đơn: ${created.code}`, 'success');
        }
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

  // Filtered customer list (Hỗ trợ tìm theo tên, mã code KH-xxx, mã ID CUS-xxx, SĐT)
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase().trim();
    const qClean = q.replace(/[-\s_]/g, '');
    return customers
      .filter((c) => {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const codeMatch = c.code ? c.code.toLowerCase().includes(q) : false;
        const idMatch = c.id ? c.id.toLowerCase().includes(q) : false;
        const phoneMatch = c.phone ? c.phone.includes(q) : false;
        const codeCleanMatch = c.code ? c.code.toLowerCase().replace(/[-\s_]/g, '').includes(qClean) : false;
        const idCleanMatch = c.id ? c.id.toLowerCase().replace(/[-\s_]/g, '').includes(qClean) : false;
        return nameMatch || codeMatch || idMatch || phoneMatch || codeCleanMatch || idCleanMatch;
      })
      .slice(0, 15);
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
                Tạo Đơn Hàng Hiện Trường
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Tối ưu di động 360px &bull; S3-09
              </p>
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
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-semibold">
                                {c.code}
                              </span>
                              {c.id && c.id !== c.code && (
                                <span className="text-[10px] font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold">
                                  {c.id}
                                </span>
                              )}
                              {c.customerGroup && (
                                <span className="text-[9px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                                  {c.customerGroup}
                                </span>
                              )}
                            </div>
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
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/60 rounded-xl space-y-2">
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
                    {selectedCustomer.customerGroup && (
                      <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                        {effectivePriceList?.customer?.customer_group_label || selectedCustomer.customerGroup}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* S4-01: Hiển thị thông tin Bảng giá hiệu lực */}
              {isLoadingPriceList ? (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Đang kiểm tra bảng giá áp dụng...
                </div>
              ) : effectivePriceList?.has_effective_price_list && effectivePriceList.price_list ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Bảng giá hiệu lực: <strong className="font-bold">{effectivePriceList.price_list.name}</strong> ({effectivePriceList.price_list.code}) &bull; Tự động áp giá khi thêm SKU
                  </span>
                </div>
              ) : selectedCustomer.customerGroup && selectedCustomer.customerGroup !== 'RETAIL' ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Nhóm đại lý chưa có bảng giá hiệu lực. Hệ thống sẽ chặn thêm dòng hàng theo quy định SCRUM-492.
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* S4-02: Khối Hiển thị Công nợ hiện tại, Hạn mức & Cảnh báo vượt hạn mức / Chặn quá hạn */}
          {selectedCustomer && (
            <CustomerCreditBanner
              customerId={selectedCustomer.id}
              customerName={selectedCustomer.name}
              newOrderAmount={calculatedTotal}
              newOrderPaid={paidAmount}
              onStatusChange={setCreditStatus}
            />
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
                  className={`px-2 py-2 text-[11px] font-medium rounded-lg border transition-all ${
                    expectedDeliveryDate === todayStr
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
                onFocus={handleFocusProductSearch}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Tìm sản phẩm theo mã SKU hoặc tên (hoặc click để xem gợi ý)..."
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {isSearchingProduct && (
                <RefreshCw className="w-4 h-4 absolute right-3 top-3 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Gợi ý thêm nhanh sản phẩm (Quick-Add Chips) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-[11px] font-semibold text-slate-500 shrink-0">Thêm nhanh:</span>
              {[
                { id: 'PRD-001', name: 'iPhone 15 Pro', sku: 'IP15P-128-TI', price: 26990000, unit: 'cái', stock: 100 },
                { id: 'PRD-002', name: 'Samsung S24 Ultra', sku: 'SAM-S24U-512', price: 29990000, unit: 'cái', stock: 100 },
                { id: 'PRD-005', name: 'Tai nghe Sony', sku: 'SN-WH1000XM5-BK', price: 7990000, unit: 'cái', stock: 100 },
                { id: 'PRD-006', name: 'AirPods Pro 2', sku: 'AP-PRO-2-USBC', price: 5690000, unit: 'hộp', stock: 100 },
              ].map((quick) => (
                <button
                  key={quick.id}
                  type="button"
                  onClick={() => handleAddProduct(quick as any)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900 active:scale-95 transition-all shadow-2xs"
                >
                  <Plus className="w-3 h-3 text-blue-500" />
                  <span>{quick.name}</span>
                </button>
              ))}
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
            <div className="py-6 px-4 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <Boxes className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Chưa có mặt hàng nào trong đơn
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Bấm một trong các nút bên dưới để thêm nhanh sản phẩm vào đơn:
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {[
                  { id: 'PRD-001', name: 'iPhone 15 Pro 128GB', sku: 'IP15P-128-TI', price: 26990000, unit: 'cái', stock: 100 },
                  { id: 'PRD-002', name: 'Samsung Galaxy S24 Ultra', sku: 'SAM-S24U-512', price: 29990000, unit: 'cái', stock: 100 },
                  { id: 'PRD-005', name: 'Tai nghe Sony WH-1000XM5', sku: 'SN-WH1000XM5-BK', price: 7990000, unit: 'cái', stock: 100 },
                ].map((quick) => (
                  <button
                    key={quick.id}
                    type="button"
                    onClick={() => handleAddProduct(quick as any)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Thêm {quick.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className={`p-3 rounded-xl space-y-2 border transition-all ${
                    item.isBelowFloor
                      ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 shadow-xs'
                      : 'bg-slate-50/80 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/70'
                  }`}
                >
                  {/* Row 1: Name, SKU, Floor Price & Delete */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-white leading-tight">
                        {item.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                        <span className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {item.sku}
                        </span>
                        {item.floorPrice && item.floorPrice > 0 ? (
                          <span className="text-slate-500 dark:text-slate-400">
                            Giá sàn: <strong className="font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(item.floorPrice)}</strong>
                          </span>
                        ) : null}
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

                  {/* Row 2: Price editor, Unit selector & Stepper Quantity & Subtotal */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
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

                    {/* Price Input with Floor validation (SCRUM-490 & SCRUM-495) */}
                    <div className="flex items-center gap-1">
                      <label className="text-[11px] text-slate-500 shrink-0">Giá:</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.price === 0 ? '' : formatCurrencyInput(item.price)}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                          const num = raw === '' ? 0 : parseInt(raw, 10);
                          handleUpdatePrice(item.productId, isNaN(num) ? 0 : num);
                        }}
                        className={`w-32 px-2 py-1 text-xs font-bold rounded-lg border text-right transition-colors ${
                          item.isBelowFloor
                            ? 'bg-amber-100 dark:bg-amber-950/80 border-amber-500 text-amber-950 dark:text-amber-200 ring-2 ring-amber-400/30'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                        }`}
                        title={item.floorPrice ? `Giá sàn: ${formatCurrency(item.floorPrice)}` : 'Đơn giá bán'}
                      />
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

                  {/* Warning below floor price (SCRUM-495) */}
                  {item.isBelowFloor && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/70 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        ⚠️ Giá nhập {formatCurrency(item.price)} thấp hơn giá sàn ({formatCurrency(item.floorPrice || 0)}) &bull; Đơn hàng sẽ chuyển sang <strong>Cần duyệt</strong>
                      </span>
                    </div>
                  )}

                  {/* Volume Discount Badge (S3-01 & SCRUM-491) */}
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

        {/* SECTION 3: Thanh toán & Quyết toán công nợ tại hiện trường */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 text-xs">
          {/* Cảnh báo giá sàn đơn hàng (SCRUM-495) */}
          {hasBelowFloor && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-300">
                  Cảnh báo: Có dòng sản phẩm bán dưới giá sàn quy định (SCRUM-490 & SCRUM-495)
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                  Khi tạo đơn hoặc chốt đơn, hệ thống sẽ tự động gán trạng thái <strong>"Chờ duyệt" (Pending Approval)</strong> để Quản lý kinh doanh xem xét duyệt đơn.
                </p>
              </div>
            </div>
          )}

          {/* Header Thanh toán */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Thanh Toán & Quyết Toán Công Nợ
                </h3>
                <p className="text-[11px] text-slate-500">
                  Thu tiền ngay tại chỗ hoặc ghi nợ vào hạn mức đại lý
                </p>
              </div>
            </div>
            {unpaidAmount > 0 ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Ghi nợ: {formatCurrency(unpaidAmount)}
              </span>
            ) : calculatedTotal > 0 ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ✓ Đã thu đủ 100%
              </span>
            ) : null}
          </div>

          {/* Nhắc nhở nếu chưa có mặt hàng */}
          {items.length === 0 && (
            <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-200 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  Đơn hàng hiện chưa có sản phẩm (Tổng tiền: 0 đ)
                </p>
                <p className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5 leading-relaxed">
                  Bạn đang chọn <strong>"Trả đủ 100%"</strong>. Vui lòng bấm thêm sản phẩm ở mục <strong>(2) Mặt Hàng</strong> phía trên, hệ thống sẽ tự động cập nhật tổng tiền thu ngay và kích hoạt nút chốt đơn!
                </p>
              </div>
            </div>
          )}

          {/* 3 Chế độ thanh toán (Segmented Control) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Phương thức quyết toán:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('credit');
                  setPaidAmount(0);
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  paymentMode === 'credit'
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-400/20 shadow-xs'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4 mb-1" />
                <span className="text-[11px]">Ghi nợ 100%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 font-normal">Tính vào hạn mức</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMode('full');
                  setPaidAmount(calculatedTotal);
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  paymentMode === 'full'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold ring-2 ring-emerald-400/20 shadow-xs'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                }`}
              >
                <CheckCircle className="w-4 h-4 mb-1" />
                <span className="text-[11px]">Trả đủ 100%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 font-normal">Thu tiền tại chỗ</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMode('partial');
                  if (paidAmount === 0 && calculatedTotal > 0) {
                    setPaidAmount(Math.round(calculatedTotal * 0.3));
                  }
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  paymentMode === 'partial'
                    ? 'bg-violet-50 dark:bg-violet-950/60 border-violet-500 text-violet-700 dark:text-violet-300 font-bold ring-2 ring-violet-400/20 shadow-xs'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                }`}
              >
                <Receipt className="w-4 h-4 mb-1" />
                <span className="text-[11px]">Thanh toán 1 phần</span>
                <span className="text-[9px] text-slate-400 mt-0.5 font-normal">Cọc / Trả trước</span>
              </button>
            </div>
          </div>

          {/* Khi có thanh toán tại chỗ (Full hoặc Partial) */}
          {paymentMode !== 'credit' && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
              {/* Phương thức thanh toán */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Hình thức thu tiền tại chỗ:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Tiền mặt
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      paymentMethod === 'transfer'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Chuyển khoản
                  </button>
                </div>
              </div>

              {/* Ô nhập số tiền nếu là Partial */}
              {paymentMode === 'partial' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Số tiền trả trước / đặt cọc:
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Tối đa: {formatCurrency(calculatedTotal)}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paidAmount === 0 ? '' : formatCurrencyInput(paidAmount)}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                        const val = raw === '' ? 0 : parseInt(raw, 10);
                        setPaidAmount(Math.min(calculatedTotal, Math.max(0, val)));
                      }}
                      className="w-full pl-3 pr-14 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">
                      VNĐ
                    </span>
                  </div>

                  {/* Quick percentage chips */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400">Gợi ý nhanh:</span>
                    {[0.2, 0.3, 0.5].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPaidAmount(Math.round(calculatedTotal * pct))}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                      >
                        {pct * 100}% ({formatCurrency(Math.round(calculatedTotal * pct))})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tóm tắt tiền hàng & Dòng tiền */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
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

            <div className="flex items-center justify-between text-slate-800 dark:text-slate-200 font-bold">
              <span>Tổng giá trị đơn hàng:</span>
              <span className="font-extrabold text-slate-900 dark:text-white">
                {formatCurrency(calculatedTotal)}
              </span>
            </div>

            {paidAmount > 0 && (
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" />
                  Đã thanh toán tại chỗ ({paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}):
                </span>
                <span>-{formatCurrency(paidAmount)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  Ghi nợ vào công nợ đại lý:
                </span>
                <p className="text-[10px] text-slate-400">
                  {unpaidAmount > 0
                    ? 'Khoản nợ sẽ tính vào hạn mức tín dụng'
                    : 'Đã thanh toán đủ, không tính vào hạn mức nợ'}
                </p>
              </div>
              <span className={`font-black text-sm ${
                unpaidAmount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
              }`}>
                {formatCurrency(unpaidAmount)}
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Bar Optimized for 360px Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-2.5 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Price Preview */}
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              {unpaidAmount > 0 ? 'Ghi nợ công nợ' : 'Đã thanh toán đủ'}
            </div>
            <div className="text-base font-black text-blue-600 dark:text-blue-400 leading-tight truncate">
              {formatCurrency(calculatedTotal)}
            </div>
            {paidAmount > 0 && (
              <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                Đã thu: {formatCurrency(paidAmount)} &bull; Còn nợ: {formatCurrency(unpaidAmount)}
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
              disabled={isSubmitting || isSavingDraft || items.length === 0 || Boolean(creditStatus?.isBlocked)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl text-white shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                items.length === 0
                  ? 'bg-slate-400 dark:bg-slate-700'
                  : creditStatus?.isBlocked
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                  : creditStatus?.requiresApproval
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
              }`}
              title={
                items.length === 0
                  ? 'Vui lòng thêm sản phẩm vào mục (2) Mặt Hàng để chốt đơn'
                  : creditStatus?.isBlocked
                  ? 'Bị chặn do đại lý có nợ quá hạn'
                  : creditStatus?.requiresApproval
                  ? 'Đơn vượt hạn mức - Sẽ chuyển sang Chờ duyệt'
                  : 'Chốt đơn hàng'
              }
            >
              {items.length === 0 ? (
                <>
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Chưa có sản phẩm</span>
                </>
              ) : creditStatus?.isBlocked ? (
                <>
                  <Ban className="w-3.5 h-3.5" />
                  <span>Bị chặn quá hạn</span>
                </>
              ) : creditStatus?.requiresApproval ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Đang gửi...' : 'Gửi chờ duyệt'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Đang gửi...' : 'Chốt đơn'}</span>
                </>
              )}
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
