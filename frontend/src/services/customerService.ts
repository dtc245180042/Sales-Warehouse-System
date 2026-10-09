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
    assignedStaffId: c.assignedStaffId || (c.assigned_staff_id ? String(c.assigned_staff_id) : undefined),
    assignedStaffName: c.assignedStaffName || c.assigned_staff_name || undefined,
    assignedStaffPhone: c.assignedStaffPhone || c.assigned_staff_phone || undefined,
    assignedAt: c.assignedAt || c.assigned_at || undefined,
  };
}

export const customerService = {
  getFilterOptions: async (): Promise<CustomerFilterOptions> => {
    try {
      const res = await apiClient.get('/customers/filter-options');
      if (res.data) {
        return res.data;
      }
    } catch (err) {
      console.warn('[customerService] Failed to load filter options from API:', err);
    }
    return {
      regions: ['Miền Bắc', 'Miền Trung', 'Miền Nam', 'Tây Nguyên'],
      customer_groups: ['TIER_1', 'TIER_2', 'WHOLESALE', 'VIP', 'RETAIL'],
      sales_reps: ['Lê Thị Nhân Viên Kinh Doanh', 'Nguyễn Văn Giám Đốc Kinh Doanh', 'Trần Quản Trị Hệ Thống'],
      statuses: ['active', 'inactive', 'locked'],
    };
  },

  getPaginated: async (params?: CustomerFilterParams): Promise<CustomerPaginatedResponse> => {
    try {
      const res = await apiClient.get('/customers', { params });
      if (res.data && res.data.items) {
        const items = res.data.items.map(mapApiCustomer);
        return {
          items,
          total: res.data.total,
          page: res.data.page,
          page_size: res.data.page_size,
          total_pages: res.data.total_pages,
        };
      }
      if (Array.isArray(res.data)) {
        const items = res.data.map(mapApiCustomer);
        return {
          items,
          total: items.length,
          page: 1,
          page_size: items.length || 10,
          total_pages: 1,
        };
      }
    } catch (err) {
      console.warn('[customerService] Backend error, fallback to client filter:', err);
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
    return {
      items,
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
    };
  },

  getAll: async (params?: { assigned_staff_id?: string; region?: string; customer_group?: string; search?: string; status?: string }): Promise<Customer[]> => {
    try {
      const res = await apiClient.get('/customers', { params });
      if (Array.isArray(res.data)) {
        const list = res.data.map(mapApiCustomer);
        setStorageItem(STORAGE_KEY, list);
        return list;
      }
      if (res.data && Array.isArray(res.data.items)) {
        const list = res.data.items.map(mapApiCustomer);
        return list;
      }
    } catch (err) {
      console.warn('[customerService] Backend error, fallback to storage:', err);
    }
    return getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
  },

  getById: async (id: string): Promise<Customer | undefined> => {
    try {
      const res = await apiClient.get(`/customers/${encodeURIComponent(id)}`);
      if (res.data) {
        return mapApiCustomer(res.data);
      }
    } catch {}
    const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
    return customers.find((c) => c.id === id || c.code === id);
  },

  create: async (data: Omit<Customer, 'id' | 'code' | 'createdAt' | 'totalOrders' | 'totalSpent'>): Promise<Customer> => {
    try {
      const res = await apiClient.post('/customers', data);
      const created = mapApiCustomer(res.data);
      const cached = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      setStorageItem(STORAGE_KEY, [created, ...cached]);
      return created;
    } catch (err) {
      console.warn('[customerService] Backend error, fallback to local create:', err);
      const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      const newCustomer: Customer = {
        ...data,
        id: `CUS-${String(customers.length + 1).padStart(3, '0')}`,
        code: `KH-${1000 + customers.length + 1}`,
        totalOrders: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString().split('T')[0],
        status: 'active',
      };
      setStorageItem(STORAGE_KEY, [newCustomer, ...customers]);
      return newCustomer;
    }
  },

  update: async (id: string, data: Partial<Customer>): Promise<Customer> => {
    try {
      const res = await apiClient.put(`/customers/${encodeURIComponent(id)}`, data);
      const updated = mapApiCustomer(res.data);
      const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      const idx = customers.findIndex((c) => c.id === id);
      if (idx !== -1) {
        customers[idx] = updated;
        setStorageItem(STORAGE_KEY, [...customers]);
      }
      return updated;
    } catch (err) {
      console.warn('[customerService] Backend error, fallback to local update:', err);
      const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
      const idx = customers.findIndex((c) => c.id === id);
      if (idx !== -1) {
        const updated = { ...customers[idx], ...data };
        customers[idx] = updated;
        setStorageItem(STORAGE_KEY, [...customers]);
        return updated;
      }
      throw new Error('Customer not found');
    }
  },

  delete: async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/customers/${encodeURIComponent(id)}`);
    } catch (e) {
      console.warn(e);
    }
    const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
    const filtered = customers.filter((c) => c.id !== id);
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  },

  getSalesReps: async (): Promise<SalesRep[]> => {
    try {
      const res = await apiClient.get('/sales-reps');
      if (Array.isArray(res.data)) {
        return res.data.map((r: any) => ({
          id: String(r.id),
          username: r.username,
          fullName: r.fullName || r.full_name || r.username,
          email: r.email,
          phoneNumber: r.phoneNumber || r.phone_number,
          isActive: r.isActive ?? r.is_active ?? true,
          assignedCustomerCount: Number(r.assignedCustomerCount ?? r.assigned_customer_count ?? 0),
        }));
      }
    } catch (err) {
      console.warn('[customerService] Error fetching sales-reps:', err);
    }
    return [];
  },

  assignCustomer: async (customerId: string, assignedStaffId: string, reason: string): Promise<CustomerAssignmentBrief> => {
    const res = await apiClient.post(`/customers/${encodeURIComponent(customerId)}/assign`, {
      assigned_staff_id: assignedStaffId,
      reason,
    });
    return res.data;
  },

  unassignCustomer: async (customerId: string, reason: string): Promise<CustomerAssignmentBrief> => {
    const res = await apiClient.post(`/customers/${encodeURIComponent(customerId)}/unassign`, {
      reason,
    });
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
    return res.data;
  },

  getAssignmentHistory: async (customerId: string): Promise<CustomerAssignmentHistory[]> => {
    try {
      const res = await apiClient.get(`/customers/${encodeURIComponent(customerId)}/assignment-history`);
      if (Array.isArray(res.data)) {
        return res.data.map((h: any) => ({
          id: h.id,
          batchId: h.batchId || h.batch_id,
          customerId: h.customerId || h.customer_id,
          customerName: h.customerName || h.customer_name,
          fromStaffId: h.fromStaffId || h.from_staff_id,
          fromStaffName: h.fromStaffName || h.from_staff_name,
          toStaffId: h.toStaffId || h.to_staff_id,
          toStaffName: h.toStaffName || h.to_staff_name,
          actionType: h.actionType || h.action_type,
          reason: h.reason,
          performedBy: h.performedBy || h.performed_by,
          createdAt: h.createdAt || h.created_at,
        }));
      }
    } catch (err) {
      console.warn('[customerService] Error fetching assignment history:', err);
    }
    return [];
  },

  getAssignment: async (customerId: string): Promise<CustomerAssignmentBrief | null> => {
    try {
      const res = await apiClient.get(`/customers/${encodeURIComponent(customerId)}/assignment`);
      return res.data;
    } catch (err) {
      console.warn('[customerService] Error fetching assignment:', err);
      return null;
    }
  }
};
