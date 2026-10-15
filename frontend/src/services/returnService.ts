import { apiClient } from '../api/client';
import {
  ReturnOrder,
  ReturnOrderCreateRequest,
  ReturnConfirmRequest,
  ReturnCancelRequest,
} from '../types/ReturnOrder';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_return_orders';

const INITIAL_DEMO_RETURNS: ReturnOrder[] = [
  {
    id: 'TH-2026-0000001',
    client_request_id: 'REQ-RET-20261016-001',
    invoice_id: 'HD-2026-0000001',
    customer_id: 'CUS-001',
    customer_name: 'Đại lý Dương Quang Trung',
    status: 'CONFIRMED',
    return_reason: 'DEFECTIVE_PRODUCT',
    notes: 'Đại lý báo thiết bị lỗi cảm ứng màn hình từ nhà sản xuất',
    origin_warehouse_id: 1,
    requested_by: 3,
    requested_by_name: 'Lê Thị Nhân Viên Kinh Doanh',
    requested_at: '2026-10-16T08:30:00Z',
    confirmed_by: 4,
    confirmed_by_name: 'Phạm Văn Trưởng Kho',
    confirmed_at: '2026-10-16T09:15:00Z',
    total_returned_value: 53980000,
    created_at: '2026-10-16T08:30:00Z',
    items: [
      {
        id: 1,
        invoice_item_id: 101,
        product_id: 'PRD-001',
        sku: 'IP15PM-256-TI',
        product_name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
        unit: 'Chiếc',
        quantity: 2,
        condition: 'GOOD',
        lot_id: 10,
        lot_number: 'LOT-2026-IP15P-01',
        unit_price: 26990000,
        discount_amount: 0,
        vat_amount: 0,
        subtotal: 53980000,
      },
    ],
  },
  {
    id: 'TH-2026-0000002',
    client_request_id: 'REQ-RET-20261016-002',
    invoice_id: 'HD-2026-0000002',
    customer_id: 'CUS-002',
    customer_name: 'Đại lý Trần Trung Hiếu',
    status: 'REQUESTED',
    return_reason: 'DAMAGED_IN_TRANSIT',
    notes: 'Vỏ hộp tai nghe móp rách do vận chuyển đường dài, chờ kiểm đếm',
    origin_warehouse_id: 1,
    requested_by: 3,
    requested_by_name: 'Lê Thị Nhân Viên Kinh Doanh',
    requested_at: '2026-10-16T09:00:00Z',
    total_returned_value: 23970000,
    created_at: '2026-10-16T09:00:00Z',
    items: [
      {
        id: 2,
        invoice_item_id: 102,
        product_id: 'PRD-005',
        sku: 'SNY-WH1000XM5',
        product_name: 'Tai nghe Chống Ồn Sony WH-1000XM5 Đen',
        unit: 'Chiếc',
        quantity: 3,
        condition: 'DAMAGED',
        lot_id: null,
        lot_number: null,
        unit_price: 7990000,
        discount_amount: 0,
        vat_amount: 0,
        subtotal: 23970000,
      },
    ],
  },
];

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
