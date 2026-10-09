import { Order, OrderStatus } from '../types/Order';
import { initialOrders } from '../mock/orders';
import { getStorageItem, setStorageItem } from './storage';
import { productService } from './productService';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'kv_orders';

function mapApiOrder(o: any): Order {
  return {
    id: o.id,
    code: o.code || '',
    customerId: o.customerId || o.customer_id || '',
    customerName: o.customerName || o.customer_name || '',
    customerPhone: o.customerPhone || o.customer_phone || '',
    customerAddress: o.customerAddress || o.customer_address || undefined,
    items: (o.items || []).map((itm: any) => ({
      productId: itm.productId || itm.product_id || '',
      sku: itm.sku || '',
      name: itm.name || '',
      price: Number(itm.price || 0),
      quantity: Number(itm.quantity || 1),
      discount: Number(itm.discount || 0),
      subtotal: Number(itm.subtotal || 0),
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
    staffId: o.staffId || o.staff_id || '',
    staffName: o.staffName || o.staff_name || '',
    note: o.note || undefined,
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

  create: async (orderData: Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt'>): Promise<Order> => {
    try {
      const payload = {
        customer_id: orderData.customerId,
        customer_name: orderData.customerName,
        customer_phone: orderData.customerPhone,
        customer_address: orderData.customerAddress,
        items: orderData.items.map((i) => ({
          product_id: i.productId,
          sku: i.sku,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          discount: i.discount,
          subtotal: i.subtotal,
        })),
        subtotal: orderData.subtotal,
        discount: orderData.discount,
        tax: orderData.tax,
        total: orderData.total,
        paid_amount: orderData.paidAmount,
        change_amount: orderData.changeAmount,
        payment_method: orderData.paymentMethod,
        payment_status: orderData.paymentStatus,
        status: orderData.status,
        staff_id: orderData.staffId,
        staff_name: orderData.staffName,
        note: orderData.note,
      };

      const res = await apiClient.post('/orders', payload);
      const created = mapApiOrder(res.data);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      setStorageItem(STORAGE_KEY, [created, ...orders]);
      return created;
    } catch (err) {
      console.warn('[orderService] Backend error, creating locally:', err);
      const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
      const newCode = `DH-2026-${String(orders.length + 1).padStart(3, '0')}`;
      const now = new Date();
      const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const newOrder: Order = {
        ...orderData,
        id: `ORD-${String(orders.length + 1).padStart(3, '0')}`,
        code: newCode,
        createdAt: dateFormatted,
        updatedAt: dateFormatted,
      };

      for (const item of newOrder.items) {
        try {
          await productService.updateStock(item.productId, -item.quantity);
        } catch (e) {
          console.warn(e);
        }
      }

      setStorageItem(STORAGE_KEY, [newOrder, ...orders]);
      return newOrder;
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
  }
};
