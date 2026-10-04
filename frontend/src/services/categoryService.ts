import { apiClient } from '../api/client';
import {
  Category,
  CategoryTree,
  CategoryProduct,
  TransferProductsPayload,
  TransferProductsResponse,
} from '../types/Category';

export const categoryService = {
  // Lấy danh mục nhóm hàng dạng cây nhiều cấp (tối thiểu 3 cấp)
  getTree: async (): Promise<CategoryTree[]> => {
    const response = await apiClient.get('/categories/tree');
    return response.data;
  },

  // Lấy danh sách phẳng (có lọc theo parent_id, level, keyword)
  getList: async (params?: { parent_id?: number; level?: number; keyword?: string }): Promise<Category[]> => {
    const response = await apiClient.get('/categories', { params });
    return response.data;
  },

  // Xem chi tiết
  getById: async (id: number): Promise<Category> => {
    const response = await apiClient.get(`/categories/${id}`);
    return response.data;
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
    const response = await apiClient.get(`/categories/${categoryId}/products`);
    return response.data;
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
