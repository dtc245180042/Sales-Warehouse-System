import {
  Order,
  OrderStatus,
  OrderCalculateRequest,
  OrderCalculateResponse,
  ProductSearchForOrder
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
    staffName: o.staffName || o.staff_name || '',
    note: o.note || undefined,
    deliveryAddressId: o.deliveryAddressId ?? o.delivery_address_id ?? undefined,
    deliveryAddressName: o.deliveryAddressName ?? o.delivery_address_name ?? undefined,
    deliveryReceiverName: o.deliveryReceiverName ?? o.delivery_receiver_name ?? undefined,
    deliveryPhone: o.deliveryPhone ?? o.delivery_phone ?? undefined,
    deliveryAddress: o.deliveryAddress ?? o.delivery_address ?? undefined,
    deliveryNotes: o.deliveryNotes ?? o.delivery_notes ?? undefined,
    expectedDeliveryDate: o.expectedDeliveryDate || o.expected_delivery_date || undefined,
    copiedFromOrderId: o.copiedFromOrderId || o.copied_from_order_id || undefined,
    createdAt: o.createdAt || (o.created_at ? o.created_at.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16)),
    updatedAt: o.updatedAt || (o.updated_at ? o.updated_at.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16)),
  };
}

export const orderService = {
  getAll: async (): Promise<Order[]> => {
    try {
      const res = await apiClient.get('/orders');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiOrder);
        setStorageItem(STORAGE_KEY, list);
        return list;
      }
    } catch (err) {
      console.warn('[orderService] Backend error, fallback to storage:', err);
    }
    return getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
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
        items: orderData.items.map((i) => ({
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
      setStorageItem(STORAGE_KEY, [created, ...orders]);
      return created;
    } catch (err: any) {
      console.warn('[orderService] Backend error, creating locally:', err);
      // Nếu có thông điệp lỗi cụ thể từ API (vd: 400 Bad Request), ném lỗi để UI hiển thị thông báo
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail);
      }
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const newCode = `DH-2026-${String(orders.length + 1).padStart(3, '0')}`;
      const now = new Date();
      const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const newOrder: Order = {
        id: `ORD-${String(orders.length + 1).padStart(3, '0')}`,
        code: newCode,
        customerId: orderData.customerId,
        customerName: orderData.customerName,
        customerPhone: orderData.customerPhone || '',
        customerAddress: orderData.customerAddress,
        items: orderData.items,
        subtotal: orderData.subtotal || 0,
        discount: orderData.discount || 0,
        tax: orderData.tax || 0,
        total: orderData.total || 0,
        paidAmount: orderData.paidAmount || 0,
        changeAmount: orderData.changeAmount || 0,
        paymentMethod: orderData.paymentMethod || 'cash',
        paymentStatus: orderData.paymentStatus || 'paid',
        status: orderData.status || 'pending',
        staffId: orderData.staffId || 'NV-001',
        staffName: orderData.staffName || 'Nhân viên kinh doanh',
        note: orderData.note,
        deliveryAddressId: orderData.deliveryAddressId,
        deliveryAddressName: orderData.deliveryAddressName,
        deliveryReceiverName: orderData.deliveryReceiverName,
        deliveryPhone: orderData.deliveryPhone,
        deliveryAddress: orderData.deliveryAddress,
        deliveryNotes: orderData.deliveryNotes,
        expectedDeliveryDate: orderData.expectedDeliveryDate,
        createdAt: dateFormatted,
        updatedAt: dateFormatted,
      };

      if (newOrder.status !== 'draft') {
        for (const item of newOrder.items) {
          try {
            await productService.updateStock(item.productId, -item.quantity);
          } catch (e) {
            console.warn(e);
          }
        }
      }

      setStorageItem(STORAGE_KEY, [newOrder, ...orders]);
      return newOrder;
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

  searchProductsForOrder: async (query?: string): Promise<ProductSearchForOrder[]> => {
    try {
      const res = await apiClient.get('/orders/products/search', {
        params: query ? { q: query } : {},
      });
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
      if (p.packagingSpec) {
        const specLower = p.packagingSpec.toLowerCase();
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
      return {
        id: typeof p.id === 'number' ? p.id : parseInt(p.id, 10) || 1,
        sku: p.sku,
        name: p.name,
        price: p.salePrice || p.price || 0,
        sale_price: p.salePrice || p.price || 0,
        stock: p.stock ?? 100,
        unit: p.unit || 'cái',
        packaging_spec: p.packagingSpec,
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
    } catch (err) {
      console.warn('[orderService] Backend error, updating locally:', err);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const index = orders.findIndex((o) => o.id === id || o.code === id);
      if (index === -1) throw new Error('Không tìm thấy đơn hàng');

      const updated = {
        ...orders[index],
        status,
        updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      };
      orders[index] = updated;
      setStorageItem(STORAGE_KEY, [...orders]);
      return updated;
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
    } catch (err) {
      console.warn('[orderService] Backend error, updating order locally:', err);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const index = orders.findIndex((o) => o.id === id || o.code === id);
      if (index === -1) throw new Error('Không tìm thấy đơn hàng');

      const updated = {
        ...orders[index],
        ...partialData,
        updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      };
      orders[index] = updated;
      setStorageItem(STORAGE_KEY, [...orders]);
      return updated;
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
    } catch (err) {
      console.warn('[orderService] Backend error, cancelling locally:', err);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const index = orders.findIndex((o) => o.id === id || o.code === id);
      if (index === -1) throw new Error('Không tìm thấy đơn hàng');

      if (orders[index].status !== 'cancelled') {
        for (const item of orders[index].items) {
          try {
            await productService.updateStock(item.productId, item.quantity);
          } catch (e) {
            console.warn(e);
          }
        }
      }

      orders[index].status = 'cancelled';
      orders[index].updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
      setStorageItem(STORAGE_KEY, [...orders]);
      return orders[index];
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
