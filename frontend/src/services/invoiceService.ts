import { apiClient } from '../api/client';
import { Invoice, InvoiceCreateRequest } from '../types/Invoice';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_invoices';

const INITIAL_DEMO_INVOICES: Invoice[] = [];

export const invoiceService = {
  getInvoices: async (params?: {
    customer_id?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<Invoice[]> => {
    try {
      const res = await apiClient.get<Invoice[]>('/invoices', { params });
      if (Array.isArray(res.data)) {
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[invoiceService] Fallback to demo invoices:', err);
    }
    const all = getStorageItem<Invoice[]>(STORAGE_KEY, INITIAL_DEMO_INVOICES);
    if (!params?.status) return all;
    return all.filter((i) => i.status === params.status);
  },

  getInvoiceById: async (id: string): Promise<Invoice> => {
    try {
      const res = await apiClient.get<Invoice>(`/invoices/${id}`);
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[invoiceService] Fallback getInvoiceById:', err);
    }
    const all = getStorageItem<Invoice[]>(STORAGE_KEY, INITIAL_DEMO_INVOICES);
    const found = all.find((i) => i.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy hóa đơn với mã ${id}`);
  },

  createInvoice: async (payload: InvoiceCreateRequest): Promise<Invoice> => {
    try {
      const res = await apiClient.post<Invoice>('/invoices', payload);
      if (res.data) {
        const all = getStorageItem<Invoice[]>(STORAGE_KEY, INITIAL_DEMO_INVOICES);
        setStorageItem(STORAGE_KEY, [res.data, ...all]);
        return res.data;
      }
    } catch (err: any) {
      throw new Error(err?.response?.data?.detail || err?.message || 'Lỗi khi phát hành hóa đơn');
    }
    throw new Error('Không thể kết nối máy chủ để phát hành hóa đơn');
  },
};
