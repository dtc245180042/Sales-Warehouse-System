import { Order, OrderStatus } from '../types/Order';
import { initialOrders } from '../mock/orders';
import { getStorageItem, setStorageItem } from './storage';
import { productService } from './productService';

const STORAGE_KEY = 'kv_orders';

export const orderService = {
  getAll: async (): Promise<Order[]> => {
    await new Promise((r) => setTimeout(r, 200));
    return getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
  },

  getById: async (id: string): Promise<Order | undefined> => {
    await new Promise((r) => setTimeout(r, 150));
    const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
    return orders.find((o) => o.id === id || o.code === id);
  },

  create: async (orderData: Omit<Order, 'id' | 'code' | 'createdAt' | 'updatedAt'>): Promise<Order> => {
    await new Promise((r) => setTimeout(r, 300));
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

    // Deduct stock for each item sold
    for (const item of newOrder.items) {
      try {
        await productService.updateStock(item.productId, -item.quantity);
      } catch (err) {
        console.warn(`Could not update stock for product ${item.productId}`, err);
      }
    }

    const updated = [newOrder, ...orders];
    setStorageItem(STORAGE_KEY, updated);
    return newOrder;
  },

  updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
    await new Promise((r) => setTimeout(r, 200));
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
  },

  cancelOrder: async (id: string): Promise<Order> => {
    await new Promise((r) => setTimeout(r, 200));
    const orders = getStorageItem<Order[]>(STORAGE_KEY, initialOrders);
    const index = orders.findIndex((o) => o.id === id || o.code === id);
    if (index === -1) throw new Error('Không tìm thấy đơn hàng');

    // Refund stock if order cancelled
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
};
