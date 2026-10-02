import { Supplier } from '../types/Supplier';
import { initialSuppliers } from '../mock/suppliers';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_suppliers';

export const supplierService = {
  getAll: async (): Promise<Supplier[]> => {
    await new Promise((r) => setTimeout(r, 200));
    return getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
  },

  getById: async (id: string): Promise<Supplier | undefined> => {
    await new Promise((r) => setTimeout(r, 150));
    const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
    return suppliers.find((s) => s.id === id || s.code === id);
  },

  create: async (data: Omit<Supplier, 'id' | 'code' | 'createdAt' | 'totalImports' | 'totalSpent'>): Promise<Supplier> => {
    await new Promise((r) => setTimeout(r, 300));
    const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
    const newSupplier: Supplier = {
      ...data,
      id: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
      code: `NCC-${String(suppliers.length + 1).padStart(2, '0')}`,
      totalImports: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString().split('T')[0],
      status: 'active',
    };
    const updated = [newSupplier, ...suppliers];
    setStorageItem(STORAGE_KEY, updated);
    return newSupplier;
  },

  update: async (id: string, data: Partial<Supplier>): Promise<Supplier> => {
    await new Promise((r) => setTimeout(r, 300));
    const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
    const index = suppliers.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('Không tìm thấy nhà cung cấp');

    const updated = { ...suppliers[index], ...data };
    suppliers[index] = updated;
    setStorageItem(STORAGE_KEY, [...suppliers]);
    return updated;
  },

  delete: async (id: string): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 200));
    const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
    const filtered = suppliers.filter((s) => s.id !== id);
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  }
};
