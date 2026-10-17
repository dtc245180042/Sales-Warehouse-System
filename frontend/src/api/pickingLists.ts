import { apiClient } from './client';

export interface PickingPage<T> {
  items: T[]; total: number; page: number; page_size: number; total_pages: number;
}
export interface PickingSource { id: string; code: string }
export interface PickingItem {
  id: number; order_id: string; order_item_id: number; product_id: string; sku: string;
  product_name: string; unit: string; location_code: string; route_sequence: number;
  requested_quantity: number; picked_quantity: number; shortfall_quantity: number;
  shortfall_reason: string | null; status: string; version: number; updated_at: string;
}
export interface PickingSummary {
  id: string; warehouse_id: number; warehouse_name: string; status: string; notes: string | null;
  orders: PickingSource[]; total_lines: number; completed_lines: number; total_quantity: number;
  picked_quantity: number; shortfall_quantity: number; created_at: string;
}
export interface PickingDetail extends PickingSummary { items: PickingItem[] }
export interface EligiblePickingOrder extends PickingSource {
  customer_name: string; status: string; total_lines: number; total_quantity: number;
}
export interface PickingPreview {
  warehouse_id: number; warehouse_name: string; orders: PickingSource[];
  items: Omit<PickingItem, 'id' | 'picked_quantity' | 'shortfall_quantity' | 'shortfall_reason' | 'status' | 'version' | 'updated_at'>[];
  total_lines: number; total_quantity: number; warnings: string[]; can_create: boolean;
}
export interface PickingLocation {
  product_id: string; sku: string; product_name: string; location_code: string; route_sequence: number;
}
export interface PickingHistory {
  id: number; item_id: number; old_quantity: number; new_quantity: number;
  old_shortfall: number; new_shortfall: number; old_status: string; new_status: string;
  old_reason: string | null; new_reason: string | null; changed_by: number; changed_at: string;
}
export interface PickingWarehouse { id: number; name: string }

// Cache RAM theo tài khoản và tham số; dữ liệu cũ hiển thị ngay, API làm mới ở nền.
const cache = new Map<string, unknown>();
export function readPickingCache<T>(key: string): T | undefined { return cache.get(key) as T | undefined; }
export async function loadPickingCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const value = await loader();
  cache.set(key, value);
  return value;
}
export function clearPickingCache(): void { cache.clear(); }

export const pickingApi = {
  warehouses: async () => (await apiClient.get<PickingWarehouse[]>('/picking-lists/warehouses')).data,
  list: async (warehouse_id: number, page: number, status: string, search: string) =>
    (await apiClient.get<PickingPage<PickingSummary>>('/picking-lists', { params: { warehouse_id, page, status: status || undefined, search } })).data,
  eligible: async (warehouse_id: number, page: number, search: string) =>
    (await apiClient.get<PickingPage<EligiblePickingOrder>>('/picking-lists/eligible-orders', { params: { warehouse_id, page, search } })).data,
  locations: async (warehouse_id: number) =>
    (await apiClient.get<PickingLocation[]>('/picking-lists/locations', { params: { warehouse_id } })).data,
  saveLocation: async (warehouse: number, product: string, location_code: string, route_sequence: number) => {
    await apiClient.put(`/picking-lists/locations/${warehouse}/${encodeURIComponent(product)}`, { location_code, route_sequence });
    clearPickingCache();
  },
  preview: async (warehouse_id: number, order_ids: string[]) =>
    (await apiClient.post<PickingPreview>('/picking-lists/previews', { warehouse_id, order_ids })).data,
  create: async (warehouse_id: number, order_ids: string[], client_request_id: string, notes: string) => {
    const result = (await apiClient.post<PickingDetail>('/picking-lists', { warehouse_id, order_ids, client_request_id, notes })).data;
    clearPickingCache();
    return result;
  },
  detail: async (id: string) => (await apiClient.get<PickingDetail>(`/picking-lists/${id}`)).data,
  update: async (id: string, item: PickingItem, picked_quantity: number, shortfall_reason: string) => {
    const result = (await apiClient.patch<PickingDetail>(`/picking-lists/${id}/items/${item.id}`, {
      picked_quantity, shortfall_reason, expected_version: item.version,
    })).data;
    clearPickingCache();
    return result;
  },
  cancel: async (id: string, reason: string) => {
    const result = (await apiClient.patch<PickingDetail>(`/picking-lists/${id}`, { status: 'cancelled', reason })).data;
    clearPickingCache();
    return result;
  },
  history: async (id: string, page = 1) =>
    (await apiClient.get<PickingPage<PickingHistory>>(`/picking-lists/${id}/history`, { params: { page } })).data,
};
