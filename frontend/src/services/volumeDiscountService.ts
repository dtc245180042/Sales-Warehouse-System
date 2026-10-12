import { apiClient } from '../api/client';

export type VolumeDiscountScope = 'ALL_PRODUCTS' | 'CATEGORY' | 'PRODUCT';
export type VolumeDiscountType = 'PERCENT' | 'FIXED_AMOUNT';

export interface DiscountTier {
  minQty: number;
  discountPct: number;
}

export interface VolumeDiscountTierPayload {
  id?: number;
  min_quantity: number;
  max_quantity?: number | null;
  discount_type: VolumeDiscountType;
  discount_value: number;
}

export interface VolumeDiscountPolicy {
  id: number;
  code: string;
  name: string;
  description?: string;
  applied_scope: VolumeDiscountScope;
  target_id?: string | null;
  customer_group: string;
  valid_from: string;
  valid_to?: string | null;
  is_active: boolean;
  created_by_name?: string;
  created_at: string;
  tiers: VolumeDiscountTierPayload[];
}

export interface VolumeDiscountPolicyCreate {
  code: string;
  name: string;
  description?: string;
  applied_scope: VolumeDiscountScope;
  target_id?: string | null;
  customer_group?: string;
  valid_from: string;
  valid_to?: string | null;
  is_active?: boolean;
  tiers: VolumeDiscountTierPayload[];
}

export interface VolumeDiscountCalculateResponse {
  product_id: string;
  quantity: number;
  original_unit_price: number;
  discount_type?: VolumeDiscountType;
  discount_value: number;
  discounted_unit_price: number;
  total_discount_amount: number;
  subtotal: number;
  applied_policy_id?: number;
  applied_policy_name?: string;
  applied_tier_min?: number;
  applied_tier_max?: number;
  next_tier_min?: number;
  needed_for_next_tier?: number;
  next_tier_discount_value?: number;
}

export const DEFAULT_VOLUME_DISCOUNT_TIERS: DiscountTier[] = [
  { minQty: 1, discountPct: 0 },
  { minQty: 5, discountPct: 3 },
  { minQty: 10, discountPct: 5 },
  { minQty: 20, discountPct: 8 },
  { minQty: 50, discountPct: 12 },
  { minQty: 100, discountPct: 15 },
];

// An toàn dọn dẹp key localStorage cũ nếu còn tồn tại
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('oms_volume_discount_tiers');
  }
} catch {
  // Bỏ qua nếu môi trường không có localStorage
}

// Bộ nhớ cache tạm thời trong phiên làm việc (in-memory)
let cachedActiveTiers: DiscountTier[] | null = null;

export const volumeDiscountService = {
  // Lấy danh sách chính sách từ Backend API /api/v1/volume-discounts
  async getAll(params?: { is_active?: boolean; applied_scope?: string }): Promise<VolumeDiscountPolicy[]> {
    const res = await apiClient.get<VolumeDiscountPolicy[]>('/volume-discounts', { params });
    return res.data;
  },

  async getById(id: number): Promise<VolumeDiscountPolicy> {
    const res = await apiClient.get<VolumeDiscountPolicy>(`/volume-discounts/${id}`);
    return res.data;
  },

  async create(data: VolumeDiscountPolicyCreate): Promise<VolumeDiscountPolicy> {
    const res = await apiClient.post<VolumeDiscountPolicy>('/volume-discounts', data);
    cachedActiveTiers = null;
    return res.data;
  },

  async update(id: number, data: Partial<VolumeDiscountPolicyCreate>): Promise<VolumeDiscountPolicy> {
    const res = await apiClient.put<VolumeDiscountPolicy>(`/volume-discounts/${id}`, data);
    cachedActiveTiers = null;
    return res.data;
  },

  async delete(id: number): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/volume-discounts/${id}`);
    cachedActiveTiers = null;
    return res.data;
  },

  async calculateDiscountBackend(params: {
    product_id: string;
    quantity: number;
    customer_id?: string;
  }): Promise<VolumeDiscountCalculateResponse> {
    const res = await apiClient.post<VolumeDiscountCalculateResponse>('/volume-discounts/calculate', params);
    return res.data;
  },

  // Tải danh sách các bậc thang chiết khấu đang áp dụng từ backend API
  async fetchActiveTiers(): Promise<DiscountTier[]> {
    try {
      const policies = await this.getAll({ is_active: true });
      // Ưu tiên chính sách toàn bộ sản phẩm ALL_PRODUCTS
      const globalPolicy = policies.find((p) => p.is_active && p.applied_scope === 'ALL_PRODUCTS') || policies[0];
      if (globalPolicy && globalPolicy.tiers && globalPolicy.tiers.length > 0) {
        const mapped: DiscountTier[] = globalPolicy.tiers
          .filter((t) => t.discount_type === 'PERCENT')
          .map((t) => ({
            minQty: Number(t.min_quantity),
            discountPct: Number(t.discount_value),
          }))
          .sort((a, b) => a.minQty - b.minQty);

        if (!mapped.some((t) => t.minQty === 1)) {
          mapped.unshift({ minQty: 1, discountPct: 0 });
        }
        cachedActiveTiers = mapped;
        return mapped;
      }
    } catch {
      // Fallback khi offline hoặc chưa cấu hình
    }
    return cachedActiveTiers || [...DEFAULT_VOLUME_DISCOUNT_TIERS];
  },

  // Đồng bộ cho POS / UI
  getTiers(): DiscountTier[] {
    return cachedActiveTiers || [...DEFAULT_VOLUME_DISCOUNT_TIERS];
  },

  // Validation ràng buộc các bậc chiết khấu
  validateTiers(tiers: DiscountTier[]): { valid: boolean; error?: string } {
    if (!tiers || tiers.length === 0) {
      return { valid: false, error: 'Chính sách phải có ít nhất 1 mốc chiết khấu.' };
    }

    const hasBase = tiers.some((t) => t.minQty === 1 && t.discountPct === 0);
    if (!hasBase) {
      return { valid: false, error: 'Chính sách phải bao gồm mốc cơ sở: Từ 1 sản phẩm với chiết khấu 0%.' };
    }

    const minQtySet = new Set<number>();
    for (const t of tiers) {
      if (t.minQty < 1 || !Number.isInteger(t.minQty)) {
        return { valid: false, error: `Số lượng tối thiểu (${t.minQty}) phải là số nguyên dương lớn hơn hoặc bằng 1.` };
      }
      if (t.discountPct < 0 || t.discountPct > 100) {
        return { valid: false, error: `Mức chiết khấu (${t.discountPct}%) phải nằm trong khoảng từ 0% đến 100%.` };
      }
      if (minQtySet.has(t.minQty)) {
        return { valid: false, error: `Ngưỡng sản lượng ${t.minQty} sản phẩm bị trùng lặp.` };
      }
      minQtySet.add(t.minQty);
    }

    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].discountPct < sorted[i - 1].discountPct) {
        return {
          valid: false,
          error: `Mức chiết khấu của mốc ${sorted[i].minQty} sp (${sorted[i].discountPct}%) không được nhỏ hơn mốc ${sorted[i - 1].minQty} sp (${sorted[i - 1].discountPct}%).`,
        };
      }
    }

    return { valid: true };
  },

  // Tính chiết khấu cục bộ hiển thị preview giỏ hàng
  calculateDiscount(qty: number, customTiers?: DiscountTier[]) {
    const tiers = customTiers || this.getTiers();
    let activeTier = tiers[0] || { minQty: 1, discountPct: 0 };
    let nextTier: DiscountTier | null = null;

    for (let i = 0; i < tiers.length; i++) {
      if (qty >= tiers[i].minQty) {
        activeTier = tiers[i];
        nextTier = tiers[i + 1] || null;
      } else {
        if (!nextTier) nextTier = tiers[i];
        break;
      }
    }

    const discountPct = activeTier.discountPct;
    const neededForNext = nextTier ? nextTier.minQty - qty : 0;

    return {
      discountPct,
      activeTier,
      nextTier,
      neededForNext,
    };
  },
};

// Kích hoạt nạp tiers từ Backend API
if (typeof window !== 'undefined') {
  volumeDiscountService.fetchActiveTiers().catch(() => {});
}

export const VOLUME_DISCOUNT_TIERS: DiscountTier[] = volumeDiscountService.getTiers();

export function getVolumeDiscountInfo(qty: number, tiers?: DiscountTier[]) {
  return volumeDiscountService.calculateDiscount(qty, tiers);
}
