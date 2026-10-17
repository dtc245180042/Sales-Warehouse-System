import { apiClient } from '../api/client';
import {
  Category,
  CategoryTree,
  CategoryProduct,
  TransferProductsPayload,
  TransferProductsResponse,
} from '../types/Category';

const DEFAULT_CATEGORIES: Category[] = [];

function buildMockTree(categories: Category[]): CategoryTree[] {
  const map: Record<number, CategoryTree> = {};
  categories.forEach((c) => {
    map[c.id] = { ...c, children: [] };
  });
  const roots: CategoryTree[] = [];
  categories.forEach((c) => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

let memoryCacheCategoryTree: CategoryTree[] | null = null;
let memoryCacheCategories: Category[] | null = null;
let lastTreeFetchTime = 0;
let lastListFetchTime = 0;
const CATEGORIES_CACHE_TTL = 60000; // 60 giây

export const categoryService = {
  /** Lấy cây danh mục tức thì từ RAM cache (0ms) */
  getCachedTree: (): CategoryTree[] => {
    if (memoryCacheCategoryTree && memoryCacheCategoryTree.length > 0) {
      return memoryCacheCategoryTree;
    }
    const mock = buildMockTree(DEFAULT_CATEGORIES);
    memoryCacheCategoryTree = mock;
    return mock;
  },

  /** Lấy danh sách phẳng danh mục tức thì từ RAM cache (0ms) */
  getCachedList: (): Category[] => {
    if (memoryCacheCategories && memoryCacheCategories.length > 0) {
      return memoryCacheCategories;
    }
    memoryCacheCategories = DEFAULT_CATEGORIES;
    return DEFAULT_CATEGORIES;
  },

  // Lấy danh mục nhóm hàng dạng cây nhiều cấp (tối thiểu 3 cấp)
  getTree: async (forceRefresh: boolean = false): Promise<CategoryTree[]> => {
    if (!forceRefresh && memoryCacheCategoryTree && memoryCacheCategoryTree.length > 0 && Date.now() - lastTreeFetchTime < CATEGORIES_CACHE_TTL) {
      return memoryCacheCategoryTree;
    }
    try {
      const response = await apiClient.get('/categories/tree');
      if (Array.isArray(response.data) && response.data.length > 0) {
        memoryCacheCategoryTree = response.data;
        lastTreeFetchTime = Date.now();
        return response.data;
      }
    } catch (err) {
      console.warn('[categoryService] Backend API offline hoặc lỗi, sử dụng cây danh mục mẫu:', err);
    }
    const fallback = buildMockTree(DEFAULT_CATEGORIES);
    memoryCacheCategoryTree = fallback;
    lastTreeFetchTime = Date.now();
    return fallback;
  },

  // Lấy danh sách phẳng (có lọc theo parent_id, level, keyword)
  getList: async (
    params?: { parent_id?: number; level?: number; keyword?: string },
    forceRefresh: boolean = false
  ): Promise<Category[]> => {
    const isDefault = !params || Object.keys(params).length === 0;
    if (isDefault && !forceRefresh && memoryCacheCategories && memoryCacheCategories.length > 0 && Date.now() - lastListFetchTime < CATEGORIES_CACHE_TTL) {
      return memoryCacheCategories;
    }
    try {
      const response = await apiClient.get('/categories', { params });
      if (Array.isArray(response.data) && response.data.length > 0) {
        if (isDefault) {
          memoryCacheCategories = response.data;
          lastListFetchTime = Date.now();
        }
        return response.data;
      }
    } catch (err) {
      console.warn('[categoryService] Backend API offline hoặc lỗi, sử dụng danh mục mẫu:', err);
    }
    let list = [...DEFAULT_CATEGORIES];
    if (params?.parent_id !== undefined) {
      list = list.filter((c) => c.parent_id === params.parent_id);
    }
    if (params?.level !== undefined) {
      list = list.filter((c) => c.level === params.level);
    }
    if (params?.keyword) {
      const kw = params.keyword.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(kw) || c.code.toLowerCase().includes(kw));
    }
    if (isDefault) {
      memoryCacheCategories = list;
      lastListFetchTime = Date.now();
    }
    return list;
  },

  // Xem chi tiết
  getById: async (id: number): Promise<Category> => {
    try {
      const response = await apiClient.get(`/categories/${id}`);
      if (response.data) {
        return response.data;
      }
    } catch {
      // Fallback
    }
    const found = DEFAULT_CATEGORIES.find((c) => c.id === id);
    if (found) return found;
    throw new Error(`Không tìm thấy nhóm hàng có ID ${id}`);
  },

  // Thêm mới
  create: async (data: {
    code: string;
    name: string;
    description?: string;
    parent_id?: number | null;
    is_active?: boolean;
  }): Promise<Category> => {
    const response = await apiClient.post('/categories', data);
    return response.data;
  },

  // Cập nhật
  update: async (
    id: number,
    data: {
      code?: string;
      name?: string;
      description?: string;
      parent_id?: number | null;
      is_active?: boolean;
    }
  ): Promise<Category> => {
    const response = await apiClient.put(`/categories/${id}`, data);
    return response.data;
  },

  // Xóa có kiểm tra bảo vệ (chặn xóa nếu còn sản phẩm hoặc nhóm con)
  delete: async (id: number): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/categories/${id}`);
    return response.data;
  },

  // Lấy danh sách sản phẩm trong nhóm
  getProducts: async (categoryId: number): Promise<CategoryProduct[]> => {
    try {
      const response = await apiClient.get(`/categories/${categoryId}/products`);
      if (Array.isArray(response.data)) {
        return response.data;
      }
    } catch (err) {
      console.warn('[categoryService] Backend API offline hoặc lỗi khi lấy sản phẩm theo nhóm:', err);
    }
    return [];
  },

  // Chuyển sản phẩm giữa các nhóm hàng
  transferProducts: async (payload: TransferProductsPayload): Promise<TransferProductsResponse> => {
    const response = await apiClient.post('/categories/transfer-products', payload);
    return response.data;
  },

  // Tạo thêm sản phẩm nhanh phục vụ test
  createProduct: async (data: {
    sku: string;
    name: string;
    category_id: number;
    price: number;
    unit?: string;
    description?: string;
  }): Promise<CategoryProduct> => {
    const response = await apiClient.post('/categories/products', data);
    return response.data;
  },

  // Khởi tạo cây danh mục mẫu
  seedSamples: async (): Promise<any> => {
    const response = await apiClient.post('/categories/seed-samples');
    return response.data;
  },
};
