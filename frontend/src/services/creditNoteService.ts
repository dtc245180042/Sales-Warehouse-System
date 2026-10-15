import { apiClient } from '../api/client';
import { CreditNote, CreditNoteCreateRequest } from '../types/CreditNote';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_credit_notes';

const INITIAL_DEMO_CREDIT_NOTES: CreditNote[] = [
  {
    id: 'CN-2026-0000001',
    client_request_id: 'REQ-CN-20261016-001',
    return_order_id: 'TH-2026-0000001',
    invoice_id: 'HD-2026-0000001',
    customer_id: 'CUST-001',
    customer_name: 'Đại lý Dược Phẩm Hà Nội',
    adjustment_amount: 297000,
    adjustment_date: '2026-10-16T10:00:00Z',
    created_by: 2,
    created_by_name: 'Đỗ Thị Kế Toán Trưởng',
    notes: 'Giảm trừ nợ hàng trả do lỗi kỹ thuật theo thỏa thuận',
    created_at: '2026-10-16T10:00:00Z',
    items: [
      {
        id: 1,
        credit_note_id: 'CN-2026-0000001',
        return_order_item_id: 1,
        product_id: 'PROD-01',
        sku: 'SKU-01',
        product_name: 'Thuốc Kháng Sinh Amox 500',
        unit: 'hộp',
        quantity: 3,
        unit_price: 100000,
        discount_amount: 30000,
        vat_amount: 27000,
        subtotal: 297000,
      },
    ],
  },
];

export const creditNoteService = {
  /**
   * Lấy danh sách chứng từ giảm nợ (GET /credit-notes)
   */
  getCreditNotes: async (params?: {
    customer_id?: string;
    invoice_id?: string;
    return_order_id?: string;
    from_date?: string;
    to_date?: string;
    skip?: number;
    limit?: number;
  }): Promise<CreditNote[]> => {
    try {
      const res = await apiClient.get<CreditNote[]>('/credit-notes', { params });
      if (Array.isArray(res.data)) {
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[creditNoteService] Fallback to local storage:', err);
    }
    return getStorageItem<CreditNote[]>(STORAGE_KEY, INITIAL_DEMO_CREDIT_NOTES);
  },

  /**
   * Xem chi tiết chứng từ giảm nợ (GET /credit-notes/{id})
   */
  getCreditNoteById: async (id: string): Promise<CreditNote> => {
    try {
      const res = await apiClient.get<CreditNote>(`/credit-notes/${id}`);
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[creditNoteService] Fallback to local storage for id:', id, err);
    }
    const local = getStorageItem<CreditNote[]>(STORAGE_KEY, INITIAL_DEMO_CREDIT_NOTES);
    const found = local.find((c) => c.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy chứng từ giảm nợ với mã ${id}`);
  },

  /**
   * Lập chứng từ điều chỉnh giảm trừ công nợ (POST /credit-notes)
   */
  createCreditNote: async (payload: CreditNoteCreateRequest): Promise<CreditNote> => {
    try {
      const res = await apiClient.post<CreditNote>('/credit-notes', payload);
      if (res.data) {
        const local = getStorageItem<CreditNote[]>(STORAGE_KEY, INITIAL_DEMO_CREDIT_NOTES);
        setStorageItem(STORAGE_KEY, [res.data, ...local.filter((c) => c.id !== res.data.id)]);
        return res.data;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Lỗi khi lập chứng từ giảm nợ';
      throw new Error(msg);
    }
    throw new Error('Không thể kết nối máy chủ để lập chứng từ giảm nợ');
  },
};
