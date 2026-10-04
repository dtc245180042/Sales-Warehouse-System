import { Product } from '../types/Product';
import { initialProducts } from '../mock/products';
import { getStorageItem, setStorageItem } from './storage';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'kv_products';

function mapApiProduct(p: any): Product {
  return {
    id: p.id,
    sku: p.sku || '',
    barcode: p.barcode || '',
    name: p.name || '',
    category: p.category || 'Khác',
    supplierId: p.supplierId || p.supplier_id || '',
    supplierName: p.supplierName || p.supplier_name || '',
    costPrice: Number(p.costPrice ?? p.cost_price ?? 0),
    salePrice: Number(p.salePrice ?? p.sale_price ?? 0),
    stock: Number(p.stock ?? 0),
    minStock: Number(p.minStock ?? p.min_stock ?? 5),
    unit: p.unit || 'Chiếc',
    image: p.image || '/images/products/placeholder.jpg',
    description: p.description || '',
    status: p.status || 'active',
    createdAt: p.createdAt || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    updatedAt: p.updatedAt || (p.updated_at ? p.updated_at.split('T')[0] : new Date().toISOString().split('T')[0]),
  };
}

export const productService = {
  getAll: async (): Promise<Product[]> => {
    try {
      const res = await apiClient.get('/products');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiProduct);
        setStorageItem(STORAGE_KEY, list);
        return list;
      }
    } catch (err) {
      console.warn('[productService] Backend API offline hoặc lỗi, sử dụng bộ nhớ cục bộ:', err);
    }
    return getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
  },

  getById: async (id: string): Promise<Product | undefined> => {
    try {
      const res = await apiClient.get(`/products/${encodeURIComponent(id)}`);
      if (res.data) {
        return mapApiProduct(res.data);
      }
    } catch {
      // Dự phòng từ cache nếu lỗi mạng
    }
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    return products.find((p) => p.id === id || p.sku === id);
  },

  create: async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
    try {
      const payload = {
        sku: data.sku,
        barcode: data.barcode,
        name: data.name,
        category: data.category,
        supplier_id: data.supplierId,
        supplier_name: data.supplierName,
        cost_price: data.costPrice,
        sale_price: data.salePrice,
        stock: data.stock,
        min_stock: data.minStock,
        unit: data.unit,
        image: data.image,
        description: data.description,
        status: data.status,
      };
      const res = await apiClient.post('/products', payload);
      const created = mapApiProduct(res.data);
      const cached = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      setStorageItem(STORAGE_KEY, [created, ...cached]);
      return created;
    } catch (err) {
      console.warn('[productService] Backend error, fallback to local creation:', err);
      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const newProduct: Product = {
        ...data,
        id: `PRD-${String(products.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
      };
      setStorageItem(STORAGE_KEY, [newProduct, ...products]);
      return newProduct;
    }
  },

  update: async (id: string, data: Partial<Product>): Promise<Product> => {
    try {
      const payload: any = {};
      if (data.sku !== undefined) payload.sku = data.sku;
      if (data.barcode !== undefined) payload.barcode = data.barcode;
      if (data.name !== undefined) payload.name = data.name;
      if (data.category !== undefined) payload.category = data.category;
      if (data.supplierId !== undefined) payload.supplier_id = data.supplierId;
      if (data.supplierName !== undefined) payload.supplier_name = data.supplierName;
      if (data.costPrice !== undefined) payload.cost_price = data.costPrice;
      if (data.salePrice !== undefined) payload.sale_price = data.salePrice;
      if (data.stock !== undefined) payload.stock = data.stock;
      if (data.minStock !== undefined) payload.min_stock = data.minStock;
      if (data.unit !== undefined) payload.unit = data.unit;
      if (data.image !== undefined) payload.image = data.image;
      if (data.description !== undefined) payload.description = data.description;
      if (data.status !== undefined) payload.status = data.status;

      const res = await apiClient.put(`/products/${encodeURIComponent(id)}`, payload);
      const updated = mapApiProduct(res.data);

      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const idx = products.findIndex((p) => p.id === id);
      if (idx !== -1) {
        products[idx] = updated;
        setStorageItem(STORAGE_KEY, [...products]);
      }
      return updated;
    } catch (err) {
      console.warn('[productService] Backend error, fallback to local update:', err);
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
    }
  },

  delete: async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/products/${encodeURIComponent(id)}`);
    } catch (err) {
      console.warn('[productService] Backend error, deleting locally:', err);
    }
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    setStorageItem(STORAGE_KEY, products.filter((p) => p.id !== id));
    return true;
  },

  bulkDelete: async (ids: string[]): Promise<boolean> => {
    for (const id of ids) {
      try {
        await apiClient.delete(`/products/${encodeURIComponent(id)}`);
      } catch (e) {
        console.warn(e);
      }
    }
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    setStorageItem(STORAGE_KEY, products.filter((p) => !ids.includes(p.id)));
    return true;
  },

  updateStock: async (id: string, delta: number): Promise<Product> => {
    try {
      const res = await apiClient.patch(`/products/${encodeURIComponent(id)}/stock`, { delta });
      const updated = mapApiProduct(res.data);
      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const idx = products.findIndex((p) => p.id === id);
      if (idx !== -1) {
        products[idx] = updated;
        setStorageItem(STORAGE_KEY, [...products]);
      }
      return updated;
    } catch (err) {
      console.warn('[productService] Backend error, fallback to local stock calculation:', err);
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
  },
};
