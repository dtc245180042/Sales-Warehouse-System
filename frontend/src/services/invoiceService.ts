import { apiClient } from '../api/client';
import { Invoice, InvoiceCreateRequest } from '../types/Invoice';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_invoices';

const INITIAL_DEMO_INVOICES: Invoice[] = [
  {
    id: 'HD-2026-0000001',
    customer_id: 'CUS-001',
    customer_name: 'Đại lý Dương Quang Trung',
    customer_address: '128 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM',
    customer_tax_code: '0101010101',
    subtotal_amount: 269900000,
    discount_amount: 10000000,
    vat_amount: 25990000,
    total_amount: 285890000,
    paid_amount: 0,
    remaining_amount: 285890000,
    status: 'UNPAID',
    issued_at: '2026-10-15T08:00:00Z',
    due_date: '2026-11-15T08:00:00Z',
    issued_by: 2,
    issued_by_name: 'Đỗ Thị Kế Toán Trưởng',
    notes: 'Hóa đơn phát hành từ phiếu xuất PXK-2026-0000001 (10 chiếc iPhone 15 Pro Max)',
    created_at: '2026-10-15T08:00:00Z',
    items: [
      {
        id: 101,
        invoice_id: 'HD-2026-0000001',
        dispatch_id: 'PXK-2026-0000001',
        dispatch_item_id: 201,
        product_id: 'PRD-001',
        sku: 'IP15PM-256-TI',
        product_name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
        unit: 'Chiếc',
        quantity: 10,
        unit_price: 26990000,
        discount_amount: 10000000,
        vat_amount: 25990000,
        subtotal: 285890000,
      },
    ],
  },
  {
    id: 'HD-2026-0000002',
    customer_id: 'CUS-002',
    customer_name: 'Đại lý Trần Trung Hiếu',
    customer_address: '45 Phố Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
    customer_tax_code: '0202020202',
    subtotal_amount: 119850000,
    discount_amount: 0,
    vat_amount: 11985000,
    total_amount: 131835000,
    paid_amount: 50000000,
    remaining_amount: 81835000,
    status: 'PARTIALLY_PAID',
    issued_at: '2026-10-14T09:00:00Z',
    due_date: '2026-11-14T09:00:00Z',
    issued_by: 2,
    issued_by_name: 'Đỗ Thị Kế Toán Trưởng',
    notes: 'Hóa đơn xuất lô 15 chiếc tai nghe chống ồn Sony WH-1000XM5',
    created_at: '2026-10-14T09:00:00Z',
    items: [
      {
        id: 102,
        invoice_id: 'HD-2026-0000002',
        dispatch_id: 'PXK-2026-0000002',
        dispatch_item_id: 202,
        product_id: 'PRD-005',
        sku: 'SNY-WH1000XM5',
        product_name: 'Tai nghe Chống Ồn Sony WH-1000XM5 Đen',
        unit: 'Chiếc',
        quantity: 15,
        unit_price: 7990000,
        discount_amount: 0,
        vat_amount: 11985000,
        subtotal: 131835000,
      },
    ],
  },
];

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
