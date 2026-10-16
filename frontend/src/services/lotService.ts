import { apiClient } from '../api/client';
import { ProductLot, FEFOSuggestionResponse } from '../types/ProductLot';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_product_lots';

const INITIAL_DEMO_LOTS: ProductLot[] = [
  {
    id: 10,
    lot_number: 'LOT-2026-IP15P-01',
    product_id: 'PRD-001',
    product_name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
    sku: 'IP15PM-256-TI',
    warehouse_id: 1,
    warehouse_name: 'Kho Tổng Thiết Bị Điện Tử',
    mfg_date: '2025-01-10',
    exp_date: '2026-11-20',
    initial_quantity: 50,
    remaining_quantity: 20,
    status: 'NEAR_EXPIRY',
    notes: 'Lô sản xuất đợt 1, ưu tiên xuất kho trước theo FEFO',
    created_at: '2025-01-10T08:00:00Z',
  },
  {
    id: 11,
    lot_number: 'LOT-2026-IP15P-02',
    product_id: 'PRD-001',
    product_name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
    sku: 'IP15PM-256-TI',
    warehouse_id: 1,
    warehouse_name: 'Kho Tổng Thiết Bị Điện Tử',
    mfg_date: '2025-06-01',
    exp_date: '2027-06-01',
    initial_quantity: 100,
    remaining_quantity: 85,
    status: 'ACTIVE',
    notes: 'Hàng chính hãng Apple nguyên seal đợt mới',
    created_at: '2025-06-01T08:00:00Z',
  },
  {
    id: 12,
    lot_number: 'LOT-2025-SNY-01',
    product_id: 'PRD-005',
    product_name: 'Tai nghe Chống Ồn Sony WH-1000XM5 Đen',
    sku: 'SNY-WH1000XM5',
    warehouse_id: 1,
    warehouse_name: 'Kho Tổng Thiết Bị Điện Tử',
    mfg_date: '2024-01-01',
    exp_date: '2025-12-31',
    initial_quantity: 30,
    remaining_quantity: 4,
    status: 'EXPIRED',
    notes: 'Lô tai nghe mẫu quá hạn bảo hành lưu kho, cần kiểm định lại',
    created_at: '2024-01-01T08:00:00Z',
  },
];

export const lotService = {
  getLots: async (params?: {
    product_id?: string;
    warehouse_id?: number;
    status?: string;
    search?: string;
  }): Promise<ProductLot[]> => {
    try {
      const res = await apiClient.get<ProductLot[]>('/lots', { params });
      if (Array.isArray(res.data)) {
        setStorageItem(STORAGE_KEY, res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('[lotService] Fallback to demo lots:', err);
    }
    return getStorageItem<ProductLot[]>(STORAGE_KEY, INITIAL_DEMO_LOTS);
  },

  getNearExpiryLots: async (thresholdDays: number = 30): Promise<ProductLot[]> => {
    try {
      const res = await apiClient.get<ProductLot[]>('/lots/near-expiry', {
        params: { threshold_days: thresholdDays },
      });
      if (Array.isArray(res.data)) return res.data;
    } catch (err) {
      console.warn('[lotService] Fallback near-expiry:', err);
    }
    const all = getStorageItem<ProductLot[]>(STORAGE_KEY, INITIAL_DEMO_LOTS);
    return all.filter((l) => l.status === 'NEAR_EXPIRY' || l.status === 'EXPIRED');
  },

  getFEFOSuggestions: async (
    productId: string,
    warehouseId: number,
    quantity: number
  ): Promise<FEFOSuggestionResponse> => {
    try {
      const res = await apiClient.get<FEFOSuggestionResponse>('/lots/fefo-suggestions', {
        params: { product_id: productId, warehouse_id: warehouseId, quantity },
      });
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[lotService] Fallback FEFO suggestions:', err);
    }
    // Fallback simulation for electronic lots
    return {
      product_id: productId,
      sku: 'IP15PM-256-TI',
      requested_quantity: quantity,
      total_allocated: quantity,
      shortfall: 0,
      suggestions: [
        {
          lot_id: 10,
          lot_number: 'LOT-2026-IP15P-01',
          exp_date: '2026-11-20',
          available_quantity: 20,
          allocated_quantity: Math.min(quantity, 20),
          is_near_expiry: true,
          days_to_expiry: 35,
        },
      ],
    };
  },

  createLot: async (lotData: Partial<ProductLot>): Promise<ProductLot> => {
    try {
      const res = await apiClient.post<ProductLot>('/lots', lotData);
      if (res.data) {
        const local = getStorageItem<ProductLot[]>(STORAGE_KEY, INITIAL_DEMO_LOTS);
        setStorageItem(STORAGE_KEY, [res.data, ...local]);
        return res.data;
      }
    } catch (err: any) {
      throw new Error(err?.response?.data?.detail || err?.message || 'Lỗi khi tạo lô hàng');
    }
    throw new Error('Không thể kết nối máy chủ để tạo lô hàng');
  },
};
