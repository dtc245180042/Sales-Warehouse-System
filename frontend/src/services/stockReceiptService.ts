import { apiClient } from '../api/client';
import {
  SupplierStockReceipt,
  SupplierStockReceiptCreatePayload,
  StockReceiptAdjustmentPayload,
} from '../types/StockReceipt';

export const stockReceiptService = {
  getAll: async (params?: {
    page?: number;
    size?: number;
    limit?: number;
    status?: string;
    supplier_id?: string | number;
    warehouse_id?: number;
    search?: string;
  }): Promise<{
    items: SupplierStockReceipt[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
  }> => {
    const queryParams: Record<string, any> = { ...params };
    if (params?.limit && !params.size) {
      queryParams.size = params.limit;
    }
    const res = await apiClient.get('/stock-receipts', { params: queryParams });
    return res.data;
  },

  getById: async (id: number): Promise<SupplierStockReceipt> => {
    const res = await apiClient.get<SupplierStockReceipt>(`/stock-receipts/${id}`);
    return res.data;
  },

  create: async (
    payload: SupplierStockReceiptCreatePayload
  ): Promise<SupplierStockReceipt> => {
    const res = await apiClient.post<SupplierStockReceipt>('/stock-receipts', payload);
    return res.data;
  },

  confirm: async (id: number): Promise<SupplierStockReceipt> => {
    const res = await apiClient.post<SupplierStockReceipt>(`/stock-receipts/${id}/confirm`);
    return res.data;
  },

  cancel: async (id: number, reason?: string): Promise<SupplierStockReceipt> => {
    const res = await apiClient.post<SupplierStockReceipt>(`/stock-receipts/${id}/cancel`, null, {
      params: reason ? { reason } : undefined,
    });
    return res.data;
  },

  createAdjustment: async (
    id: number,
    payload: StockReceiptAdjustmentPayload
  ): Promise<SupplierStockReceipt> => {
    const res = await apiClient.post<SupplierStockReceipt>(
      `/stock-receipts/${id}/adjustment`,
      payload
    );
    return res.data;
  },
};
