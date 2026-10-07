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
    categoryId: p.categoryId ?? p.category_id ?? undefined,
    supplierId: p.supplierId || p.supplier_id || '',
    supplierName: p.supplierName || p.supplier_name || '',
    costPrice: Number(p.costPrice ?? p.cost_price ?? 0),
    salePrice: Number(p.salePrice ?? p.sale_price ?? 0),
    stock: Number(p.stock ?? 0),
    minStock: Number(p.minStock ?? p.min_stock ?? 5),
    unit: p.unit || 'Chiếc',
    packagingSpecification: p.packagingSpecification || p.packaging_specification || '1 chiếc/hộp',
    image: p.image || p.image_url || p.imageUrl || '/images/products/placeholder.jpg',
    description: p.description || '',
    status: p.status || 'active',
    hasTransactions: Boolean(p.hasTransactions ?? p.has_transactions ?? false),
    createdAt: p.createdAt || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    updatedAt: p.updatedAt || (p.updated_at ? p.updated_at.split('T')[0] : new Date().toISOString().split('T')[0]),
  };
}

export const productService = {
  getAll: async (): Promise<Product[]> => {
    try {
      const res = await apiClient.get('/products');
      const rawList = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.items) ? res.data.items : null);
      if (rawList && rawList.length > 0) {
        const list = rawList.map(mapApiProduct);
        setStorageItem(STORAGE_KEY, list);
        return list;
      }
    } catch (err) {
      console.warn('[productService] Backend API offline hoặc lỗi, sử dụng bộ nhớ cục bộ:', err);
    }
    return getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
  },

  getById: async (id: string): Promise<Product | undefined> => {
    const strId = String(id).trim();
    try {
      const res = await apiClient.get(`/products/${encodeURIComponent(strId)}`);
      if (res.data) {
        return mapApiProduct(res.data);
      }
    } catch {
      // Dự phòng từ cache nếu lỗi mạng
    }
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    return products.find(
      (p) => String(p.id).trim() === strId || p.sku.trim().toUpperCase() === strId.toUpperCase()
    );
  },

  create: async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
    const cleanSku = data.sku.trim().toUpperCase();
    const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    const existingSku = products.find((p) => p.sku.trim().toUpperCase() === cleanSku);
    if (existingSku) {
      throw new Error(`Mã SKU "${cleanSku}" đã tồn tại trong danh mục sản phẩm.`);
    }

    try {
      const payload = {
        sku: cleanSku,
        barcode: data.barcode,
        name: data.name,
        category: data.category,
        category_id: data.categoryId ?? (data as any).category_id,
        supplier_id: data.supplierId,
        supplier_name: data.supplierName,
        cost_price: Number(data.costPrice || 0),
        sale_price: Number(data.salePrice || 0),
        price: Number(data.salePrice || 0),
        stock: Number(data.stock || 0),
        min_stock: Number(data.minStock || 0),
        unit: data.unit,
        packaging_spec: data.packagingSpecification || '1 chiếc/hộp',
        packaging_specification: data.packagingSpecification || '1 chiếc/hộp',
        image: data.image,
        image_url: data.image,
        description: data.description || '',
        status: (data.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      };
      const res = await apiClient.post('/products', payload);
      const created = mapApiProduct(res.data);
      const cached = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      setStorageItem(STORAGE_KEY, [created, ...cached]);
      return created;
    } catch (err: any) {
      if (err.response) {
        const detail = err.response.data?.detail;
        let errorMsg = 'Máy chủ từ chối yêu cầu tạo sản phẩm';
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        }
        throw new Error(errorMsg);
      }
      console.warn('[productService] Backend offline, fallback to local creation:', err);
      const newProduct: Product = {
        ...data,
        sku: cleanSku,
        packagingSpecification: data.packagingSpecification || '1 chiếc/hộp',
        hasTransactions: false,
        id: `PRD-${String(products.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
      };
      setStorageItem(STORAGE_KEY, [newProduct, ...products]);
      return newProduct;
    }
  },

  update: async (id: string, data: Partial<Product>): Promise<Product> => {
    const strId = String(id).trim();
    if (data.sku) {
      const cleanSku = data.sku.trim().toUpperCase();
      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      // Chỉ báo trùng SKU nếu có sản phẩm KHÁC sở hữu SKU này
      const existingSku = products.find(
        (p) => String(p.id).trim() !== strId && p.sku.trim().toUpperCase() === cleanSku
      );
      if (existingSku) {
        throw new Error(`Mã SKU "${cleanSku}" đã được sử dụng bởi sản phẩm khác.`);
      }
      data.sku = cleanSku;
    }

    try {
      const payload: any = {};
      if (data.sku !== undefined) payload.sku = data.sku;
      if (data.barcode !== undefined) payload.barcode = data.barcode;
      if (data.name !== undefined) payload.name = data.name;
      if (data.category !== undefined) payload.category = data.category;
      if (data.categoryId !== undefined) payload.category_id = data.categoryId;
      if (data.supplierId !== undefined) payload.supplier_id = data.supplierId;
      if (data.supplierName !== undefined) payload.supplier_name = data.supplierName;
      if (data.costPrice !== undefined) payload.cost_price = Number(data.costPrice);
      if (data.salePrice !== undefined) {
        payload.sale_price = Number(data.salePrice);
        payload.price = Number(data.salePrice);
      }
      if (data.stock !== undefined) payload.stock = Number(data.stock);
      if (data.minStock !== undefined) payload.min_stock = Number(data.minStock);
      if (data.unit !== undefined) payload.unit = data.unit;
      if (data.packagingSpecification !== undefined) {
        payload.packaging_spec = data.packagingSpecification;
        payload.packaging_specification = data.packagingSpecification;
      }
      if (data.image !== undefined) {
        payload.image = data.image;
        payload.image_url = data.image;
      }
      if (data.description !== undefined) payload.description = data.description;
      if (data.status !== undefined) {
        payload.status = String(data.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
      }

      const res = await apiClient.put(`/products/${encodeURIComponent(strId)}`, payload);
      const updated = mapApiProduct(res.data);

      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const idx = products.findIndex((p) => String(p.id).trim() === strId);
      if (idx !== -1) {
        products[idx] = updated;
        setStorageItem(STORAGE_KEY, [...products]);
      }
      return updated;
    } catch (err: any) {
      if (err.response) {
        const detail = err.response.data?.detail;
        let errorMsg = 'Máy chủ từ chối yêu cầu cập nhật sản phẩm';
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        }
        throw new Error(errorMsg);
      }
      console.warn('[productService] Backend error, fallback to local update:', err);
      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const index = products.findIndex((p) => String(p.id).trim() === strId);
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
    const strId = String(id).trim();
    const products = await productService.getAll();
    const target = products.find((p) => String(p.id).trim() === strId);
    if (target?.hasTransactions) {
      throw new Error(
        `Sản phẩm "${target.name}" (${target.sku}) đã phát sinh giao dịch, không thể xóa. Vui lòng chuyển sang ngừng kinh doanh.`
      );
    }

    try {
      await apiClient.delete(`/products/${encodeURIComponent(strId)}`);
    } catch (err) {
      console.warn('[productService] Backend error, deleting locally:', err);
    }
    const cached = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    setStorageItem(STORAGE_KEY, cached.filter((p) => String(p.id).trim() !== strId));
    return true;
  },

  bulkDelete: async (ids: string[]): Promise<boolean> => {
    const strIds = ids.map((i) => String(i).trim());
    const products = await productService.getAll();
    const hasTx = products.filter((p) => strIds.includes(String(p.id).trim()) && p.hasTransactions);
    if (hasTx.length > 0) {
      throw new Error(
        `Có ${hasTx.length} sản phẩm đã phát sinh giao dịch, không thể xóa. Vui lòng chuyển sang ngừng kinh doanh.`
      );
    }

    for (const id of strIds) {
      try {
        await apiClient.delete(`/products/${encodeURIComponent(id)}`);
      } catch (e) {
        console.warn(e);
      }
    }
    const cached = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
    setStorageItem(STORAGE_KEY, cached.filter((p) => !strIds.includes(String(p.id).trim())));
    return true;
  },

  deactivateProduct: async (id: string): Promise<Product> => {
    return productService.update(id, { status: 'inactive' });
  },

  updateStock: async (id: string, delta: number): Promise<Product> => {
    const strId = String(id).trim();
    try {
      const res = await apiClient.patch(`/products/${encodeURIComponent(strId)}/stock`, { delta });
      const updated = mapApiProduct(res.data);
      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const idx = products.findIndex((p) => String(p.id).trim() === strId);
      if (idx !== -1) {
        products[idx] = updated;
        setStorageItem(STORAGE_KEY, [...products]);
      }
      return updated;
    } catch (err) {
      console.warn('[productService] Backend error, fallback to local stock calculation:', err);
      const products = getStorageItem<Product[]>(STORAGE_KEY, initialProducts);
      const index = products.findIndex((p) => String(p.id).trim() === strId);
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
