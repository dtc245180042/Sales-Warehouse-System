import { Customer } from '../types/Customer';
import { initialCustomers } from '../mock/customers';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_customers';

export const customerService = {
  getAll: async (): Promise<Customer[]> => {
    await new Promise((r) => setTimeout(r, 200));
    return getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
  },

  getById: async (id: string): Promise<Customer | undefined> => {
    await new Promise((r) => setTimeout(r, 150));
    const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
    return customers.find((c) => c.id === id || c.code === id);
  },

  create: async (data: Omit<Customer, 'id' | 'code' | 'createdAt' | 'totalOrders' | 'totalSpent'>): Promise<Customer> => {
    await new Promise((r) => setTimeout(r, 300));
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
    const updated = [newCustomer, ...customers];
    setStorageItem(STORAGE_KEY, updated);
    return newCustomer;
  },

  update: async (id: string, data: Partial<Customer>): Promise<Customer> => {
    await new Promise((r) => setTimeout(r, 300));
    const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
    const index = customers.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Không tìm thấy khách hàng');

    const updatedCustomer = { ...customers[index], ...data };
    customers[index] = updatedCustomer;
    setStorageItem(STORAGE_KEY, [...customers]);
    return updatedCustomer;
  },

  delete: async (id: string): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 200));
    const customers = getStorageItem<Customer[]>(STORAGE_KEY, initialCustomers);
    const filtered = customers.filter((c) => c.id !== id);
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  }
};
