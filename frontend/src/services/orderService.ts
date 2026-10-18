import {
  Order,
  OrderStatus,
  OrderCalculateRequest,
  OrderCalculateResponse,
  ProductSearchForOrder,
  CheckOrderAvailabilityResponse,
  LineItemAvailabilityResult
} from '../types/Order';
import { initialOrders } from '../mock/orders';
import { getStorageItem, setStorageItem } from './storage';
import { productService } from './productService';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'kv_orders';

function mapApiOrder(o: any): Order {
  return {
    id: String(o.id),
    code: o.code || '',
    customerId: o.customerId || o.customer_id || '',
    customerName: o.customerName || o.customer_name || '',
    customerPhone: o.customerPhone || o.customer_phone || '',
    customerAddress: o.customerAddress || o.customer_address || undefined,
    items: (o.items || []).map((itm: any) => ({
      productId: String(itm.productId || itm.product_id || ''),
      sku: itm.sku || '',
      name: itm.name || '',
      unit: itm.unit || 'cái',
      price: Number(itm.price || 0),
      quantity: Number(itm.quantity || 1),
      discount: Number(itm.discount || 0),
      subtotal: Number(itm.subtotal || 0),
      appliedDiscountPolicyName: itm.appliedDiscountPolicyName || itm.applied_discount_policy_name || undefined,
      discountRate: itm.discountRate || itm.discount_rate || undefined,
      discountAmount: itm.discountAmount || itm.discount_amount || undefined,
    })),
    subtotal: Number(o.subtotal || 0),
    discount: Number(o.discount || 0),
    tax: Number(o.tax || 0),
    total: Number(o.total || 0),
    paidAmount: Number(o.paidAmount ?? o.paid_amount ?? 0),
    changeAmount: Number(o.changeAmount ?? o.change_amount ?? 0),
    paymentMethod: o.paymentMethod || o.payment_method || 'cash',
    paymentStatus: o.paymentStatus || o.payment_status || 'paid',
    status: o.status || 'pending',
    staffId: String(o.staffId || o.staff_id || ''),
    staffName: o.staffName || o.staff_name || o.customerName || o.customer_name || '',
    note: o.note || undefined,
    requiresApproval: Boolean(o.requiresApproval ?? o.requires_approval ?? false),
    approvalReason: o.approvalReason || o.approval_reason || undefined,
    deliveryAddressId: o.deliveryAddressId ?? o.delivery_address_id ?? undefined,
    deliveryAddressName: o.deliveryAddressName ?? o.delivery_address_name ?? undefined,
    deliveryReceiverName: o.deliveryReceiverName ?? o.delivery_receiver_name ?? undefined,
    deliveryPhone: o.deliveryPhone ?? o.delivery_phone ?? undefined,
    deliveryAddress: o.deliveryAddress ?? o.delivery_address ?? undefined,
    deliveryNotes: o.deliveryNotes ?? o.delivery_notes ?? undefined,
    expectedDeliveryDate: o.expectedDeliveryDate || o.expected_delivery_date || undefined,
    copiedFromOrderId: o.copiedFromOrderId || o.copied_from_order_id || undefined,
    createdAt: toLocalDateTimeString(o.createdAt || o.created_at),
    updatedAt: toLocalDateTimeString(o.updatedAt || o.updated_at),
  };
}

function toLocalDateTimeString(val?: string): string {
  if (!val) return '';
  try {
    let s = val.trim();
    if (!s.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return val;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
  } catch {
    return val;
  }
}

let memoryCacheOrders: Order[] | null = null;
let lastOrdersFetchTime = 0;
const ORDERS_CACHE_TTL = 30000; // 30 giây
let activeOrdersFetchPromise: Promise<Order[]> | null = null;

export const orderService = {
  /** Lấy dữ liệu tức thì từ bộ nhớ cache RAM (0ms) khi chuyển trang qua lại */
  getCached: (): Order[] => {
    if (memoryCacheOrders && memoryCacheOrders.length > 0) {
      return memoryCacheOrders;
    }
    const cached = getStorageItem<Order[]>(STORAGE_KEY, []);
    if (cached && cached.length > 0) {
      memoryCacheOrders = cached;
      return cached;
    }
    return initialOrders;
  },

  getAll: async (forceRefresh: boolean = false): Promise<Order[]> => {
    if (!forceRefresh && memoryCacheOrders && memoryCacheOrders.length > 0 && Date.now() - lastOrdersFetchTime < ORDERS_CACHE_TTL) {
      return memoryCacheOrders;
    }

    if (activeOrdersFetchPromise && !forceRefresh) {
      return activeOrdersFetchPromise;
    }

    activeOrdersFetchPromise = (async () => {
      try {
        const res = await apiClient.get('/orders');
        if (Array.isArray(res.data) && res.data.length > 0) {
          const list = res.data.map(mapApiOrder);
          memoryCacheOrders = list;
          lastOrdersFetchTime = Date.now();
          setStorageItem(STORAGE_KEY, list);
          return list;
        }
      } catch (err) {
        console.warn('[orderService] Backend error, fallback to storage:', err);
      } finally {
        activeOrdersFetchPromise = null;
      }
      const fallback = orderService.getCached();
      lastOrdersFetchTime = Date.now();
      return fallback;
    })();

    return activeOrdersFetchPromise;
  },

  getById: async (id: string): Promise<Order | undefined> => {
    try {
      const res = await apiClient.get(`/orders/${encodeURIComponent(id)}`);
      if (res.data) {
        return mapApiOrder(res.data);
      }
    } catch {}
    const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
    return orders.find((o) => o.id === id || o.code === id);
  },

  create: async (orderData: Partial<Order> & { customerId: string; customerName: string; items: any[] }): Promise<Order> => {
    try {
      const payload = {
        customer_id: orderData.customerId,
        customer_name: orderData.customerName,
        customer_phone: orderData.customerPhone,
        customer_address: orderData.customerAddress,
        items: orderData.items.map((i: any) => ({
          product_id: i.productId || i.product_id,
          sku: i.sku,
          name: i.name,
          unit: i.unit || 'cái',
          price: i.price,
          quantity: i.quantity,
          discount: i.discount || 0,
          subtotal: i.subtotal || i.price * i.quantity,
        })),
        subtotal: orderData.subtotal,
        discount: orderData.discount,
        tax: orderData.tax || 0,
        total: orderData.total,
        paid_amount: orderData.paidAmount ?? 0,
        change_amount: orderData.changeAmount ?? 0,
        payment_method: orderData.paymentMethod || 'cash',
        payment_status: orderData.paymentStatus || 'paid',
        status: orderData.status || 'pending',
        staff_id: orderData.staffId,
        staff_name: orderData.staffName,
        note: orderData.note,
        delivery_address_id: orderData.deliveryAddressId,
        delivery_address_name: orderData.deliveryAddressName,
        delivery_receiver_name: orderData.deliveryReceiverName,
        delivery_phone: orderData.deliveryPhone,
        delivery_address: orderData.deliveryAddress,
        delivery_notes: orderData.deliveryNotes,
        expected_delivery_date: orderData.expectedDeliveryDate,
      };

      const res = await apiClient.post('/orders', payload);
      const created = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      memoryCacheOrders = [created, ...(memoryCacheOrders || orders)];
      setStorageItem(STORAGE_KEY, memoryCacheOrders);
      return created;
    } catch (err: any) {
      console.warn('[orderService] Backend error on order creation:', err);
      const errorMsg =
        err.data?.detail ||
        err.response?.data?.detail ||
        err.message ||
        (typeof err === 'string' ? err : 'Lỗi khi tạo đơn hàng');
      throw new Error(errorMsg);
    }
  },

  calculate: async (req: OrderCalculateRequest): Promise<OrderCalculateResponse> => {
    try {
      const res = await apiClient.post('/orders/calculate', req);
      return res.data;
    } catch (err: any) {
      console.warn('[orderService] Calculate API failed, calculating locally:', err);
      // Local fallback calculation
      let subtotal = 0;
      const items = req.items.map((itm) => {
        const price = itm.price || 0;
        const lineSubtotal = price * itm.quantity;
        subtotal += lineSubtotal;
        return {
          product_id: String(itm.product_id),
          name: '',
          unit: itm.unit || 'cái',
          unit_price: price,
          quantity: itm.quantity,
          discount_amount: 0,
          discount_rate: 0,
          subtotal: lineSubtotal,
        };
      });
      return {
        subtotal,
        discount: 0,
        total: subtotal,
        items,
      };
    }
  },

  getDrafts: async (): Promise<Order[]> => {
    try {
      const res = await apiClient.get('/orders/drafts');
      if (Array.isArray(res.data)) {
        return res.data.map(mapApiOrder);
      }
    } catch (err) {
      console.warn('[orderService] getDrafts API failed:', err);
    }
    const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
    return orders.filter((o) => o.status === 'draft');
  },

  searchProductsForOrder: async (query?: string, customerId?: string): Promise<ProductSearchForOrder[]> => {
    try {
      const params: Record<string, string> = {};
      if (query) params.q = query;
      if (customerId) params.customer_id = customerId;
      const res = await apiClient.get('/orders/products/search', { params });
      if (Array.isArray(res.data)) {
        return res.data;
      }
    } catch (err) {
      console.warn('[orderService] searchProductsForOrder API failed, fallback to productService:', err);
    }
    const prods = await productService.getAll();
    const qLower = (query || '').toLowerCase().trim();
    const filtered = prods.filter(
      (p) => !qLower || p.name.toLowerCase().includes(qLower) || p.sku.toLowerCase().includes(qLower)
    );
    return filtered.slice(0, 20).map((p) => {
      const available_units = [p.unit || 'cái'];
      const spec = p.packagingSpecification || p.packagingSpec;
      if (spec) {
        const specLower = spec.toLowerCase();
        for (const u of ['hộp', 'thùng', 'lon', 'gói', 'chai', 'bộ', 'cặp', 'kg', 'cái']) {
          if (specLower.includes(u) && !available_units.includes(u)) {
            available_units.push(u);
          }
        }
      } else {
        ['hộp', 'thùng'].forEach((u) => {
          if (!available_units.includes(u)) available_units.push(u);
        });
      }
      const itemPrice = p.salePrice || p.price || (p.costPrice ? Math.round(p.costPrice * 1.2) : 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: itemPrice,
        sale_price: itemPrice,
        stock: p.stock ?? 100,
        unit: p.unit || 'cái',
        packaging_spec: spec,
        available_units,
      };
    });
  },

  updateDraft: async (orderId: string, draftData: any): Promise<Order> => {
    try {
      const res = await apiClient.put(`/orders/${encodeURIComponent(orderId)}/draft`, draftData);
      const updated = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const idx = orders.findIndex((o) => o.id === orderId || o.code === orderId);
      if (idx !== -1) {
        orders[idx] = updated;
        setStorageItem(STORAGE_KEY, [...orders]);
      }
      return updated;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  submitDraft: async (orderId: string): Promise<Order> => {
    try {
      const res = await apiClient.post(`/orders/${encodeURIComponent(orderId)}/submit`);
      const submitted = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const idx = orders.findIndex((o) => o.id === orderId || o.code === orderId);
      if (idx !== -1) {
        orders[idx] = submitted;
        setStorageItem(STORAGE_KEY, [...orders]);
      }
      return submitted;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  deleteDraft: async (orderId: string): Promise<void> => {
    try {
      await apiClient.delete(`/orders/${encodeURIComponent(orderId)}/draft`);
      if (memoryCacheOrders) {
        memoryCacheOrders = memoryCacheOrders.filter(
          (o) => o.id !== orderId && o.code !== orderId
        );
      }
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const filtered = orders.filter((o) => o.id !== orderId && o.code !== orderId);
      setStorageItem(STORAGE_KEY, filtered);
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  deleteDrafts: async (orderIds: string[]): Promise<{ succeeded: string[]; failed: string[] }> => {
    const results = await Promise.allSettled(
      orderIds.map((id) => orderService.deleteDraft(id))
    );
    const succeeded: string[] = [];
    const failed: string[] = [];
    results.forEach((res, index) => {
      if (res.status === 'fulfilled') {
        succeeded.push(orderIds[index]);
      } else {
        failed.push(orderIds[index]);
      }
    });
    return { succeeded, failed };
  },


  updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
    try {
      const res = await apiClient.patch(`/orders/${encodeURIComponent(id)}/status`, { status });
      const updated = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const idx = orders.findIndex((o) => o.id === id || o.code === id);
      if (idx !== -1) {
        orders[idx] = updated;
        setStorageItem(STORAGE_KEY, [...orders]);
      }
      return updated;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  update: async (id: string, partialData: Partial<Order>): Promise<Order> => {
    try {
      const res = await apiClient.put(`/orders/${encodeURIComponent(id)}`, partialData);
      const updated = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const idx = orders.findIndex((o) => o.id === id || o.code === id);
      if (idx !== -1) {
        orders[idx] = updated;
        setStorageItem(STORAGE_KEY, [...orders]);
      }
      return updated;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  cancelOrder: async (id: string): Promise<Order> => {
    try {
      const res = await apiClient.post(`/orders/${encodeURIComponent(id)}/cancel`);
      const updated = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const idx = orders.findIndex((o) => o.id === id || o.code === id);
      if (idx !== -1) {
        orders[idx] = updated;
        setStorageItem(STORAGE_KEY, [...orders]);
      }
      return updated;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      throw err;
    }
  },

  checkAvailability: async (
    customerId: string,
    items: { productId?: string; product_id?: string; sku?: string; quantity: number }[],
    warehouseName?: string
  ): Promise<CheckOrderAvailabilityResponse> => {
    try {
      const payload = {
        customer_id: customerId,
        warehouse_name: warehouseName,
        items: items.map((itm) => ({
          product_id: itm.productId || itm.product_id,
          sku: itm.sku,
          quantity: itm.quantity,
        })),
      };
      const res = await apiClient.post('/inventory-availabilities/check', payload);
      return res.data;
    } catch (err: any) {
      console.warn('[orderService] checkAvailability API failed:', err);
      return {
        customer_id: customerId,
        warehouse_name: warehouseName || 'Kho Tổng Hà Nội',
        warehouse_code: 'WH-HANOI',
        all_items_available: true,
        items: items.map((itm) => ({
          product_id: String(itm.productId || itm.product_id || ''),
          sku: itm.sku || '',
          product_name: '',
          unit: 'cái',
          requested_quantity: itm.quantity,
          physical_stock: 999,
          reserved_stock: 0,
          available_stock: 999,
          max_orderable_quantity: 999,
          warehouse_name: warehouseName || 'Kho Tổng Hà Nội',
          warehouse_code: 'WH-HANOI',
          is_available: true,
        })),
      };
    }
  },

  getCustomerServicingWarehouse: async (
    customerId: string
  ): Promise<{ warehouse_name: string; warehouse_code: string; is_default: boolean }> => {
    try {
      const res = await apiClient.get(`/inventory-availabilities/customer-warehouse/${encodeURIComponent(customerId)}`);
      return res.data;
    } catch (err: any) {
      return {
        warehouse_name: 'Kho Tổng Hà Nội',
        warehouse_code: 'WH-HANOI',
        is_default: true,
      };
    }
  },

  copyOrder: async (id: string): Promise<{ order: Order; warnings: string[]; message?: string }> => {
    try {
      const res = await apiClient.post(`/orders/${encodeURIComponent(id)}/copy`);
      const mappedOrder = mapApiOrder(res.data.order || res.data);
      const warnings = Array.isArray(res.data.warnings) ? res.data.warnings : [];
      const message = res.data.message || 'Sao chép đơn hàng thành công sang đơn nháp mới.';

      // Lưu vào local storage cache
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      setStorageItem(STORAGE_KEY, [mappedOrder, ...orders]);

      return {
        order: mappedOrder,
        warnings,
        message,
      };
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || err?.message || 'Lỗi khi sao chép đơn hàng';
      throw new Error(errorMsg);
    }
  },
};
