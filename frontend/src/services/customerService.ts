import { Customer } from '../types/Customer';
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
    totalOrders: Number(c.totalOrders ?? c.total_orders ?? 0),
    totalSpent: Number(c.totalSpent ?? c.total_spent ?? 0),
    lastOrderDate: c.lastOrderDate || c.last_order_date || undefined,
    createdAt: c.createdAt || (c.created_at ? c.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    status: c.status || 'active',
  };
}

export const customerService = {
  getAll: async (): Promise<Customer[]> => {
    try {
      const res = await apiClient.get('/customers');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiCustomer);
        setStorageItem(STORAGE_KEY, list);
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
      const index = customers.findIndex((c) => c.id === id);
      if (index === -1) throw new Error('Không tìm thấy khách hàng');

      const updatedCustomer = { ...customers[index], ...data };
      customers[index] = updatedCustomer;
      setStorageItem(STORAGE_KEY, [...customers]);
      return updatedCustomer;
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
  }
};
