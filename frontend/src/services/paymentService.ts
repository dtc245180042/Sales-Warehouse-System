import { apiClient } from '../api/client';
import { Payment, PaymentCreateRequest } from '../types/Payment';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_payments';

const INITIAL_DEMO_PAYMENTS: Payment[] = [];

export const paymentService = {
  getPayments: async (params?: {
    customer_id?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<Payment[]> => {
    try {
      const res = await apiClient.get<Payment[]>('/payments', { params });
      if (Array.isArray(res.data)) {
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[paymentService] Fallback to demo payments:', err);
    }
    return getStorageItem<Payment[]>(STORAGE_KEY, INITIAL_DEMO_PAYMENTS);
  },

  getPaymentById: async (id: string): Promise<Payment> => {
    try {
      const res = await apiClient.get<Payment>(`/payments/${id}`);
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[paymentService] Fallback getPaymentById:', err);
    }
    const all = getStorageItem<Payment[]>(STORAGE_KEY, INITIAL_DEMO_PAYMENTS);
    const found = all.find((p) => p.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy phiếu thu với mã ${id}`);
  },

  createPayment: async (payload: PaymentCreateRequest): Promise<Payment> => {
    try {
      const res = await apiClient.post<Payment>('/payments', payload);
      if (res.data) {
        const all = getStorageItem<Payment[]>(STORAGE_KEY, INITIAL_DEMO_PAYMENTS);
        setStorageItem(STORAGE_KEY, [res.data, ...all]);
        return res.data;
      }
    } catch (err: any) {
      throw new Error(err?.response?.data?.detail || err?.message || 'Lỗi khi ghi nhận thanh toán');
    }
    throw new Error('Không thể kết nối máy chủ để ghi nhận thanh toán');
  },

  /**
   * Lấy trang HTML in ấn Phiếu thu tiền chuẩn A4 hoàn chỉnh từ Backend (SCRUM-270)
   */
  getPrintHtml: async (paymentId: string): Promise<string> => {
    const response = await apiClient.get<string>(`/payments/${paymentId}/print-html`, {
      responseType: 'text',
    });
    return response.data;
  },

  /**
   * Lấy cấu trúc JSON chi tiết in ấn phiếu thu tiền
   */
  getPrintData: async (paymentId: string): Promise<any> => {
    const response = await apiClient.get<any>(`/payments/${paymentId}/print`);
    return response.data;
  },
};
