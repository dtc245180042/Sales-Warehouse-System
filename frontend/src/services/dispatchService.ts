import { apiClient } from '../api/client';
import { StockDispatch, BackorderItem } from '../types/StockDispatch';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_stock_dispatches';

const INITIAL_DEMO_DISPATCHES: StockDispatch[] = [
  {
    id: 'PXK-2026-0000001',
    order_id: 'ORD-2026-001',
    customer_id: 'CUS-001',
    customer_name: 'Đại lý Dương Quang Trung',
    warehouse_id: 1,
    warehouse_name: 'Kho Tổng Thiết Bị Điện Tử',
    status: 'CONFIRMED',
    dispatched_by: 4,
    dispatched_by_name: 'Phạm Văn Trưởng Kho',
    notes: 'Đã xuất kho đầy đủ điện thoại iPhone chính hãng theo đơn',
    created_at: '2026-10-14T08:00:00Z',
    items: [
      {
        id: 201,
        product_id: 'PRD-001',
        sku: 'IP15PM-256-TI',
        product_name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
        unit: 'Chiếc',
        ordered_quantity: 10,
        dispatched_quantity: 10,
        shortfall_quantity: 0,
        lots: [{ lot_id: 10, lot_number: 'LOT-2026-IP15P-01', quantity: 10 }],
      },
    ],
  },
  {
    id: 'PXK-2026-0000002',
    order_id: 'ORD-2026-002',
    customer_id: 'CUS-002',
    customer_name: 'Đại lý Trần Trung Hiếu',
    warehouse_id: 1,
    warehouse_name: 'Kho Tổng Thiết Bị Điện Tử',
    status: 'CONFIRMED',
    dispatched_by: 4,
    dispatched_by_name: 'Phạm Văn Trưởng Kho',
    notes: 'Xuất thiếu 5 chiếc tai nghe Sony do kho tạm hết, ghi nhận nợ hàng giao bù',
    created_at: '2026-10-15T09:30:00Z',
    items: [
      {
        id: 202,
        product_id: 'PRD-005',
        sku: 'SNY-WH1000XM5',
        product_name: 'Tai nghe Chống Ồn Sony WH-1000XM5 Đen',
        unit: 'Chiếc',
        ordered_quantity: 20,
        dispatched_quantity: 15,
        shortfall_quantity: 5,
        lots: [],
      },
    ],
  },
  {
    id: 'PXK-2026-0000003',
    order_id: 'ORD-2026-003',
    customer_id: 'CUS-003',
    customer_name: 'Đại lý Nguyễn Thị Thu Hà',
    warehouse_id: 1,
    warehouse_name: 'Kho Tổng Thiết Bị Điện Tử',
    status: 'CONFIRMED',
    dispatched_by: 4,
    dispatched_by_name: 'Phạm Văn Trưởng Kho',
    notes: 'Xuất kho đợt laptop MacBook Air M3 cho đại lý',
    created_at: '2026-10-15T11:00:00Z',
    items: [
      {
        id: 203,
        product_id: 'PRD-003',
        sku: 'MBA-M3-16-512',
        product_name: 'MacBook Air 13 inch M3 16GB/512GB Midnight',
        unit: 'Chiếc',
        ordered_quantity: 5,
        dispatched_quantity: 5,
        shortfall_quantity: 0,
        lots: [],
      },
    ],
  },
];

export const dispatchService = {
  getDispatches: async (params?: {
    customer_id?: string;
    warehouse_id?: number;
    status?: string;
  }): Promise<StockDispatch[]> => {
    try {
      const res = await apiClient.get<StockDispatch[]>('/dispatches', { params });
      if (Array.isArray(res.data)) {
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[dispatchService] Fallback to demo dispatches:', err);
    }
    return getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
  },

  getDispatchById: async (id: string): Promise<StockDispatch> => {
    try {
      const res = await apiClient.get<StockDispatch>(`/dispatches/${id}`);
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[dispatchService] Fallback getDispatchById:', err);
    }
    const all = getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
    const found = all.find((d) => d.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy phiếu xuất kho với mã ${id}`);
  },

  confirmDispatch: async (id: string, notes?: string): Promise<StockDispatch> => {
    try {
      const res = await apiClient.post<StockDispatch>(`/dispatches/${id}/confirm`, { notes });
      if (res.data) {
        const all = getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
        const updated = all.map((d) => (d.id === id ? res.data : d));
        setStorageItem(STORAGE_KEY, updated);
        return res.data;
      }
    } catch (err: any) {
      throw new Error(err?.response?.data?.detail || err?.message || 'Lỗi khi xác nhận xuất kho');
    }
    throw new Error('Không thể kết nối máy chủ để xác nhận xuất kho');
  },

  getBackorders: async (): Promise<BackorderItem[]> => {
    try {
      const res = await apiClient.get<BackorderItem[]>('/dispatches/backorders');
      if (Array.isArray(res.data)) return res.data;
    } catch (err) {
      console.warn('[dispatchService] Fallback backorders:', err);
    }
    const all = getStorageItem<StockDispatch[]>(STORAGE_KEY, INITIAL_DEMO_DISPATCHES);
    const backorders: BackorderItem[] = [];
    all.forEach((d) => {
      d.items.forEach((item) => {
        if (item.shortfall_quantity > 0) {
          backorders.push({
            id: item.id || 0,
            dispatch_id: d.id,
            order_id: d.order_id,
            customer_id: d.customer_id,
            customer_name: d.customer_name,
            product_id: item.product_id,
            sku: item.sku,
            product_name: item.product_name,
            unit: item.unit,
            ordered_quantity: item.ordered_quantity,
            dispatched_quantity: item.dispatched_quantity,
            shortfall_quantity: item.shortfall_quantity,
            warehouse_id: d.warehouse_id,
            warehouse_name: d.warehouse_name,
            status: 'PENDING_RESTOCK',
            created_at: d.created_at,
          });
        }
      });
    });
    return backorders;
  },
};
