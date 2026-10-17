import { apiClient } from '../api/client';
import { StockDispatch, BackorderItem } from '../types/StockDispatch';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_stock_dispatches';

const INITIAL_DEMO_DISPATCHES: StockDispatch[] = [];

export const dispatchService = {
  getDispatches: async (params?: {
    customer_id?: string;
    warehouse_id?: number;
    status?: string;
  }): Promise<StockDispatch[]> => {
    try {
      const res = await apiClient.get<StockDispatch[]>('/dispatches', { params });
      if (Array.isArray(res.data)) {
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[dispatchService] Fallback to demo dispatches:', err);
    }
    return getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
  },

  getDispatchById: async (id: string): Promise<StockDispatch> => {
    try {
      const res = await apiClient.get<StockDispatch>(`/dispatches/${id}`);
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[dispatchService] Fallback getDispatchById:', err);
    }
    const all = getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
    const found = all.find((d) => d.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy phiếu xuất kho với mã ${id}`);
  },

  confirmDispatch: async (id: string, notes?: string): Promise<StockDispatch> => {
    try {
      const res = await apiClient.post<StockDispatch>(`/dispatches/${id}/confirm`, { notes });
      if (res.data) {
        const all = getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
        const updated = all.map((d) => (d.id === id ? res.data : d));
        setStorageItem(STORAGE_KEY, updated);
        return res.data;
      }
    } catch (err: any) {
      throw new Error(err?.response?.data?.detail || err?.message || 'Lỗi khi xác nhận xuất kho');
    }
    throw new Error('Không thể kết nối máy chủ để xác nhận xuất kho');
  },

  getBackorders: async (): Promise<BackorderItem[]> => {
    try {
      const res = await apiClient.get<BackorderItem[]>('/dispatches/backorders');
      if (Array.isArray(res.data)) return res.data;
    } catch (err) {
      console.warn('[dispatchService] Fallback backorders:', err);
    }
    const all = getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
    const backorders: BackorderItem[] = [];
    all.forEach((d) => {
      d.items.forEach((item) => {
        if (item.shortfall_quantity > 0) {
          backorders.push({
            id: item.id || 0,
            dispatch_id: d.id,
            order_id: d.order_id,
            customer_id: d.customer_id,
            customer_name: d.customer_name,
            product_id: item.product_id,
            sku: item.sku,
            product_name: item.product_name,
            unit: item.unit,
            ordered_quantity: item.ordered_quantity,
            dispatched_quantity: item.dispatched_quantity,
            shortfall_quantity: item.shortfall_quantity,
            warehouse_id: d.warehouse_id,
            warehouse_name: d.warehouse_name,
            status: 'PENDING_RESTOCK',
            created_at: d.created_at,
          });
        }
      });
    });
    return backorders;
  },
};
