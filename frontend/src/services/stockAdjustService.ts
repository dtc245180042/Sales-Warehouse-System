import { apiClient } from '../api/client';
import { StockAdjustVoucher, StockAdjustRequest, StockAdjustItem } from '../types/StockAdjust';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_stock_adjustments';

const INITIAL_DEMO_ADJUSTMENTS: StockAdjustVoucher[] = [];

export const stockAdjustService = {
  getAll: async (params?: {
    type?: string;
    status?: string;
    warehouse?: string;
    search?: string;
  }): Promise<StockAdjustVoucher[]> => {
    try {
      const res = await apiClient.get('/stock-adjustments', { params });
      if (res.data && Array.isArray(res.data.items || res.data)) {
        const items = res.data.items || res.data;
        setStorageItem(STORAGE_KEY, items);
        return items;
      }
    } catch {
      // Fallback
    }

    let list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);

    if (params?.type && params.type !== 'all') {
      list = list.filter((i) => i.adjustType === params.type);
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((i) => i.status === params.status);
    }
    if (params?.warehouse && params.warehouse !== 'all') {
      list = list.filter((i) => i.warehouse.toLowerCase().includes(params.warehouse!.toLowerCase()));
    }
    if (params?.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.createdByName.toLowerCase().includes(q) ||
          i.reason.toLowerCase().includes(q)
      );
    }
    return list;
  },

  getById: async (id: string): Promise<StockAdjustVoucher | null> => {
    try {
      const res = await apiClient.get(`/stock-adjustments/${id}`);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }
    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    return list.find((i) => i.id === id || i.code === id) || null;
  },

  create: async (
    payload: StockAdjustRequest,
    user: { id?: string | number; name?: string }
  ): Promise<StockAdjustVoucher> => {
    const totalLossQty = payload.items.reduce((sum, it) => sum + Number(it.adjustQty || 0), 0);
    const totalLossValue = payload.items.reduce((sum, it) => sum + Number(it.lossValue || 0), 0);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(100 + Math.random() * 900);
    const code = `DCXK-${dateStr}-${rand}`;
    const id = `ADJ-${dateStr}-${rand}`;

    const newVoucher: StockAdjustVoucher = {
      ...payload,
      id,
      code,
      status: 'pending',
      totalLossQty,
      totalLossValue,
      createdBy: String(user.id || 'USR-001'),
      createdByName: user.name || 'Người dùng',
      createdAt: now.toISOString(),
    };

    try {
      const res = await apiClient.post('/stock-adjustments', newVoucher);
      if (res.data) {
        return res.data;
      }
    } catch {
      // Fallback
    }

    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    const updated = [newVoucher, ...list];
    setStorageItem(STORAGE_KEY, updated);
    return newVoucher;
  },

  approve: async (id: string, reviewerName: string = 'Quản lý kho'): Promise<StockAdjustVoucher> => {
    try {
      const res = await apiClient.patch(`/stock-adjustments/${id}/approve`);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    const idx = list.findIndex((i) => i.id === id || i.code === id);
    if (idx === -1) throw new Error('Không tìm thấy phiếu điều chỉnh');

    const updated = {
      ...list[idx],
      status: 'approved' as const,
      reviewedBy: 'USR-REVIEWER',
      reviewedByName: reviewerName,
      reviewedAt: new Date().toISOString(),
      rejectReason: undefined,
    };
    list[idx] = updated;
    setStorageItem(STORAGE_KEY, list);
    return updated;
  },

  reject: async (
    id: string,
    reason: string,
    reviewerName: string = 'Quản lý kho'
  ): Promise<StockAdjustVoucher> => {
    try {
      const res = await apiClient.patch(`/stock-adjustments/${id}/reject`, { reason });
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    const idx = list.findIndex((i) => i.id === id || i.code === id);
    if (idx === -1) throw new Error('Không tìm thấy phiếu điều chỉnh');

    const updated = {
      ...list[idx],
      status: 'rejected' as const,
      reviewedBy: 'USR-REVIEWER',
      reviewedByName: reviewerName,
      reviewedAt: new Date().toISOString(),
      rejectReason: reason,
    };
    list[idx] = updated;
    setStorageItem(STORAGE_KEY, list);
    return updated;
  },
};
