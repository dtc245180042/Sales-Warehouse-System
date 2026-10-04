import { Supplier } from '../types/Supplier';
import { initialSuppliers } from '../mock/suppliers';
import { getStorageItem, setStorageItem } from './storage';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'kv_suppliers';

function mapApiSupplier(s: any): Supplier {
  return {
    id: s.id,
    code: s.code || '',
    name: s.name || '',
    contactPerson: s.contactPerson || s.contact_person || '',
    phone: s.phone || '',
    email: s.email || '',
    address: s.address || '',
    totalImports: Number(s.totalImports ?? s.total_imports ?? 0),
    totalSpent: Number(s.totalSpent ?? s.total_spent ?? 0),
    createdAt: s.createdAt || (s.created_at ? s.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    status: s.status || 'active',
  };
}

export const supplierService = {
  getAll: async (): Promise<Supplier[]> => {
    try {
      const res = await apiClient.get('/suppliers');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiSupplier);
        setStorageItem(STORAGE_KEY, list);
        return list;
      }
    } catch (err) {
      console.warn('[supplierService] Backend error, fallback to storage:', err);
    }
    return getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
  },

  getById: async (id: string): Promise<Supplier | undefined> => {
    try {
      const res = await apiClient.get(`/suppliers/${encodeURIComponent(id)}`);
      if (res.data) {
        return mapApiSupplier(res.data);
      }
    } catch {}
    const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
    return suppliers.find((s) => s.id === id || s.code === id);
  },

  create: async (data: Omit<Supplier, 'id' | 'code' | 'createdAt' | 'totalImports' | 'totalSpent'>): Promise<Supplier> => {
    try {
      const payload = {
        name: data.name,
        contact_person: data.contactPerson,
        phone: data.phone,
        email: data.email,
        address: data.address,
        status: data.status,
      };
      const res = await apiClient.post('/suppliers', payload);
      const created = mapApiSupplier(res.data);
      const cached = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
      setStorageItem(STORAGE_KEY, [created, ...cached]);
      return created;
    } catch (err) {
      console.warn('[supplierService] Backend error, fallback to local create:', err);
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
      setStorageItem(STORAGE_KEY, [newSupplier, ...suppliers]);
      return newSupplier;
    }
  },

  update: async (id: string, data: Partial<Supplier>): Promise<Supplier> => {
    try {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.contactPerson !== undefined) payload.contact_person = data.contactPerson;
      if (data.phone !== undefined) payload.phone = data.phone;
      if (data.email !== undefined) payload.email = data.email;
      if (data.address !== undefined) payload.address = data.address;
      if (data.status !== undefined) payload.status = data.status;

      const res = await apiClient.put(`/suppliers/${encodeURIComponent(id)}`, payload);
      const updated = mapApiSupplier(res.data);
      const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
      const idx = suppliers.findIndex((s) => s.id === id);
      if (idx !== -1) {
        suppliers[idx] = updated;
        setStorageItem(STORAGE_KEY, [...suppliers]);
      }
      return updated;
    } catch (err) {
      console.warn('[supplierService] Backend error, fallback to local update:', err);
      const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
      const index = suppliers.findIndex((s) => s.id === id);
      if (index === -1) throw new Error('Không tìm thấy nhà cung cấp');

      const updatedSupplier = { ...suppliers[index], ...data };
      suppliers[index] = updatedSupplier;
      setStorageItem(STORAGE_KEY, [...suppliers]);
      return updatedSupplier;
    }
  },

  delete: async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/suppliers/${encodeURIComponent(id)}`);
    } catch (e) {
      console.warn(e);
    }
    const suppliers = getStorageItem<Supplier[]>(STORAGE_KEY, initialSuppliers);
    const filtered = suppliers.filter((s) => s.id !== id);
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  }
};
