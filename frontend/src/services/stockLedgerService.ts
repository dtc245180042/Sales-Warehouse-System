import { apiClient } from '../api/client';
import {
  StockBalanceListResponse,
  StockLedgerEntryListResponse,
  ProductStockCardResponse,
} from '../types/StockLedger';

export const stockLedgerService = {
  getBalances: async (params?: {
    page?: number;
    size?: number;
    warehouse_id?: number;
    category_id?: number;
    stock_status?: string;
    search?: string;
  }): Promise<StockBalanceListResponse> => {
    const res = await apiClient.get<StockBalanceListResponse>('/stock-ledger/balances', {
      params,
    });
    return res.data;
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
