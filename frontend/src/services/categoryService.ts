import { apiClient } from '../api/client';
import {
  Category,
  CategoryTree,
  CategoryProduct,
  TransferProductsPayload,
  TransferProductsResponse,
} from '../types/Category';
import { initialProducts } from '../mock/products';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 1, code: 'DIEN_TU', name: 'Thiết bị điện tử & Viễn thông', level: 1, parent_id: null, is_active: true, products_count: 19 },
  { id: 2, code: 'GIA_DUNG', name: 'Điện gia dụng & Nhà bếp', level: 1, parent_id: null, is_active: true, products_count: 6 },
  { id: 3, code: 'DIEN_THOAI_MTB', name: 'Điện thoại & Máy tính bảng', level: 2, parent_id: 1, is_active: true, products_count: 6 },
  { id: 4, code: 'LAPTOP_PC', name: 'Máy tính & Thiết bị IT', level: 2, parent_id: 1, is_active: true, products_count: 10 },
  { id: 11, code: 'AUDIO_ACCESSORIES', name: 'Âm thanh & Phụ kiện công nghệ', level: 2, parent_id: 1, is_active: true, products_count: 6 },
  { id: 12, code: 'NETWORK_SMART', name: 'Thiết bị mạng & Nhà thông minh', level: 2, parent_id: 1, is_active: true, products_count: 3 },
  { id: 5, code: 'NHA_BEP', name: 'Thiết bị nấu nướng nhà bếp', level: 2, parent_id: 2, is_active: true, products_count: 2 },
  { id: 13, code: 'GIA_DUNG_SMART', name: 'Thiết bị gia dụng & Đời sống', level: 2, parent_id: 2, is_active: true, products_count: 4 },
  { id: 6, code: 'SMARTPHONE', name: 'Điện thoại thông minh (Smartphones)', level: 3, parent_id: 3, is_active: true, products_count: 3 },
  { id: 7, code: 'TABLET', name: 'Máy tính bảng (Tablets)', level: 3, parent_id: 3, is_active: true, products_count: 1 },
  { id: 14, code: 'SMARTWATCH', name: 'Đồng hồ & Vòng đeo tay thông minh', level: 3, parent_id: 3, is_active: true, products_count: 2 },
  { id: 8, code: 'LAPTOP_GAMING', name: 'Laptop Gaming đồ họa', level: 3, parent_id: 4, is_active: true, products_count: 1 },
  { id: 15, code: 'LAPTOP_ULTRABOOK', name: 'Laptop mỏng nhẹ & Ultrabook', level: 3, parent_id: 4, is_active: true, products_count: 2 },
  { id: 16, code: 'PERIPHERALS', name: 'Bàn phím, Chuột & Thiết bị ngoại vi', level: 3, parent_id: 4, is_active: true, products_count: 4 },
  { id: 17, code: 'MONITORS', name: 'Màn hình & Thiết bị hiển thị', level: 3, parent_id: 4, is_active: true, products_count: 2 },
  { id: 18, code: 'STORAGE', name: 'Ổ cứng & Thiết bị lưu trữ', level: 3, parent_id: 4, is_active: true, products_count: 1 },
  { id: 19, code: 'HEADPHONES', name: 'Tai nghe & Headphone', level: 3, parent_id: 11, is_active: true, products_count: 3 },
  { id: 20, code: 'SPEAKERS', name: 'Loa Bluetooth & Soundbar', level: 3, parent_id: 11, is_active: true, products_count: 2 },
  { id: 21, code: 'CHARGERS', name: 'Củ sạc, Cáp sạc & Trạm sạc', level: 3, parent_id: 11, is_active: true, products_count: 1 },
  { id: 22, code: 'ROUTERS_MESH', name: 'Router WiFi & Hệ thống Mesh', level: 3, parent_id: 12, is_active: true, products_count: 2 },
  { id: 23, code: 'CAMERAS_SECURITY', name: 'Camera AI & Thiết bị an ninh', level: 3, parent_id: 12, is_active: true, products_count: 1 },
  { id: 9, code: 'NOI_CHIEN', name: 'Nồi chiên không dầu & Lò nướng', level: 3, parent_id: 5, is_active: true, products_count: 1 },
  { id: 10, code: 'BEP_TU', name: 'Bếp từ & Bếp hồng ngoại', level: 3, parent_id: 5, is_active: true, products_count: 1 },
  { id: 24, code: 'ROBOT_VACUUMS', name: 'Robot hút bụi & Lau nhà thông minh', level: 3, parent_id: 13, is_active: true, products_count: 2 },
  { id: 25, code: 'AIR_PURIFIERS', name: 'Máy lọc không khí & Tạo ẩm', level: 3, parent_id: 13, is_active: true, products_count: 1 },
  { id: 26, code: 'SMART_LIGHTING', name: 'Đèn & Chiếu sáng thông minh', level: 3, parent_id: 13, is_active: true, products_count: 1 },
];

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

export const categoryService = {
  // Lấy danh mục nhóm hàng dạng cây nhiều cấp (tối thiểu 3 cấp)
  getTree: async (): Promise<CategoryTree[]> => {
    try {
      const response = await apiClient.get('/categories/tree');
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data;
      }
    } catch (err) {
      console.warn('[categoryService] Backend API offline hoặc lỗi, sử dụng cây danh mục mẫu:', err);
    }
    return buildMockTree(DEFAULT_CATEGORIES);
  },

  // Lấy danh sách phẳng (có lọc theo parent_id, level, keyword)
  getList: async (params?: { parent_id?: number; level?: number; keyword?: string }): Promise<Category[]> => {
    try {
      const response = await apiClient.get('/categories', { params });
      if (Array.isArray(response.data) && response.data.length > 0) {
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
      console.warn('[categoryService] Backend API offline hoặc lỗi, sử dụng sản phẩm mẫu theo nhóm:', err);
    }
    return initialProducts
      .filter((p) => p.categoryId === categoryId)
      .map((p, idx) => ({
        id: parseInt(p.id.replace(/\D/g, '') || String(idx + 1)),
        sku: p.sku,
        name: p.name,
        category_id: p.categoryId,
        category_name: p.category,
        price: p.salePrice,
        unit: p.unit,
        description: p.description,
        is_active: p.status === 'active',
      }));
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
