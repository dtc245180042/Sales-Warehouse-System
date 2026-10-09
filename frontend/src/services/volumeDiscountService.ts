export interface DiscountTier {
  minQty: number;
  discountPct: number;
}

export const DEFAULT_VOLUME_DISCOUNT_TIERS: DiscountTier[] = [
  { minQty: 1, discountPct: 0 },
  { minQty: 5, discountPct: 3 },
  { minQty: 10, discountPct: 5 },
  { minQty: 20, discountPct: 8 },
  { minQty: 50, discountPct: 12 },
  { minQty: 100, discountPct: 15 },
];

const STORAGE_KEY = 'oms_volume_discount_tiers';

export const volumeDiscountService = {
  getTiers(): DiscountTier[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.sort((a, b) => a.minQty - b.minQty);
        }
      }
    } catch {
      // Fallback
    }
    return [...DEFAULT_VOLUME_DISCOUNT_TIERS];
  },

  validateTiers(tiers: DiscountTier[]): { valid: boolean; error?: string } {
    if (!tiers || tiers.length === 0) {
      return { valid: false, error: 'Chính sách phải có ít nhất 1 mốc chiết khấu.' };
    }

    // Kiểm tra mốc đầu tiên
    const hasBase = tiers.some((t) => t.minQty === 1 && t.discountPct === 0);
    if (!hasBase) {
      return { valid: false, error: 'Chính sách phải bao gồm mốc cơ sở: Từ 1 sản phẩm với chiết khấu 0%.' };
    }

    // Kiểm tra tính duy nhất và giá trị hợp lệ
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

    // Kiểm tra tính tăng dần của chiết khấu
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

  saveTiers(tiers: DiscountTier[]): void {
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    window.dispatchEvent(new CustomEvent('volume_discount_policy_changed', { detail: sorted }));
  },

  resetToDefault(): DiscountTier[] {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('volume_discount_policy_changed', { detail: DEFAULT_VOLUME_DISCOUNT_TIERS }));
    return [...DEFAULT_VOLUME_DISCOUNT_TIERS];
  },

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
