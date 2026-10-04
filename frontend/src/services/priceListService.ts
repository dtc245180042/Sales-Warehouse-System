import { apiClient } from '../api/client';

export interface PriceListItem {
  id?: number;
  price_list_id?: number;
  product_id: string;
  product_sku?: string;
  product_name: string;
  unit: string;
  listed_price: number;
  floor_price: number;
  sale_price: number;
  discount_percent?: number;
  requires_approval?: boolean;
  status?: string;
  note?: string;
}

export interface PriceList {
  id: number;
  code: string;
  name: string;
  customer_group: string;
  version: number;
  parent_id?: number | null;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | string;
  valid_from: string;
  valid_to?: string | null;
  has_orders: boolean;
  orders_count: number;
  is_locked?: boolean;
  is_expired?: boolean;
  is_effective?: boolean;
  requires_approval: boolean;
  approved_by_id?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  approval_note?: string | null;
  created_by_id?: number | null;
  created_by_name?: string | null;
  items_count?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  items?: PriceListItem[];
}

export interface PriceListPaginatedResponse {
  items: PriceList[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PriceListCreatePayload {
  code: string;
  name: string;
  customer_group: string;
  valid_from: string;
  valid_to?: string | null;
  is_active?: boolean;
  items: PriceListItem[];
}

export interface PriceListUpdatePayload {
  name?: string;
  customer_group?: string;
  valid_from?: string;
  valid_to?: string | null;
  is_active?: boolean;
  items?: PriceListItem[];
}

export interface PriceListCloneRequest {
  new_code?: string;
  new_name?: string;
  valid_from?: string;
  valid_to?: string | null;
  copy_items?: boolean;
  price_adjustment_percent?: number;
  auto_close_parent?: boolean;
}

export interface PriceListLockStatusResponse {
  price_list_id: number;
  code: string;
  name: string;
  version: number;
  is_locked: boolean;
  orders_count: number;
  has_orders: boolean;
  can_edit: boolean;
  can_delete: boolean;
  lock_reason?: string | null;
}

export interface PriceListVersionHistoryItem {
  id: number;
  code: string;
  name: string;
  version: number;
  parent_id?: number | null;
  customer_group: string;
  status: string;
  valid_from: string;
  valid_to?: string | null;
  has_orders: boolean;
  orders_count: number;
  is_locked: boolean;
  requires_approval: boolean;
  items_count: number;
  created_at?: string;
}

export interface ConflictingPriceListBrief {
  id: number;
  code: string;
  name: string;
  version: number;
  customer_group: string;
  status: string;
  valid_from: string;
  valid_to?: string | null;
}

export interface PriceListOverlapCheckResponse {
  has_overlap: boolean;
  customer_group: string;
  valid_from: string;
  valid_to?: string | null;
  message: string;
  conflicts: ConflictingPriceListBrief[];
}

export interface CustomerGroupActivePriceListBrief {
  id: number;
  code: string;
  name: string;
  version: number;
  valid_from: string;
  valid_to?: string | null;
  items_count: number;
  requires_approval: boolean;
}

export interface CustomerGroupSummaryItem {
  customer_group: string;
  group_label: string;
  has_active_price_list: boolean;
  active_price_list?: CustomerGroupActivePriceListBrief | null;
  total_price_lists: number;
  pending_approval_count: number;
  expired_count: number;
  draft_count: number;
}

export interface CustomerGroupSummaryResponse {
  items: CustomerGroupSummaryItem[];
  total_groups: number;
}

export const CUSTOMER_GROUPS: { value: string; label: string; description: string; badgeColor: string; iconBg: string }[] = [
  {
    value: 'TIER_1',
    label: 'Đại lý Cấp 1',
    description: 'Đại lý chiến lược cấp cao, chiết khấu tốt nhất',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300',
    iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  {
    value: 'TIER_2',
    label: 'Đại lý Cấp 2',
    description: 'Đại lý phân phối cấp 2 khu vực',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300',
    iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  {
    value: 'RETAIL',
    label: 'Khách hàng Bán lẻ',
    description: 'Giá bán lẻ niêm yết tiêu chuẩn',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
    iconBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  },
  {
    value: 'WHOLESALE',
    label: 'Khách buôn / Khách sỉ',
    description: 'Khách mua số lượng lớn theo lô',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300',
    iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    value: 'VIP',
    label: 'Khách hàng VIP',
    description: 'Khách hàng thân thiết doanh số cao',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300',
    iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
];

export const priceListService = {
  getAll: async (params?: {
    customer_group?: string;
    status?: string;
    time_status?: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | string;
    from_date?: string;
    to_date?: string;
    is_locked?: boolean;
    requires_approval?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<PriceListPaginatedResponse> => {
    const res = await apiClient.get<PriceListPaginatedResponse>('/price-lists', { params });
    return res.data;
  },

  getById: async (id: number | string): Promise<PriceList> => {
    const res = await apiClient.get<PriceList>(`/price-lists/${id}`);
    return res.data;
  },

  create: async (data: PriceListCreatePayload): Promise<PriceList> => {
    const res = await apiClient.post<PriceList>('/price-lists', data);
    return res.data;
  },

  update: async (id: number | string, data: PriceListUpdatePayload): Promise<PriceList> => {
    const res = await apiClient.put<PriceList>(`/price-lists/${id}`, data);
    return res.data;
  },

  cloneVersion: async (id: number | string, data?: PriceListCloneRequest): Promise<PriceList> => {
    const res = await apiClient.post<PriceList>(`/price-lists/${id}/clone-version`, data || {});
    return res.data;
  },

  approve: async (id: number | string, approved: boolean, note?: string, autoResolveOverlap: boolean = false): Promise<PriceList> => {
    const res = await apiClient.post<PriceList>(`/price-lists/${id}/approve`, {
      approved,
      note: note || (approved ? 'Đã duyệt bảng giá' : 'Từ chối duyệt bảng giá'),
      auto_resolve_overlap: autoResolveOverlap,
    });
    return res.data;
  },

  delete: async (id: number | string): Promise<void> => {
    await apiClient.delete(`/price-lists/${id}`);
  },

  getLockStatus: async (id: number | string): Promise<PriceListLockStatusResponse> => {
    const res = await apiClient.get<PriceListLockStatusResponse>(`/price-lists/${id}/lock-status`);
    return res.data;
  },

  getVersions: async (id: number | string): Promise<PriceListVersionHistoryItem[]> => {
    const res = await apiClient.get<PriceListVersionHistoryItem[]>(`/price-lists/${id}/versions`);
    return res.data;
  },

  checkOverlap: async (
    customerGroup: string,
    validFrom: string,
    validTo?: string | null,
    excludeId?: number
  ): Promise<PriceListOverlapCheckResponse> => {
    const res = await apiClient.get<PriceListOverlapCheckResponse>('/price-lists/check-overlap', {
      params: {
        customer_group: customerGroup,
        valid_from: validFrom,
        valid_to: validTo || undefined,
        exclude_id: excludeId || undefined,
      },
    });
    return res.data;
  },

  getGroupSummary: async (): Promise<CustomerGroupSummaryResponse> => {
    const res = await apiClient.get<CustomerGroupSummaryResponse>('/price-lists/customer-groups/summary');
    return res.data;
  },

  getActiveByGroup: async (customerGroup: string, checkDate?: string): Promise<PriceList> => {
    const res = await apiClient.get<PriceList>(`/price-lists/customer-groups/${customerGroup}/active`, {
      params: { check_date: checkDate || undefined },
    });
    return res.data;
  },

  simulateOrder: async (id: number | string): Promise<PriceList> => {
    const res = await apiClient.post<PriceList>(`/price-lists/${id}/simulate-order`);
    return res.data;
  },

  lookupPrice: async (customerGroup: string, productId: string) => {
    const res = await apiClient.get('/price-lists/lookup', {
      params: { customer_group: customerGroup, product_id: productId },
    });
    return res.data;
  },
};
