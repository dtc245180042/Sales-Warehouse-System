import {
  Customer,
  CustomerFilterParams,
  CustomerPaginatedResponse,
  CustomerFilterOptions,
  SalesRep,
  CustomerAssignmentBrief,
  CustomerAssignmentHistory
} from '../types/Customer';
import { initialCustomers } from '../mock/customers';
import { getStorageItem, setStorageItem } from './storage';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'kv_customers';
let memoryCacheCustomers: Customer[] | null = null;
let lastCustomersFetchTime = 0;
const CUSTOMERS_CACHE_TTL = 45000; // 45 giây
let activeCustomersFetchPromise: Promise<Customer[]> | null = null;

let memoryCachePaginated: Record<string, CustomerPaginatedResponse> = {};
let lastPaginatedFetchTime: Record<string, number> = {};
const PAGINATED_CACHE_TTL = 45000; // 45 giây
let activePaginatedPromises: Record<string, Promise<CustomerPaginatedResponse>> = {};

let memoryCacheFilterOptions: CustomerFilterOptions | null = null;
let lastFilterOptionsTime = 0;

let memoryCacheSalesReps: SalesRep[] | null = null;
let lastSalesRepsTime = 0;

function invalidateCustomerCache() {
  memoryCachePaginated = {};
  lastPaginatedFetchTime = {};
  memoryCacheCustomers = null;
  lastCustomersFetchTime = 0;
}

function mapApiCustomer(c: any): Customer {
  return {
    id: c.id,
    code: c.code || '',
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    customer_group: c.customer_group || c.customerGroup || 'RETAIL',
    customerGroup: c.customer_group || c.customerGroup || 'RETAIL',
    tax_code: c.tax_code || c.taxCode || '',
    taxCode: c.tax_code || c.taxCode || '',
    region: c.region || '',
    assigned_sales_rep: c.assigned_sales_rep || c.assignedSalesRep || '',
    assignedSalesRep: c.assigned_sales_rep || c.assignedSalesRep || '',
    totalOrders: Number(c.totalOrders ?? c.total_orders ?? 0),
    totalSpent: Number(c.totalSpent ?? c.total_spent ?? 0),
    lastOrderDate: c.lastOrderDate || c.last_order_date || undefined,
    createdAt: c.createdAt || (c.created_at ? c.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    status: c.status || 'active',
    credit_limit: Number(c.credit_limit ?? c.creditLimit ?? 50000000),
    creditLimit: Number(c.credit_limit ?? c.creditLimit ?? 50000000),
    current_debt: Number(c.current_debt ?? c.currentDebt ?? 0),
    currentDebt: Number(c.current_debt ?? c.currentDebt ?? 0),
    max_debt_days: Number(c.max_debt_days ?? c.maxDebtDays ?? 30),
    maxDebtDays: Number(c.max_debt_days ?? c.maxDebtDays ?? 30),
    available_credit: Math.max(0, Number(c.credit_limit ?? c.creditLimit ?? 50000000) - Number(c.current_debt ?? c.currentDebt ?? 0)),
    availableCredit: Math.max(0, Number(c.credit_limit ?? c.creditLimit ?? 50000000) - Number(c.current_debt ?? c.currentDebt ?? 0)),
    risk_level: c.risk_level || c.riskLevel || 'SAFE',
    riskLevel: c.risk_level || c.riskLevel || 'SAFE',
    is_flagged: Boolean(c.is_flagged ?? c.isFlagged),
    isFlagged: Boolean(c.is_flagged ?? c.isFlagged),
    is_debt_blocked: Boolean(c.is_debt_blocked ?? c.isDebtBlocked),
    isDebtBlocked: Boolean(c.is_debt_blocked ?? c.isDebtBlocked),
    flag_reason: c.flag_reason || c.flagReason || undefined,
    flagReason: c.flag_reason || c.flagReason || undefined,
  };
}

export const customerService = {
  /** Lấy trang phân trang tức thì từ RAM cache (0ms) để không bị nhấp nháy giao diện */
  getCachedPaginated: (params?: CustomerFilterParams): CustomerPaginatedResponse | null => {
    const key = JSON.stringify(params || {});
    if (memoryCachePaginated[key]) {
      return memoryCachePaginated[key];
    }
    const defaultKey = JSON.stringify({ page: 1, page_size: 20 });
    if (memoryCachePaginated[defaultKey]) {
      return memoryCachePaginated[defaultKey];
    }
    const emptyKey = JSON.stringify({});
    if (memoryCachePaginated[emptyKey]) {
      return memoryCachePaginated[emptyKey];
    }
    return null;
  },

  /** Lấy danh sách khách hàng/đại lý tức thì từ RAM cache (0ms) */
  getCached: (): Customer[] => {
    if (memoryCacheCustomers && memoryCacheCustomers.length > 0) {
      return memoryCacheCustomers;
    }
    const cached = getStorageItem<Customer[]>(STORAGE_KEY, []);
    if (cached && cached.length > 0) {
      memoryCacheCustomers = cached;
      return cached;
    }
    return initialCustomers;
  },

  getFilterOptions: async (forceRefresh: boolean = false): Promise<CustomerFilterOptions> => {
    if (!forceRefresh && memoryCacheFilterOptions && Date.now() - lastFilterOptionsTime < 60000) {
      return memoryCacheFilterOptions;
    }
    try {
      const res = await apiClient.get('/customers/filter-options');
      if (res.data) {
        memoryCacheFilterOptions = res.data;
        lastFilterOptionsTime = Date.now();
        return res.data;
      }
    } catch (err) {
      console.warn('[customerService] Failed to load filter options from API:', err);
    }
    const fallback = {
      regions: ['Miền Bắc', 'Miền Trung', 'Miền Nam', 'Tây Nguyên'],
      customer_groups: ['TIER_1', 'TIER_2', 'WHOLESALE', 'VIP', 'RETAIL'],
      sales_reps: ['Lê Thị Nhân Viên Kinh Doanh', 'Nguyễn Văn Giám Đốc Kinh Doanh', 'Trần Quản Trị Hệ Thống'],
      statuses: ['active', 'inactive', 'locked'],
    };
    memoryCacheFilterOptions = fallback;
    lastFilterOptionsTime = Date.now();
    return fallback;
  },

  getPaginated: async (params?: CustomerFilterParams, forceRefresh: boolean = false): Promise<CustomerPaginatedResponse> => {
    const key = JSON.stringify(params || {});
    if (!forceRefresh && memoryCachePaginated[key] && Date.now() - (lastPaginatedFetchTime[key] || 0) < PAGINATED_CACHE_TTL) {
      return memoryCachePaginated[key];
    }

    if (!forceRefresh && activePaginatedPromises[key]) {
      return activePaginatedPromises[key];
    }

    const fetchPromise = (async () => {
      try {
        const res = await apiClient.get('/customers', { params });
        if (res.data && res.data.items) {
          const items = res.data.items.map(mapApiCustomer);
          const result: CustomerPaginatedResponse = {
            items,
            data: items,
            total: res.data.total,
            page: res.data.page,
            page_size: res.data.page_size,
            total_pages: res.data.total_pages,
          };
          memoryCachePaginated[key] = result;
          lastPaginatedFetchTime[key] = Date.now();
          return result;
        }
        if (Array.isArray(res.data)) {
          const items = res.data.map(mapApiCustomer);
          const result: CustomerPaginatedResponse = {
            items,
            data: items,
            total: items.length,
            page: 1,
            page_size: items.length || 10,
            total_pages: 1,
          };
          memoryCachePaginated[key] = result;
          lastPaginatedFetchTime[key] = Date.now();
          return result;
        }
      } catch (err) {
        console.warn('[customerService] Backend error, fallback to client filter:', err);
      } finally {
        delete activePaginatedPromises[key];
      }

      const all = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      let filtered = [...all];
      if (params?.search) {
        const q = params.search.toLowerCase().trim();
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            c.phone.includes(q)
        );
      }
      if (params?.region && params.region !== 'all') {
        filtered = filtered.filter((c) => c.region === params.region);
      }
      if (params?.customer_group && params.customer_group !== 'all') {
        filtered = filtered.filter((c) => c.customer_group === params.customer_group || c.customerGroup === params.customer_group);
      }
      if (params?.assigned_sales_rep && params.assigned_sales_rep !== 'all') {
        filtered = filtered.filter((c) => c.assigned_sales_rep === params.assigned_sales_rep || c.assignedSalesRep === params.assigned_sales_rep);
      }
      if (params?.status && params.status !== 'all') {
        filtered = filtered.filter((c) => c.status === params.status);
      }
      const page = params?.page || 1;
      const pageSize = params?.page_size || 10;
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      const fallbackResult: CustomerPaginatedResponse = {
        items,
        total,
        page,
        page_size: pageSize,
        total_pages: totalPages,
      };
      memoryCachePaginated[key] = fallbackResult;
      lastPaginatedFetchTime[key] = Date.now();
      return fallbackResult;
    })();

    activePaginatedPromises[key] = fetchPromise;
    return fetchPromise;
  },

  getCustomers: async (
    params?: CustomerFilterParams,
    forceRefresh: boolean = false
  ): Promise<CustomerPaginatedResponse & { data: Customer[] }> => {
    const res = await customerService.getPaginated(params, forceRefresh);
    return {
      ...res,
      data: res.items,
    };
  },

  getAll: async (
    params?: { assigned_staff_id?: string; region?: string; customer_group?: string; search?: string; status?: string },
    forceRefresh: boolean = false
  ): Promise<Customer[]> => {
    const isDefaultFetch = !params || Object.keys(params).length === 0;
    if (
      isDefaultFetch &&
      !forceRefresh &&
      memoryCacheCustomers &&
      memoryCacheCustomers.length > 0 &&
      Date.now() - lastCustomersFetchTime < CUSTOMERS_CACHE_TTL
    ) {
      return memoryCacheCustomers;
    }

    if (isDefaultFetch && activeCustomersFetchPromise && !forceRefresh) {
      return activeCustomersFetchPromise;
    }

    const fetchPromise = (async () => {
      try {
        const res = await apiClient.get('/customers', { params });
        if (Array.isArray(res.data) && res.data.length > 0) {
          const list = res.data.map(mapApiCustomer);
          if (isDefaultFetch) {
            memoryCacheCustomers = list;
            lastCustomersFetchTime = Date.now();
            if (list.length <= 300) {
              setStorageItem(STORAGE_KEY, list);
            }
          }
          return list;
        }
        if (res.data && Array.isArray(res.data.items)) {
          const list = res.data.items.map(mapApiCustomer);
          if (isDefaultFetch) {
            memoryCacheCustomers = list;
            lastCustomersFetchTime = Date.now();
          }
          return list;
        }
      } catch (err) {
        console.warn('[customerService] Backend error, fallback to storage:', err);
      } finally {
        if (isDefaultFetch) {
          activeCustomersFetchPromise = null;
        }
      }
      const fallback = customerService.getCached();
      if (isDefaultFetch) {
        lastCustomersFetchTime = Date.now();
      }
      return fallback;
    })();

    if (isDefaultFetch) {
      activeCustomersFetchPromise = fetchPromise;
    }

    return fetchPromise;
  },

  getById: async (id: string): Promise<Customer | undefined> => {
    try {
      const res = await apiClient.get(`/customers/${encodeURIComponent(id)}`);
      if (res.data) {
        return mapApiCustomer(res.data);
      }
    } catch {}
    const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
    // 1. Tìm chính xác theo id hoặc mã
    const directMatch = customers.find((c) => c.id === id || c.code === id);
    if (directMatch) return directMatch;

    // 2. Nếu id là số (ví dụ: '1' -> 'CUS-001')
    if (/^\d+$/.test(id)) {
      const paddedId = `CUS-${id.padStart(3, '0')}`;
      const numMatch = customers.find((c) => c.id === paddedId || c.code.endsWith(id));
      if (numMatch) return numMatch;
      if (customers.length > 0 && id === '1') return customers[0];
    }

    // 3. Nếu là đại lý dạng AGT-xxx, đọc từ kv_agents
    const agents = getStorageItem<any[]>('kv_agents', []);
    const agentMatch = agents.find((a) => a.id === id || a.code === id);
    if (agentMatch) {
      return {
        id: agentMatch.id,
        code: agentMatch.code,
        name: agentMatch.name,
        phone: agentMatch.phone,
        email: agentMatch.email,
        address: agentMatch.address,
        region: agentMatch.region,
        customer_group: agentMatch.customerGroup?.toUpperCase() || 'TIER_1',
        customerGroup: agentMatch.customerGroup?.toUpperCase() || 'TIER_1',
        totalOrders: agentMatch.totalOrders || 0,
        totalSpent: agentMatch.totalSpent || 0,
        status: agentMatch.status || 'active',
        createdAt: agentMatch.createdAt || '2024-01-01',
        credit_limit: agentMatch.creditLimit || 50000000,
        creditLimit: agentMatch.creditLimit || 50000000,
        current_debt: agentMatch.outstandingDebt || 0,
        currentDebt: agentMatch.outstandingDebt || 0,
        max_debt_days: agentMatch.maxDebtDays || 30,
        maxDebtDays: agentMatch.maxDebtDays || 30,
        available_credit: Math.max(0, (agentMatch.creditLimit || 50000000) - (agentMatch.outstandingDebt || 0)),
        availableCredit: Math.max(0, (agentMatch.creditLimit || 50000000) - (agentMatch.outstandingDebt || 0)),
      };
    }

    return customers[0];
  },

  create: async (data: Omit<Customer, 'id' | 'code' | 'createdAt' | 'totalOrders' | 'totalSpent'>): Promise<Customer> => {
    const payload: any = {
      name: data.name?.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      customer_group: (data.customer_group || (data as any).customerGroup || 'RETAIL').toUpperCase(),
      region: data.region?.trim() || 'Miền Bắc',
      assigned_sales_rep: data.assigned_sales_rep || (data as any).assignedSalesRep || null,
      status: data.status || 'active',
    };

    const rawTax = data.tax_code ?? (data as any).taxCode;
    if (rawTax && String(rawTax).trim()) {
      payload.tax_code = String(rawTax).trim();
    } else {
      payload.tax_code = null;
    }

    try {
      const res = await apiClient.post('/customers', payload);
      const created = mapApiCustomer(res.data);
      invalidateCustomerCache();
      const cached = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      setStorageItem(STORAGE_KEY, [created, ...cached.filter((c) => c.id !== created.id)]);
      return created;
    } catch (err: any) {
      console.error('[customerService] Lỗi khi tạo đại lý/khách hàng lên CSDL:', err);
      throw err;
    }
  },

  update: async (id: string, data: Partial<Customer>): Promise<Customer> => {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.phone !== undefined) payload.phone = data.phone.trim();
    if (data.email !== undefined) payload.email = data.email?.trim() || null;
    if (data.address !== undefined) payload.address = data.address?.trim() || null;
    if (data.customer_group !== undefined || (data as any).customerGroup !== undefined) {
      payload.customer_group = (data.customer_group || (data as any).customerGroup || 'RETAIL').toUpperCase();
    }
    const rawTax = data.tax_code ?? (data as any).taxCode;
    if (rawTax !== undefined) {
      payload.tax_code = rawTax && String(rawTax).trim() ? String(rawTax).trim() : null;
    }
    if (data.region !== undefined) payload.region = data.region;
    if (data.assigned_sales_rep !== undefined || (data as any).assignedSalesRep !== undefined) {
      payload.assigned_sales_rep = data.assigned_sales_rep ?? (data as any).assignedSalesRep ?? null;
    }
    if (data.status !== undefined) payload.status = data.status;

    try {
      const res = await apiClient.put(`/customers/${encodeURIComponent(id)}`, payload);
      const updated = mapApiCustomer(res.data);
      invalidateCustomerCache();
      const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      const idx = customers.findIndex((c) => c.id === id);
      if (idx !== -1) {
        customers[idx] = updated;
        setStorageItem(STORAGE_KEY, [...customers]);
      }
      return updated;
    } catch (err) {
      console.error('[customerService] Lỗi khi cập nhật đại lý lên CSDL:', err);
      throw err;
    }
  },

  delete: async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/customers/${encodeURIComponent(id)}`);
      invalidateCustomerCache();
      const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      setStorageItem(STORAGE_KEY, customers.filter((c) => c.id !== id));
      return true;
    } catch (err) {
      console.error('[customerService] Lỗi khi xóa đại lý trong CSDL:', err);
      throw err;
    }
  },

  getSalesReps: async (forceRefresh: boolean = false): Promise<SalesRep[]> => {
    if (!forceRefresh && memoryCacheSalesReps && Date.now() - lastSalesRepsTime < 60000) {
      return memoryCacheSalesReps;
    }
    try {
      const res = await apiClient.get('/sales-reps');
      if (Array.isArray(res.data)) {
        const reps = res.data.map((r: any) => ({
          id: String(r.id),
          username: r.username,
          fullName: r.fullName || r.full_name || r.name,
          email: r.email,
          phoneNumber: r.phoneNumber || r.phone_number,
          isActive: r.isActive ?? r.is_active ?? true,
          assignedCustomerCount: r.assignedCustomerCount ?? r.assigned_customer_count ?? 0,
        }));
        memoryCacheSalesReps = reps;
        lastSalesRepsTime = Date.now();
        return reps;
      }
    } catch (err) {
      console.warn('[customerService] Failed to load sales reps:', err);
    }
    return [];
  },

  assignCustomer: async (customerId: string, staffId: string, reason: string): Promise<any> => {
    const res = await apiClient.post(`/customers/${encodeURIComponent(customerId)}/assign`, {
      assigned_staff_id: staffId,
      reason,
    });
    invalidateCustomerCache();
    return res.data;
  },

  unassignCustomer: async (customerId: string, reason: string): Promise<any> => {
    const res = await apiClient.post(`/customers/${encodeURIComponent(customerId)}/unassign`, {
      reason,
    });
    invalidateCustomerCache();
    return res.data;
  },

  bulkTransfer: async (payload: {
    from_staff_id: string;
    to_staff_id: string;
    transfer_all: boolean;
    customer_ids: string[];
    reason: string;
  }): Promise<any> => {
    const res = await apiClient.post('/customers/assignments/bulk-transfer', payload);
    invalidateCustomerCache();
    return res.data;
  },
};
