import { apiClient } from '../api/client';
import {
  StockBalanceListResponse,
  StockLedgerEntryListResponse,
  ProductStockCardResponse,
} from '../types/StockLedger';

import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY_BALANCES = 'kv_stock_balances';
let memoryCacheBalances: StockBalanceListResponse | null = null;

export const stockLedgerService = {
  getCachedBalances: (): StockBalanceListResponse | null => {
    if (memoryCacheBalances && memoryCacheBalances.items && memoryCacheBalances.items.length > 0) {
      return memoryCacheBalances;
    }
    const stored = getStorageItem<StockBalanceListResponse | null>(STORAGE_KEY_BALANCES, null);
    if (stored && stored.items && stored.items.length > 0) {
      memoryCacheBalances = stored;
      return stored;
    }
    return null;
  },

  getBalances: async (params?: {
    page?: number;
    size?: number;
    warehouse_id?: number;
    category_id?: number;
    stock_status?: string;
    search?: string;
  }): Promise<StockBalanceListResponse> => {
    try {
      const res = await apiClient.get<StockBalanceListResponse>('/stock-ledger/balances', {
        params,
      });
      if (res.data) {
        memoryCacheBalances = res.data;
        setStorageItem(STORAGE_KEY_BALANCES, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[stockLedgerService] Lỗi kết nối backend balances:', err);
    }
    const fallback = stockLedgerService.getCachedBalances();
    if (fallback) return fallback;
    return { items: [], total: 0, page: 1, size: 20, total_pages: 1 };
  },

  getEntries: async (params?: {
    page?: number;
    size?: number;
    warehouse_id?: number;
    product_id?: string;
    movement_type?: string;
    reference_code?: string;
    search?: string;
  }): Promise<StockLedgerEntryListResponse> => {
    const res = await apiClient.get<StockLedgerEntryListResponse>('/stock-ledger/entries', {
      params,
    });
    return res.data;
  },

  getProductStockCard: async (
    productId: string,
    warehouseId?: number,
    page: number = 1
  ): Promise<ProductStockCardResponse> => {
    const res = await apiClient.get<ProductStockCardResponse>(
      `/stock-ledger/products/${encodeURIComponent(productId)}/card`,
      {
        params: {
          warehouse_id: warehouseId,
          page,
        },
      }
    );
    return res.data;
  },

  getDrift: async (): Promise<{
    checked_at: string;
    total_drifted_skus: number;
    items: any[];
  }> => {
    const res = await apiClient.get('/stock-ledger/drift');
    return res.data;
  },
};
