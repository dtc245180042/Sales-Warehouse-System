import { ProductUnitConfig } from '../types/Product';

/**
 * Mock dữ liệu cấu hình đơn vị tính & hệ số quy đổi cho từng sản phẩm.
 * Key: productId
 */
export const mockUnitConfigs: Record<string, ProductUnitConfig> = {
  'PRD-001': {
    productId: 'PRD-001',
    baseUnit: 'Chiếc',
    updatedAt: '2026-09-20',
    units: [
      {
        id: 'u-001-1',
        unitName: 'Chiếc',
        ratio: 1,
        isBase: true,
        barcode: '893850123001',
        salePrice: 26990000,
        notes: 'Đơn vị cơ sở – bán lẻ theo chiếc',
      },
      {
        id: 'u-001-2',
        unitName: 'Hộp',
        ratio: 1,
        isBase: false,
        barcode: '893850123011',
        salePrice: 26990000,
        notes: 'Hộp cá nhân – 1 hộp chứa 1 chiếc kèm phụ kiện',
      },
    ],
  },
  'PRD-002': {
    productId: 'PRD-002',
    baseUnit: 'Chiếc',
    updatedAt: '2026-09-18',
    units: [
      {
        id: 'u-002-1',
        unitName: 'Chiếc',
        ratio: 1,
        isBase: true,
        barcode: '893850123002',
        salePrice: 29990000,
      },
    ],
  },
};

/**
 * Lấy cấu hình đơn vị tính theo productId.
 * Trả về undefined nếu sản phẩm chưa có cấu hình.
 */
export const getUnitConfig = (productId: string): ProductUnitConfig | undefined =>
  mockUnitConfigs[productId];

/**
 * Lưu cấu hình đơn vị tính vào mock store (localStorage để persist qua reload).
 */
const UNIT_CONFIG_KEY = 'kv_unit_configs';

export const unitConfigService = {
  getAll: (): Record<string, ProductUnitConfig> => {
    try {
      const raw = localStorage.getItem(UNIT_CONFIG_KEY);
      return raw ? JSON.parse(raw) : { ...mockUnitConfigs };
    } catch {
      return { ...mockUnitConfigs };
    }
  },

  getByProductId: (productId: string): ProductUnitConfig | undefined => {
    const all = unitConfigService.getAll();
    return all[productId];
  },

  save: (config: ProductUnitConfig): ProductUnitConfig => {
    const all = unitConfigService.getAll();
    const updated = {
      ...config,
      updatedAt: new Date().toISOString().split('T')[0],
    };
    all[config.productId] = updated;
    localStorage.setItem(UNIT_CONFIG_KEY, JSON.stringify(all));
    return updated;
  },

  delete: (productId: string): void => {
    const all = unitConfigService.getAll();
    delete all[productId];
    localStorage.setItem(UNIT_CONFIG_KEY, JSON.stringify(all));
  },
};
