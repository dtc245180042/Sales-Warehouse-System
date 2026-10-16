import { apiClient } from '../api/client';
import { StockAdjustVoucher, StockAdjustRequest, StockAdjustItem } from '../types/StockAdjust';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_stock_adjustments';

const INITIAL_DEMO_ADJUSTMENTS: StockAdjustVoucher[] = [
  {
    id: 'ADJ-20261010-001',
    code: 'DCXK-20261010-001',
    warehouse: 'Kho Tổng Hà Nội',
    adjustType: 'damaged',
    adjustDate: '2026-10-10',
    reason: 'Hàng bị vỡ hộp móp méo trong quá trình bốc dỡ hàng từ xe tải vào khu vực kệ A1',
    status: 'pending',
    items: [
      {
        productId: 'PRD-001',
        sku: 'IP15-128-BLU',
        name: 'iPhone 15 128GB Blue',
        currentStock: 45,
        adjustQty: 2,
        costPrice: 19500000,
        lossValue: 39000000,
        note: 'Bể màn hình khi rơi',
      },
      {
        productId: 'PRD-007',
        sku: 'LOGI-MXM3S-GR',
        name: 'Chuột không dây Logitech MX Master 3S Graphite',
        currentStock: 120,
        adjustQty: 3,
        costPrice: 1800000,
        lossValue: 5400000,
        note: 'Vỡ vỏ nhựa do đè nén',
      },
    ],
    totalLossQty: 5,
    totalLossValue: 44400000,
    createdBy: 'USR-004',
    createdByName: 'Hoàng Văn Thủ Kho',
    createdAt: '2026-10-10T09:15:00.000Z',
  },
  {
    id: 'ADJ-20261012-002',
    code: 'DCXK-20261012-002',
    warehouse: 'Kho Tổng TP. HCM',
    adjustType: 'expired',
    adjustDate: '2026-10-12',
    reason: 'Lô phụ kiện và dung dịch vệ sinh màn hình điện tử hết hạn sử dụng theo khuyến cáo nhà sản xuất',
    status: 'approved',
    items: [
      {
        productId: 'PRD-010',
        sku: 'CLEAN-KIT-100',
        name: 'Bộ dung dịch làm sạch màn hình cao cấp 100ml',
        currentStock: 80,
        adjustQty: 15,
        costPrice: 120000,
        lossValue: 1800000,
        note: 'Hết date tháng 09/2026',
      },
    ],
    totalLossQty: 15,
    totalLossValue: 1800000,
    createdBy: 'USR-005',
    createdByName: 'Trần Thị Thu Ngân',
    createdAt: '2026-10-12T14:30:00.000Z',
    reviewedBy: 'USR-002',
    reviewedByName: 'Nguyễn Quản Lý Kho',
    reviewedAt: '2026-10-13T08:20:00.000Z',
  },
  {
    id: 'ADJ-20261014-003',
    code: 'DCXK-20261014-003',
    warehouse: 'Kho Đà Nẵng',
    adjustType: 'lost',
    adjustDate: '2026-10-14',
    reason: 'Chênh lệch phát hiện trong kỳ kiểm kê định kỳ tháng 10, nghi ngờ thất thoát',
    status: 'rejected',
    items: [
      {
        productId: 'PRD-004',
        sku: 'DELL-XPS13-PLUS',
        name: 'Dell XPS 13 Plus 9320 i7-1360P 16GB/1TB OLED',
        currentStock: 12,
        adjustQty: 1,
        costPrice: 34000000,
        lossValue: 34000000,
        note: 'Thiếu 1 máy khi đối chiếu sổ kiểm kê',
      },
    ],
    totalLossQty: 1,
    totalLossValue: 34000000,
    createdBy: 'USR-006',
    createdByName: 'Lê Văn Kho Vận',
    createdAt: '2026-10-14T16:00:00.000Z',
    reviewedBy: 'USR-002',
    reviewedByName: 'Nguyễn Quản Lý Kho',
    reviewedAt: '2026-10-15T09:00:00.000Z',
    rejectReason: 'Cần trích xuất camera an ninh trước khi lập biên bản hao hụt giá trị cao.',
  },
];

export const stockAdjustService = {
  getAll: async (params?: {
    type?: string;
    status?: string;
    warehouse?: string;
    search?: string;
  }): Promise<StockAdjustVoucher[]> => {
    try {
      const res = await apiClient.get('/stock-adjustments', { params });
      if (res.data && Array.isArray(res.data.items || res.data)) {
        const items = res.data.items || res.data;
        setStorageItem(STORAGE_KEY, items);
        return items;
      }
    } catch {
      // Fallback
    }

    let list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);

    if (params?.type && params.type !== 'all') {
      list = list.filter((i) => i.adjustType === params.type);
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((i) => i.status === params.status);
    }
    if (params?.warehouse && params.warehouse !== 'all') {
      list = list.filter((i) => i.warehouse.toLowerCase().includes(params.warehouse!.toLowerCase()));
    }
    if (params?.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.createdByName.toLowerCase().includes(q) ||
          i.reason.toLowerCase().includes(q)
      );
    }
    return list;
  },

  getById: async (id: string): Promise<StockAdjustVoucher | null> => {
    try {
      const res = await apiClient.get(`/stock-adjustments/${id}`);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }
    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    return list.find((i) => i.id === id || i.code === id) || null;
  },

  create: async (
    payload: StockAdjustRequest,
    user: { id?: string | number; name?: string }
  ): Promise<StockAdjustVoucher> => {
    const totalLossQty = payload.items.reduce((sum, it) => sum + Number(it.adjustQty || 0), 0);
    const totalLossValue = payload.items.reduce((sum, it) => sum + Number(it.lossValue || 0), 0);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(100 + Math.random() * 900);
    const code = `DCXK-${dateStr}-${rand}`;
    const id = `ADJ-${dateStr}-${rand}`;

    const newVoucher: StockAdjustVoucher = {
      ...payload,
      id,
      code,
      status: 'pending',
      totalLossQty,
      totalLossValue,
      createdBy: String(user.id || 'USR-001'),
      createdByName: user.name || 'Người dùng',
      createdAt: now.toISOString(),
    };

    try {
      const res = await apiClient.post('/stock-adjustments', newVoucher);
      if (res.data) {
        return res.data;
      }
    } catch {
      // Fallback
    }

    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    const updated = [newVoucher, ...list];
    setStorageItem(STORAGE_KEY, updated);
    return newVoucher;
  },

  approve: async (id: string, reviewerName: string = 'Quản lý kho'): Promise<StockAdjustVoucher> => {
    try {
      const res = await apiClient.patch(`/stock-adjustments/${id}/approve`);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    const idx = list.findIndex((i) => i.id === id || i.code === id);
    if (idx === -1) throw new Error('Không tìm thấy phiếu điều chỉnh');

    const updated = {
      ...list[idx],
      status: 'approved' as const,
      reviewedBy: 'USR-REVIEWER',
      reviewedByName: reviewerName,
      reviewedAt: new Date().toISOString(),
      rejectReason: undefined,
    };
    list[idx] = updated;
    setStorageItem(STORAGE_KEY, list);
    return updated;
  },

  reject: async (
    id: string,
    reason: string,
    reviewerName: string = 'Quản lý kho'
  ): Promise<StockAdjustVoucher> => {
    try {
      const res = await apiClient.patch(`/stock-adjustments/${id}/reject`, { reason });
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const list = getStorageItem<StockAdjustVoucher[]>(STORAGE_KEY, INITIAL_DEMO_ADJUSTMENTS);
    const idx = list.findIndex((i) => i.id === id || i.code === id);
    if (idx === -1) throw new Error('Không tìm thấy phiếu điều chỉnh');

    const updated = {
      ...list[idx],
      status: 'rejected' as const,
      reviewedBy: 'USR-REVIEWER',
      reviewedByName: reviewerName,
      reviewedAt: new Date().toISOString(),
      rejectReason: reason,
    };
    list[idx] = updated;
    setStorageItem(STORAGE_KEY, list);
    return updated;
  },
};
