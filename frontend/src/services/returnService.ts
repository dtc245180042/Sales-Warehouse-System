import { apiClient } from '../api/client';
import {
  ReturnOrder,
  ReturnOrderCreateRequest,
  ReturnConfirmRequest,
  ReturnCancelRequest,
} from '../types/ReturnOrder';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_return_orders';

const INITIAL_DEMO_RETURNS: ReturnOrder[] = [];

export const returnService = {
  /**
   * Lấy danh sách phiếu trả hàng (API /returns)
   */
  getReturns: async (params?: {
    customer_id?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
    skip?: number;
    limit?: number;
  }): Promise<ReturnOrder[]> => {
    try {
      const res = await apiClient.get<ReturnOrder[]>('/returns', { params });
      if (Array.isArray(res.data)) {
        // Cập nhật storage làm cache dự phòng
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[returnService] Không kết nối được Backend, sử dụng cache cục bộ:', err);
    }
    const local = getStorageItem<ReturnOrder[]>(STORAGE_KEY, INITIAL_DEMO_RETURNS);
    if (!params?.status) return local;
    return local.filter((r) => r.status === params.status);
  },

  /**
   * Xem chi tiết phiếu trả hàng
   */
  getReturnById: async (id: string): Promise<ReturnOrder> => {
    try {
      const res = await apiClient.get<ReturnOrder>(`/returns/${id}`);
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[returnService] getReturnById fallback:', err);
    }
    const local = getStorageItem<ReturnOrder[]>(STORAGE_KEY, INITIAL_DEMO_RETURNS);
    const found = local.find((r) => r.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy phiếu trả hàng với mã ${id}`);
  },

  /**
   * Tạo yêu cầu trả hàng từ đại lý (POST /returns)
   */
  createReturnRequest: async (payload: ReturnOrderCreateRequest): Promise<ReturnOrder> => {
    try {
      const res = await apiClient.post<ReturnOrder>('/returns', payload);
      if (res.data) {
        const local = getStorageItem<ReturnOrder[]>(STORAGE_KEY, INITIAL_DEMO_RETURNS);
        setStorageItem(STORAGE_KEY, [res.data, ...local.filter((r) => r.id !== res.data.id)]);
        return res.data;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Lỗi khi tạo yêu cầu trả hàng';
      throw new Error(msg);
    }
    throw new Error('Không thể kết nối máy chủ để tạo phiếu trả hàng');
  },

  /**
   * Quản lý kho xác nhận nhận hàng vào kho (POST /returns/{id}/confirm)
   */
  confirmReturn: async (id: string, notes?: string): Promise<ReturnOrder> => {
    try {
      const res = await apiClient.post<ReturnOrder>(`/returns/${id}/confirm`, { notes });
      if (res.data) {
        const local = getStorageItem<ReturnOrder[]>(STORAGE_KEY, INITIAL_DEMO_RETURNS);
        const updated = local.map((r) => (r.id === id ? res.data : r));
        setStorageItem(STORAGE_KEY, updated);
        return res.data;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Lỗi khi xác nhận nhận hàng';
      throw new Error(msg);
    }
    throw new Error('Không thể kết nối máy chủ để xác nhận nhập kho');
  },

  /**
   * Hủy yêu cầu trả hàng (POST /returns/{id}/cancel)
   */
  cancelReturn: async (id: string, cancel_reason: string): Promise<ReturnOrder> => {
    try {
      const res = await apiClient.post<ReturnOrder>(`/returns/${id}/cancel`, { cancel_reason });
      if (res.data) {
        const local = getStorageItem<ReturnOrder[]>(STORAGE_KEY, INITIAL_DEMO_RETURNS);
        const updated = local.map((r) => (r.id === id ? res.data : r));
        setStorageItem(STORAGE_KEY, updated);
        return res.data;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Lỗi khi hủy yêu cầu trả hàng';
      throw new Error(msg);
    }
    throw new Error('Không thể kết nối máy chủ để hủy yêu cầu trả hàng');
  },
};
