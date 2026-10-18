export function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error loading ${key} from localStorage`, error);
    return defaultValue;
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving ${key} to localStorage`, error);
  }
}

export function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing ${key} from localStorage`, error);
  }
}

/**
 * Tự động quét và dọn sạch các khóa mock data cũ đã từng lưu trên trình duyệt (Client-side cleanup)
 */
export function purgeLegacyMockStorage(): void {
  try {
    const legacyKeys = [
      'salepro_user_products',
      'salepro_user_orders',
      'salepro_user_notifications',
      'salepro_user_profile',
      'salepro_user_cart',
    ];
    legacyKeys.forEach((k) => localStorage.removeItem(k));

    const demoCacheKeys = [
      'kv_credit_notes',
      'kv_stock_dispatches',
      'kv_invoices',
      'kv_product_lots',
      'kv_payments',
      'kv_return_orders',
      'kv_sales_targets',
      'kv_sales_target_audits',
      'kv_stock_adjustments',
      'kv_stock_transfers',
    ];
    demoCacheKeys.forEach((k) => {
      const val = localStorage.getItem(k);
      if (
        val &&
        (val.includes('2026-0000001') ||
          val.includes('TGT-202610-001') ||
          val.includes('PCK-2026-0001') ||
          val.includes('ADJ-20261010-001'))
      ) {
        localStorage.removeItem(k);
      }
    });
} catch (err) {
    console.error('Error purging legacy mock storage:', err);
  }
}

/**
 * Xóa sạch dữ liệu nghiệp vụ đã lưu tạm trong LocalStorage khi đăng xuất / chuyển phiên
 */
export function purgeSessionBusinessStorage(): void {
  try {
    const businessKeys = [
      'kv_orders',
      'kv_customers',
      'kv_invoices',
      'kv_payments',
      'kv_stock_dispatches',
      'kv_return_orders',
      'kv_credit_notes',
      'kv_debt_invoices',
      'kv_delivery_trackings',
      'kv_stock_transfers',
      'kv_stock_adjustments',
      'kv_sales_targets',
      'kv_sales_target_audits',
      'kv_stock_balances',
      'kv_stock_in_receipts',
      'kv_stock_out_receipts',
      'kv_inventory_history',
      'kv_product_lots',
      'kv_agents',
      'kv_users',
    ];
    businessKeys.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.error('Error purging session business storage:', err);
  }
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  purgeLegacyMockStorage();
}
