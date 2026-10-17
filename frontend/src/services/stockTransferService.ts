import { apiClient } from '../api/client';
import {
  StockTransfer,
  StockTransferCreatePayload,
  StockTransferShipPayload,
  StockTransferReceivePayload,
  StockTransferCancelPayload,
  InTransitSummaryItem,
  WarehouseStockItem,
} from '../types/StockTransfer';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_stock_transfers';

const INITIAL_DEMO_TRANSFERS: StockTransfer[] = [];

export const stockTransferService = {
  /**
   * Lấy danh sách phiếu chuyển kho kèm bộ lọc
   */
  getTransfers: async (params?: {
    source_warehouse?: string;
    destination_warehouse?: string;
    status?: string;
    search?: string;
    limit?: number;
  }): Promise<StockTransfer[]> => {
    try {
      const res = await apiClient.get<StockTransfer[]>('/stock-transfers', { params });
      if (Array.isArray(res.data)) {
        const normalized = res.data.map((x) => ({
          ...x,
          id: x.id.startsWith('TRF-') ? x.code : x.id,
        }));
        // Đồng bộ vào cache
        setStorageItem(STORAGE_KEY, normalized);
        return normalized;
      }
    } catch (err) {
      console.warn('[stockTransferService] API error, fallback to local storage:', err);
    }

    // Fallback local storage
    let list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS).map((x) => ({
      ...x,
      id: x.id.startsWith('TRF-') ? x.code : x.id,
    }));
    if (params) {
      if (params.source_warehouse && params.source_warehouse !== 'all' && params.source_warehouse !== 'Tất cả kho') {
        list = list.filter((x) => x.source_warehouse === params.source_warehouse);
      }
      if (params.destination_warehouse && params.destination_warehouse !== 'all' && params.destination_warehouse !== 'Tất cả kho') {
        list = list.filter((x) => x.destination_warehouse === params.destination_warehouse);
      }
      if (params.status && params.status !== 'all' && params.status !== 'Tất cả') {
        list = list.filter((x) => x.status === params.status);
      }
      if (params.search) {
        const q = params.search.toLowerCase().trim();
        list = list.filter(
          (x) =>
            x.code.toLowerCase().includes(q) ||
            x.source_warehouse.toLowerCase().includes(q) ||
            x.destination_warehouse.toLowerCase().includes(q) ||
            (x.note && x.note.toLowerCase().includes(q))
        );
      }
    }
    return list;
  },

  /**
   * Xem chi tiết 1 phiếu chuyển kho
   */
  getTransferById: async (idOrCode: string): Promise<StockTransfer> => {
    try {
      const res = await apiClient.get<StockTransfer>(`/stock-transfers/${idOrCode}`);
      if (res.data && res.data.id) {
        return {
          ...res.data,
          id: res.data.id.startsWith('TRF-') ? res.data.code : res.data.id,
        };
      }
    } catch (err) {
      console.warn('[stockTransferService] API error on getById, fallback local:', err);
    }

    const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
    const cleanQuery = idOrCode.trim();
    const pckQuery = cleanQuery.replace('TRF-', 'PCK-');
    const trfQuery = cleanQuery.replace('PCK-', 'TRF-');

    const item = list.find(
      (x) =>
        x.id === cleanQuery ||
        x.code === cleanQuery ||
        x.id === pckQuery ||
        x.code === pckQuery ||
        x.id === trfQuery ||
        x.code === trfQuery
    );
    if (item) {
      return {
        ...item,
        id: item.code || item.id,
      };
    }
    throw new Error(`Không tìm thấy phiếu chuyển kho với mã "${idOrCode}".`);
  },

  /**
   * Tạo phiếu chuyển kho mới
   */
  createTransfer: async (payload: StockTransferCreatePayload): Promise<StockTransfer> => {
    try {
      const res = await apiClient.post<StockTransfer>('/stock-transfers', payload);
      if (res.data && res.data.id) {
        const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
        setStorageItem(STORAGE_KEY, [res.data, ...list]);
        return res.data;
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message;
      throw new Error(message);
    }
    throw new Error('Không thể tạo phiếu chuyển kho');
  },

  /**
   * Xuất kho chuyển hàng (ship)
   */
  shipTransfer: async (idOrCode: string, payload?: StockTransferShipPayload): Promise<StockTransfer> => {
    try {
      const res = await apiClient.post<StockTransfer>(`/stock-transfers/${idOrCode}/ship`, payload || {});
      if (res.data && res.data.id) {
        const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
        const idx = list.findIndex((x) => x.id === res.data.id || x.code === res.data.code);
        if (idx !== -1) {
          list[idx] = res.data;
          setStorageItem(STORAGE_KEY, [...list]);
        }
        return res.data;
      }
    } catch (err: any) {
      console.warn('[stockTransferService] API error on ship, checking local fallback:', err);
      const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
      const idx = list.findIndex((x) => x.id === idOrCode || x.code === idOrCode);
      if (idx !== -1) {
        const existing = list[idx];
        const now = new Date().toISOString();
        const updated: StockTransfer = {
          ...existing,
          status: 'in_transit',
          shipped_by: payload?.shipped_by || 'Thủ kho xuất',
          shipped_at: now,
          updated_at: now,
          note: payload?.note ? (existing.note ? `${existing.note} | Xuất kho: ${payload.note}` : payload.note) : existing.note,
        };
        list[idx] = updated;
        setStorageItem(STORAGE_KEY, [...list]);
        return updated;
      }
      const message = err.response?.data?.detail || err.message;
      throw new Error(message);
    }
    throw new Error('Không thể xuất kho chuyển hàng');
  },

  /**
   * Xác nhận nhận hàng tại kho đích (receive)
   */
  receiveTransfer: async (idOrCode: string, payload: StockTransferReceivePayload): Promise<StockTransfer> => {
    try {
      const res = await apiClient.post<StockTransfer>(`/stock-transfers/${idOrCode}/receive`, payload);
      if (res.data && res.data.id) {
        const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
        const idx = list.findIndex((x) => x.id === res.data.id || x.code === res.data.code);
        if (idx !== -1) {
          list[idx] = res.data;
          setStorageItem(STORAGE_KEY, [...list]);
        }
        return res.data;
      }
    } catch (err: any) {
      console.warn('[stockTransferService] API error on receive, checking local fallback:', err);
      const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
      const idx = list.findIndex((x) => x.id === idOrCode || x.code === idOrCode);
      if (idx !== -1) {
        const existing = list[idx];
        const now = new Date().toISOString();
        let totalReceived = 0;
        let hasDiscrepancy = false;

        const updatedItems = existing.items.map((it) => {
          const rInfo = payload.items.find((r) => String(r.product_id) === String(it.product_id));
          const recQty = rInfo !== undefined && rInfo.received_quantity !== undefined ? rInfo.received_quantity : it.transfer_quantity;
          const diff = recQty - it.transfer_quantity;
          if (diff !== 0) {
            hasDiscrepancy = true;
          }
          totalReceived += recQty;
          return {
            ...it,
            received_quantity: recQty,
            discrepancy_quantity: diff,
            discrepancy_reason: rInfo?.discrepancy_reason || payload.discrepancy_reason || undefined,
          };
        });

        const updated: StockTransfer = {
          ...existing,
          status: 'completed',
          total_received_items: totalReceived,
          has_discrepancy: hasDiscrepancy,
          discrepancy_reason: payload.discrepancy_reason || existing.discrepancy_reason,
          received_by: payload.received_by || 'Thủ kho nhận',
          received_at: now,
          updated_at: now,
          note: payload.note ? (existing.note ? `${existing.note} | Nhập kho: ${payload.note}` : payload.note) : existing.note,
          items: updatedItems,
        };

        list[idx] = updated;
        setStorageItem(STORAGE_KEY, [...list]);
        return updated;
      }
      const message = err.response?.data?.detail || err.message;
      throw new Error(message);
    }
    throw new Error('Không thể xác nhận nhận hàng');
  },

  /**
   * Hủy phiếu chuyển kho
   */
  cancelTransfer: async (idOrCode: string, payload?: StockTransferCancelPayload): Promise<StockTransfer> => {
    try {
      const res = await apiClient.post<StockTransfer>(`/stock-transfers/${idOrCode}/cancel`, payload || {});
      if (res.data && res.data.id) {
        const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
        const idx = list.findIndex((x) => x.id === res.data.id || x.code === res.data.code);
        if (idx !== -1) {
          list[idx] = res.data;
          setStorageItem(STORAGE_KEY, [...list]);
        }
        return res.data;
      }
    } catch (err: any) {
      console.warn('[stockTransferService] API error on cancel, checking local fallback:', err);
      const list = getStorageItem<StockTransfer[]>(STORAGE_KEY, INITIAL_DEMO_TRANSFERS);
      const idx = list.findIndex((x) => x.id === idOrCode || x.code === idOrCode);
      if (idx !== -1) {
        const existing = list[idx];
        const now = new Date().toISOString();
        const updated: StockTransfer = {
          ...existing,
          status: 'cancelled',
          cancelled_by: 'Người dùng',
          cancelled_at: now,
          cancel_reason: payload?.cancel_reason || 'Đã hủy phiếu',
          updated_at: now,
        };
        list[idx] = updated;
        setStorageItem(STORAGE_KEY, [...list]);
        return updated;
      }
      const message = err.response?.data?.detail || err.message;
      throw new Error(message);
    }
    throw new Error('Không thể hủy phiếu chuyển kho');
  },

  /**
   * Lấy thống kê hàng đang trên đường (in-transit)
   */
  getInTransitSummary: async (warehouse?: string): Promise<InTransitSummaryItem[]> => {
    try {
      const res = await apiClient.get<InTransitSummaryItem[]>('/stock-transfers/in-transit-summary', {
        params: { warehouse },
      });
      if (Array.isArray(res.data)) {
        return res.data;
      }
    } catch (err) {
      console.warn('[stockTransferService] Error loading in-transit summary:', err);
    }
    return [];
  },

  /**
   * Lấy danh sách tồn kho theo từng kho
   */
  getWarehouseStocks: async (warehouse?: string): Promise<WarehouseStockItem[]> => {
    try {
      const res = await apiClient.get<WarehouseStockItem[]>('/stock-transfers/warehouse-stocks', {
        params: { warehouse },
      });
      if (Array.isArray(res.data)) {
        return res.data;
      }
    } catch (err) {
      console.warn('[stockTransferService] Error loading warehouse stocks:', err);
    }
    return [];
  },
};
