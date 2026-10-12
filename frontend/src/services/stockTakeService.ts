import { apiClient } from '../api/client';
import {
  StockTake,
  StockTakeCreateRequest,
  StockTakeCountUpdateRequest,
  StockTakeConfirmRequest,
  StockTakeCancelRequest,
  StockTakePreviewItem,
} from '../types/StockTake';

export const stockTakeService = {
  /** Lấy danh sách phiếu kiểm kê kho */
  getStockTakes: async (params?: {
    status?: string;
    warehouse?: string;
    search?: string;
    skip?: number;
    limit?: number;
  }): Promise<StockTake[]> => {
    const res = await apiClient.get<StockTake[]>('/stock-takes', { params });
    return res.data;
  },

  /** Lấy chi tiết một phiếu kiểm kê */
  getStockTakeById: async (id: string): Promise<StockTake> => {
    const res = await apiClient.get<StockTake>(`/stock-takes/${id}`);
    return res.data;
  },

  /** Xem trước danh sách sản phẩm và tồn sổ tại thời điểm hiện tại */
  getProductsPreview: async (params?: {
    warehouse?: string;
    scope_type?: string;
    category_id?: number;
  }): Promise<StockTakePreviewItem[]> => {
    const res = await apiClient.get<StockTakePreviewItem[]>('/stock-takes/products-preview', { params });
    return res.data;
  },

  /** Lập phiếu kiểm kê mới (chốt snapshot tồn sổ) */
  createStockTake: async (data: StockTakeCreateRequest): Promise<StockTake> => {
    const res = await apiClient.post<StockTake>('/stock-takes', data);
    return res.data;
  },

  /** Nhập số đếm thực tế và cập nhật chênh lệch */
  updateCountedItems: async (id: string, data: StockTakeCountUpdateRequest): Promise<StockTake> => {
    const res = await apiClient.put<StockTake>(`/stock-takes/${id}/items`, data);
    return res.data;
  },

  /** Chốt phiếu kiểm kê và cân bằng tồn kho (chỉ Quản lý kho / Admin) */
  confirmStockTake: async (id: string, data: StockTakeConfirmRequest): Promise<StockTake> => {
    const res = await apiClient.post<StockTake>(`/stock-takes/${id}/confirm`, data);
    return res.data;
  },

  /** Hủy phiếu kiểm kê khi chưa hoàn tất */
  cancelStockTake: async (id: string, data: StockTakeCancelRequest): Promise<StockTake> => {
    const res = await apiClient.post<StockTake>(`/stock-takes/${id}/cancel`, data);
    return res.data;
  },
};
