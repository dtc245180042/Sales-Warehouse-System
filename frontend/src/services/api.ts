import axios from 'axios';
import {
  ProductItem,
  initialMockProducts,
  UserOrder,
  initialMockOrders,
  UserNotification,
  initialMockNotifications,
  UserProfileData,
  initialUserProfile,
  CartItem,
  OrderItemRecord,
} from '../data/mockData';
import { validateVNPhoneNumber } from '../utils/phoneUtils';

// Create base Axios instance (ready for real backend URL)
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('kv_auth_token') ||
    localStorage.getItem('user_token') ||
    localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Storage keys for mock persistence
const STORAGE_KEYS = {
  PRODUCTS: 'salepro_user_products',
  ORDERS: 'salepro_user_orders',
  NOTIFICATIONS: 'salepro_user_notifications',
  PROFILE: 'salepro_user_profile',
  CART: 'salepro_user_cart',
};

// Helper storage functions
const getStored = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const setStored = <T>(key: string, val: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('Storage write error', e);
  }
};

// Simulating API network delay
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = {
  // ===================== PRODUCTS =====================
  products: {
    getAll: async (params?: {
      search?: string;
      category?: string;
      stockStatus?: string;
      sortBy?: string;
      page?: number;
      limit?: number;
    }): Promise<{ products: ProductItem[]; total: number; page: number; totalPages: number }> => {
      let list = getStored<ProductItem[]>(STORAGE_KEYS.PRODUCTS, initialMockProducts);
      try {
        const res = await apiClient.get('/products');
        if (Array.isArray(res.data) && res.data.length > 0) {
          list = res.data.map((p: any) => ({
            id: p.id,
            code: p.sku || p.code || p.id,
            name: p.name,
            category: p.category,
            price: Number(p.salePrice ?? p.sale_price ?? 0),
            originalPrice: Number(p.salePrice ?? p.sale_price ?? 0) * 1.1,
            stock: Number(p.stock ?? 0),
            unit: p.unit || 'Chiếc',
            image: (p.image && !p.image.includes('/images/products/') && !p.image.includes('placeholder')) ? (p.image || p.image_url || p.imageUrl || '') : '',
            description: p.description || '',
            rating: 4.8,
            reviewsCount: 15,
            isNew: false,
            isHot: true,
          }));
          setStored(STORAGE_KEYS.PRODUCTS, list);
        }
      } catch {
        // Fallback to cached products
      }
      if (!list || list.length === 0) {
        list = initialMockProducts;
        setStored(STORAGE_KEYS.PRODUCTS, list);
      }

      const { search = '', category = 'Tất cả danh mục', stockStatus = 'all', sortBy = 'default', page = 1, limit = 8 } = params || {};

      let filtered = [...list];

      // Search keyword
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        filtered = filtered.filter(
          (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        );
      }

      // Filter category
      if (category && category !== 'Tất cả danh mục') {
        filtered = filtered.filter((p) => p.category === category);
      }

      // Filter stock status
      if (stockStatus && stockStatus !== 'all') {
        if (stockStatus === 'in_stock') filtered = filtered.filter((p) => p.stock > 10);
        else if (stockStatus === 'low_stock') filtered = filtered.filter((p) => p.stock > 0 && p.stock <= 10);
        else if (stockStatus === 'out_of_stock') filtered = filtered.filter((p) => p.stock === 0);
      }

      // Sort
      if (sortBy === 'price_asc') {
        filtered.sort((a, b) => a.price - b.price);
      } else if (sortBy === 'price_desc') {
        filtered.sort((a, b) => b.price - a.price);
      } else if (sortBy === 'name_asc') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === 'stock_desc') {
        filtered.sort((a, b) => b.stock - a.stock);
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      return { products: paginated, total, page, totalPages };
    },

    getById: async (id: string): Promise<ProductItem> => {
      await delay(150);
      const list = getStored<ProductItem[]>(STORAGE_KEYS.PRODUCTS, initialMockProducts);
      const found = list.find((p) => p.id === id || p.code === id);
      if (!found) {
        throw new Error('Sản phẩm không tồn tại trong hệ thống.');
      }
      return found;
    },
  },

  // ===================== CART =====================
  cart: {
    get: async (): Promise<CartItem[]> => {
      let cart = getStored<CartItem[]>(STORAGE_KEYS.CART, []);
      if (cart && cart.some((i) => i.product.id === 'PRD-001' || i.product.code === 'SP-ANK-737')) {
        cart = cart.filter((i) => i.product.id !== 'PRD-001' && i.product.code !== 'SP-ANK-737');
        setStored(STORAGE_KEYS.CART, cart);
      }
      return cart;
    },

    add: async (product: ProductItem, quantity = 1): Promise<CartItem[]> => {
      await delay(100);
      const cart = getStored<CartItem[]>(STORAGE_KEYS.CART, []);
      const idx = cart.findIndex((item) => item.product.id === product.id);

      if (idx > -1) {
        const newQty = cart[idx].quantity + quantity;
        if (newQty > product.stock) {
          throw new Error(`Kho chỉ còn ${product.stock} sản phẩm.`);
        }
        cart[idx].quantity = newQty;
      } else {
        if (quantity > product.stock) {
          throw new Error(`Kho chỉ còn ${product.stock} sản phẩm.`);
        }
        cart.push({ product, quantity });
      }

      setStored(STORAGE_KEYS.CART, cart);
      return cart;
    },

    updateQuantity: async (productId: string, quantity: number): Promise<CartItem[]> => {
      await delay(100);
      let cart = getStored<CartItem[]>(STORAGE_KEYS.CART, []);
      if (quantity <= 0) {
        cart = cart.filter((item) => item.product.id !== productId);
      } else {
        const idx = cart.findIndex((item) => item.product.id === productId);
        if (idx > -1) {
          if (quantity > cart[idx].product.stock) {
            throw new Error(`Số lượng vượt quá tồn kho (${cart[idx].product.stock} cái).`);
          }
          cart[idx].quantity = quantity;
        }
      }
      setStored(STORAGE_KEYS.CART, cart);
      return cart;
    },

    remove: async (productId: string): Promise<CartItem[]> => {
      await delay(100);
      const cart = getStored<CartItem[]>(STORAGE_KEYS.CART, []).filter((item) => item.product.id !== productId);
      setStored(STORAGE_KEYS.CART, cart);
      return cart;
    },

    clear: async (): Promise<void> => {
      setStored(STORAGE_KEYS.CART, []);
    },
  },

  // ===================== ORDERS =====================
  orders: {
    getAll: async (params?: {
      status?: string;
      search?: string;
      staffId?: string;
    }): Promise<UserOrder[]> => {
      let list = getStored<UserOrder[]>(STORAGE_KEYS.ORDERS, initialMockOrders);
      try {
        const res = await apiClient.get('/orders');
        if (Array.isArray(res.data) && res.data.length > 0) {
          list = res.data.map((o: any) => ({
            id: o.id,
            code: o.code,
            customerId: o.customerId || o.customer_id,
            customerName: o.customerName || o.customer_name,
            customerPhone: o.customerPhone || o.customer_phone,
            customerEmail: 'customer@warehouse.local',
            customerAddress: o.customerAddress || o.customer_address || '',
            items: (o.items || []).map((itm: any) => ({
              productId: itm.productId || itm.product_id,
              productName: itm.name,
              productCode: itm.sku,
              quantity: Number(itm.quantity || 1),
              price: Number(itm.price || 0),
              subtotal: Number(itm.subtotal || 0),
            })),
            subtotal: Number(o.subtotal || 0),
            discount: Number(o.discount || 0),
            tax: Number(o.tax || 0),
            total: Number(o.total || 0),
            paidAmount: Number(o.paidAmount ?? o.paid_amount ?? 0),
            changeAmount: Number(o.changeAmount ?? o.change_amount ?? 0),
            paymentMethod: o.paymentMethod || o.payment_method || 'transfer',
            paymentStatus: o.paymentStatus || o.payment_status || 'paid',
            status: o.status || 'pending',
            staffId: o.staffId || o.staff_id || 'USR-004',
            staffName: o.staffName || o.staff_name || '',
            note: o.note || '',
            createdAt: o.createdAt || (o.created_at ? o.created_at.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16)),
            updatedAt: o.updatedAt || (o.updated_at ? o.updated_at.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16)),
          }));
          setStored(STORAGE_KEYS.ORDERS, list);
        }
      } catch {
        // Fallback
      }
      if (!list || list.length === 0) {
        list = initialMockOrders;
        setStored(STORAGE_KEYS.ORDERS, list);
      }

      const { status = 'all', search = '', staffId = 'USR-004' } = params || {};

      // User role restriction: only show orders created by this user
      let filtered = list.filter((ord) => ord.staffId === staffId);

      if (status && status !== 'all') {
        filtered = filtered.filter((ord) => ord.status === status);
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        filtered = filtered.filter(
          (ord) =>
            ord.code.toLowerCase().includes(q) ||
            ord.customerName.toLowerCase().includes(q) ||
            ord.customerPhone.includes(q)
        );
      }

      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    getById: async (id: string, staffId = 'USR-004'): Promise<UserOrder> => {
      await delay(150);
      const list = getStored<UserOrder[]>(STORAGE_KEYS.ORDERS, initialMockOrders);
      const found = list.find((o) => o.id === id || o.code === id);
      if (!found) {
        throw new Error('Đơn hàng không tồn tại.');
      }
      // Security check: staff can only view their own orders
      if (found.staffId !== staffId) {
        throw new Error('Bạn không có quyền truy cập đơn hàng của nhân viên khác.');
      }
      return found;
    },

    create: async (data: {
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      customerAddress: string;
      items: OrderItemRecord[];
      subtotal: number;
      discount: number;
      tax: number;
      total: number;
      paymentMethod: 'cash' | 'transfer' | 'e_wallet';
      notes?: string;
    }): Promise<UserOrder> => {
      await delay(500);
      const list = getStored<UserOrder[]>(STORAGE_KEYS.ORDERS, initialMockOrders);

      const now = new Date();
      const orderCount = list.length + 1;
      const orderCode = `HD-2026-${String(orderCount).padStart(3, '0')}`;
      const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const newOrder: UserOrder = {
        id: `ORD-${Date.now()}`,
        code: orderCode,
        createdAt: dateFormatted,
        staffId: 'USR-004',
        staffName: 'Nguyễn Văn A',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || 'Chưa cập nhật',
        customerAddress: data.customerAddress,
        items: data.items,
        subtotal: data.subtotal,
        discount: data.discount,
        tax: data.tax,
        total: data.total,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentMethod === 'cash' ? 'unpaid' : 'paid',
        status: 'confirmed',
        notes: data.notes || '',
        timeline: [
          { status: 'created', title: 'Đã tạo đơn hàng', time: dateFormatted, completed: true },
          { status: 'confirmed', title: 'Đã xác nhận đơn hàng', time: dateFormatted, completed: true, current: true },
          { status: 'processing', title: 'Đang chuẩn bị hàng tại kho', completed: false },
          { status: 'completed', title: 'Hoàn thành giao hàng', completed: false },
        ],
      };

      const updated = [newOrder, ...list];
      setStored(STORAGE_KEYS.ORDERS, updated);

      // Decrement product stock in inventory
      const products = getStored<ProductItem[]>(STORAGE_KEYS.PRODUCTS, initialMockProducts);
      data.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        if (prod) {
          prod.stock = Math.max(0, prod.stock - item.quantity);
          prod.soldCount += item.quantity;
          if (prod.stock === 0) prod.status = 'out_of_stock';
          else if (prod.stock <= 10) prod.status = 'low_stock';
        }
      });
      setStored(STORAGE_KEYS.PRODUCTS, products);

      // Clear cart
      setStored(STORAGE_KEYS.CART, []);

      // Auto create notification
      const notifs = getStored<UserNotification[]>(STORAGE_KEYS.NOTIFICATIONS, initialMockNotifications);
      notifs.unshift({
        id: `NOTIF-${Date.now()}`,
        title: `Tạo đơn hàng ${orderCode} thành công`,
        message: `Đơn hàng trị giá ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(newOrder.total)} đã được chuyển tới bộ phận kho vận.`,
        type: 'order_confirmed',
        createdAt: 'Vừa xong',
        isRead: false,
        orderId: newOrder.id,
      });
      setStored(STORAGE_KEYS.NOTIFICATIONS, notifs);

      // Update user today's stats
      const profile = getStored<UserProfileData>(STORAGE_KEYS.PROFILE, initialUserProfile);
      profile.todayOrdersCount += 1;
      profile.monthlyOrdersCount += 1;
      profile.personalRevenue += newOrder.total;
      profile.productsSoldCount += data.items.reduce((acc, it) => acc + it.quantity, 0);
      setStored(STORAGE_KEYS.PROFILE, profile);

      return newOrder;
    },
  },

  // ===================== NOTIFICATIONS =====================
  notifications: {
    getAll: async (): Promise<UserNotification[]> => {
      await delay(150);
      return getStored<UserNotification[]>(STORAGE_KEYS.NOTIFICATIONS, initialMockNotifications);
    },

    markAsRead: async (id: string): Promise<UserNotification[]> => {
      const list = getStored<UserNotification[]>(STORAGE_KEYS.NOTIFICATIONS, initialMockNotifications);
      const updated = list.map((n) => (n.id === id ? { ...n, isRead: true } : n));
      setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
      return updated;
    },

    markAllAsRead: async (): Promise<UserNotification[]> => {
      const list = getStored<UserNotification[]>(STORAGE_KEYS.NOTIFICATIONS, initialMockNotifications);
      const updated = list.map((n) => ({ ...n, isRead: true }));
      setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
      return updated;
    },

    delete: async (id: string): Promise<UserNotification[]> => {
      const list = getStored<UserNotification[]>(STORAGE_KEYS.NOTIFICATIONS, initialMockNotifications);
      const updated = list.filter((n) => n.id !== id);
      setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
      return updated;
    },
  },

  // ===================== PROFILE & USER =====================
  user: {
    getProfile: async (): Promise<UserProfileData> => {
      await delay(150);
      return getStored<UserProfileData>(STORAGE_KEYS.PROFILE, initialUserProfile);
    },

    updateProfile: async (data: { name: string; email: string; phone: string; avatar?: string }): Promise<UserProfileData> => {
      await delay(300);
      const trimmedName = data.name ? data.name.trim() : '';
      if (!trimmedName || trimmedName.length < 2) {
        throw new Error('Họ và tên không được để trống (tối thiểu 2 ký tự).');
      }
      const phoneVal = validateVNPhoneNumber(data.phone);
      if (!phoneVal.valid) {
        throw new Error(phoneVal.message || 'Số điện thoại không hợp lệ.');
      }

      const current = getStored<UserProfileData>(STORAGE_KEYS.PROFILE, initialUserProfile);
      const updated: UserProfileData = {
        ...current,
        name: trimmedName,
        phone: phoneVal.normalized || data.phone.trim(),
        avatar: data.avatar || current.avatar,
      };
      setStored(STORAGE_KEYS.PROFILE, updated);
      return updated;
    },

    changePassword: async (currentPass: string, newPass: string, revokeOthers = true): Promise<void> => {
      await delay(400);
      if (!currentPass) {
        throw new Error('Vui lòng nhập mật khẩu hiện tại.');
      }
      if (newPass.length < 8) {
        throw new Error('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      }
      if (!/[a-zA-Z]/.test(newPass) || !/[0-9]/.test(newPass)) {
        throw new Error('Mật khẩu mới phải bao gồm cả chữ cái và chữ số.');
      }
      if (newPass === currentPass) {
        throw new Error('Mật khẩu mới không được trùng với mật khẩu cũ.');
      }

      if (revokeOthers) {
        localStorage.setItem('user_token', `token-salepro-${Date.now()}`);
        localStorage.setItem('user_sessions_revoked_at', new Date().toISOString());
      }
    },
  },
};

// Export mockUserApi wrapper for consistent axios-like response format
export const mockUserApi = {
  getProducts: async (params?: any) => {
    const res = await api.products.getAll(params);
    return { data: { success: true, data: res.products, total: res.total, totalPages: res.totalPages } };
  },
  getProductById: async (id: string) => {
    const data = await api.products.getById(id);
    return { data: { success: true, data } };
  },
  getOrders: async (params?: any) => {
    const list = await api.orders.getAll(params);
    // Enrich with orderNumber and createdByName for component compatibility
    const enriched = list.map(o => ({
      ...o,
      orderNumber: o.code,
      createdByName: o.staffName || 'Nguyễn Văn A'
    }));
    return { data: { success: true, data: enriched } };
  },
  getOrderById: async (id: string) => {
    const data = await api.orders.getById(id);
    const enriched = {
      ...data,
      orderNumber: data.code,
      createdByName: data.staffName || 'Nguyễn Văn A'
    };
    return { data: { success: true, data: enriched } };
  },
  createOrder: async (payload: any) => {
    const created = await api.orders.create({
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      customerAddress: payload.customerAddress,
      items: payload.items.map((it: any) => ({
        productId: it.productId,
        productCode: it.sku || it.productCode || 'SP-GEN',
        name: it.productName || it.name,
        price: it.price,
        quantity: it.quantity,
        image: it.image || '',
        subtotal: it.total || it.price * it.quantity
      })),
      subtotal: payload.subtotal,
      discount: payload.discount,
      tax: payload.tax,
      total: payload.total,
      paymentMethod: payload.paymentMethod === 'ewallet' ? 'e_wallet' : payload.paymentMethod,
      notes: payload.notes
    });

    const enriched = {
      ...created,
      orderNumber: created.code,
      createdByName: created.staffName || 'Nguyễn Văn A'
    };
    return { data: { success: true, data: enriched } };
  },
  getNotifications: async () => {
    const list = await api.notifications.getAll();
    return { data: { success: true, data: list } };
  },
  markNotificationAsRead: async (id: string) => {
    const list = await api.notifications.markAsRead(id);
    return { data: { success: true, data: list } };
  },
  markAllNotificationsAsRead: async () => {
    const list = await api.notifications.markAllAsRead();
    return { data: { success: true, data: list } };
  },
  deleteNotification: async (id: string) => {
    const list = await api.notifications.delete(id);
    return { data: { success: true, data: list } };
  },
  getProfile: async () => {
    const data = await api.user.getProfile();
    return { data: { success: true, data } };
  },
  updateProfile: async (updated: any) => {
    const data = await api.user.updateProfile(updated);
    return { data: { success: true, data } };
  },
  changePassword: async ({ currentPassword, newPassword, revokeOtherSessions }: any) => {
    await api.user.changePassword(currentPassword, newPassword, revokeOtherSessions);
    return { data: { success: true, message: 'Đổi mật khẩu thành công!' } };
  }
};
