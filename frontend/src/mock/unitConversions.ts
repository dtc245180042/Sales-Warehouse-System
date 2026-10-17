import { ProductUnitConfig } from '../types/Product';

/**
 * Cấu hình đơn vị tính & hệ số quy đổi cho từng sản phẩm.
 * Key: productId
 */
export const mockUnitConfigs: Record<string, ProductUnitConfig> = {};

export const getUnitConfig = (productId: string): ProductUnitConfig | undefined =>
  mockUnitConfigs[productId];

const UNIT_CONFIG_KEY = 'kv_unit_configs';

export const unitConfigService = {
  getAll: (): Record<string, ProductUnitConfig> => {
    try {
      const raw = localStorage.getItem(UNIT_CONFIG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
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
