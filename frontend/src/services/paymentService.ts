import { apiClient } from '../api/client';
import { Payment, PaymentCreateRequest } from '../types/Payment';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_payments';

const INITIAL_DEMO_PAYMENTS: Payment[] = [
  {
    id: 'PT-2026-0000001',
    customer_id: 'CUS-002',
    customer_name: 'Đại lý Trần Trung Hiếu',
    amount: 50000000,
    payment_method: 'BANK_TRANSFER',
    payment_date: '2026-10-15T14:00:00Z',
    collector_id: 2,
    collector_name: 'Đỗ Thị Kế Toán Trưởng',
    reference_code: 'VCB-TRANS-998822',
    notes: 'Thu nợ đợt 1 tiền mua thiết bị điện tử chuyển khoản qua Vietcombank',
    created_at: '2026-10-15T14:00:00Z',
    allocations: [
      {
        id: 1,
        payment_id: 'PT-2026-0000001',
        invoice_id: 'HD-2026-0000002',
        allocated_amount: 50000000,
        created_at: '2026-10-15T14:00:00Z',
      },
    ],
  },
];

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
};
