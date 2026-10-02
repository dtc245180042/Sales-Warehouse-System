import { Product } from '../types/Product';
import { initialProducts } from '../mock/products';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_products';

export const productService = {
  getAll: async (): Promise<Product[]> => {
    await new Promise((r) => setTimeout(r, 200));
    let products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    // Sync: remove any products deleted from mock data (e.g. removed from initialProducts)
    const validIds = new Set(initialProducts.map((p) => p.id));
    const synced = products.filter((p) => validIds.has(p.id));
    if (synced.length !== products.length) {
      setStorageItem(STORAGE_KEY, synced);
    }
    return synced;
  },

  getById: async (id: string): Promise<Product | undefined> => {
    await new Promise((r) => setTimeout(r, 150));
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    return products.find((p) => p.id === id);
  },

  create: async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
    await new Promise((r) => setTimeout(r, 300));
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    const newProduct: Product = {
      ...data,
      id: `PRD-${String(products.length + 1).padStart(3, '0')}`,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    const updated = [newProduct, ...products];
    setStorageItem(STORAGE_KEY, updated);
    return newProduct;
  },

  update: async (id: string, data: Partial<Product>): Promise<Product> => {
    await new Promise((r) => setTimeout(r, 300));
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Không tìm thấy sản phẩm');

    const updatedProduct = {
      ...products[index],
      ...data,
      updatedAt: new Date().toISOString().split('T')[0],
    };
    products[index] = updatedProduct;
    setStorageItem(STORAGE_KEY, [...products]);
    return updatedProduct;
  },

  delete: async (id: string): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 250));
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    const filtered = products.filter((p) => p.id !== id);
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  },

  bulkDelete: async (ids: string[]): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 350));
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    const filtered = products.filter((p) => !ids.includes(p.id));
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  },

  updateStock: async (id: string, delta: number): Promise<Product> => {
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Không tìm thấy sản phẩm');

    const newStock = Math.max(0, products[index].stock + delta);
    let newStatus = products[index].status;
    if (newStock === 0) newStatus = 'out_of_stock';
    else if (newStock <= products[index].minStock) newStatus = 'low_stock';
    else newStatus = 'active';

    products[index] = {
      ...products[index],
      stock: newStock,
      status: newStatus,
      updatedAt: new Date().toISOString().split('T')[0],
    };

    setStorageItem(STORAGE_KEY, [...products]);
    return products[index];
  }
};
