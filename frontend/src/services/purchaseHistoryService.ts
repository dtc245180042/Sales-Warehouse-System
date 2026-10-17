// Service phân tích lịch sử mua hàng, gom nhóm ngành hàng & đơn lần trước (SCRUM-236 / SCRUM-519 / SCRUM-522)
import { Order } from '../types/Order';
import { Product } from '../types/Product';
import { User, UserRole } from '../types/User';
import {
  RecentPurchasedItem,
  StockStatus,
  PurchaseFrequency,
  CategoryGroupedHistory,
  PreviousOrderSummary,
} from '../types/PurchaseHistory';

export const purchaseHistoryService = {
  /**
   * Kiểm tra quyền xem lịch sử mua hàng của đại lý (SCRUM-522)
   * Chỉ hiển thị khi nhân viên được phân công phụ trách đại lý hoặc có vai trò quản lý.
   */
  canViewAgentPurchaseHistory: (
    user: User | null,
    assignedStaffId?: string,
    assignedStaffName?: string
  ): { allowed: boolean; reason?: string } => {
    if (!user) {
      return { allowed: false, reason: 'Chưa xác thực người dùng.' };
    }

    // Các vai trò quản trị & lãnh đạo được xem toàn bộ
    const MANAGERIAL_ROLES: UserRole[] = [
      'Admin',
      'Director',
      'SalesManager',
      'Manager',
      'WarehouseManager',
      'Accountant',
    ];

    const userRoles: UserRole[] = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const isManager = userRoles.some((r) => MANAGERIAL_ROLES.includes(r));
    if (isManager) {
      return { allowed: true };
    }

    // Nếu đại lý chưa được phân công cho ai -> cho phép xem
    if (!assignedStaffId && !assignedStaffName) {
      return { allowed: true };
    }

    // Nhân viên kinh doanh thông thường (SalesStaff, Staff): Kiểm tra khớp với nhân viên được phân công
    const isMatchId = Boolean(assignedStaffId && String(assignedStaffId) === String(user.id));
    const isMatchName = Boolean(
      assignedStaffName &&
      user.name &&
      assignedStaffName.toLowerCase().trim() === user.name.toLowerCase().trim()
    );

    if (isMatchId || isMatchName) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Bạn không được phân công phụ trách đại lý này (Người phụ trách: ${assignedStaffName || assignedStaffId || 'Nhân viên khác'}).`,
    };
  },

  /**
   * Phân tích lịch sử mua hàng của một đại lý trong N tháng gần nhất (mặc định 3 tháng)
   */
  getAgentPurchaseHistory: (
    agentId: string,
    agentCode: string | undefined,
    allOrders: Order[],
    allProducts: Product[],
    months: number = 3
  ): RecentPurchasedItem[] => {
    if (!agentId) return [];

    // 1. Lọc đơn hàng của đại lý cụ thể
    const agentOrders = allOrders.filter((order) => {
      if (order.status === 'cancelled') return false;
      return (
        order.customerId === agentId ||
        (agentCode && order.customerId === agentCode)
      );
    });

    if (agentOrders.length === 0) return [];

    // 2. Lọc theo thời gian N tháng gần nhất
    const now = new Date();
    let latestOrderTime = now.getTime();
    for (const o of agentOrders) {
      const t = new Date(o.createdAt.replace(' ', 'T')).getTime();
      if (!isNaN(t) && t > latestOrderTime) {
        latestOrderTime = t;
      }
    }

    const cutoffDate = new Date(latestOrderTime);
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    const cutoffTime = cutoffDate.getTime();

    const recentOrders = agentOrders.filter((o) => {
      const orderTime = new Date(o.createdAt.replace(' ', 'T')).getTime();
      return isNaN(orderTime) || orderTime >= cutoffTime;
    });

    const targetOrders = recentOrders.length > 0 ? recentOrders : agentOrders.slice(0, 5);

    // 3. Tổng hợp mặt hàng từ các đơn hàng
    const productStatsMap = new Map<
      string,
      {
        totalQty: number;
        orderCount: number;
        lastDate: string;
        lastPrice: number;
        lastCode: string;
        lastQty: number;
        sampleItem: Order['items'][0];
      }
    >();

    // Sắp xếp đơn theo thời gian tăng dần để đơn cuối cùng là đơn mới nhất
    const sortedOrders = [...targetOrders].sort((a, b) => {
      return (
        new Date(a.createdAt.replace(' ', 'T')).getTime() -
        new Date(b.createdAt.replace(' ', 'T')).getTime()
      );
    });

    for (const order of sortedOrders) {
      for (const item of order.items) {
        const prodKey = item.productId || item.sku;
        if (!prodKey) continue;

        const current = productStatsMap.get(prodKey);
        if (!current) {
          productStatsMap.set(prodKey, {
            totalQty: item.quantity,
            orderCount: 1,
            lastDate: order.createdAt,
            lastPrice: item.price,
            lastCode: order.code,
            lastQty: item.quantity,
            sampleItem: item,
          });
        } else {
          current.totalQty += item.quantity;
          current.orderCount += 1;
          current.lastDate = order.createdAt;
          current.lastPrice = item.price;
          current.lastCode = order.code;
          current.lastQty = item.quantity;
        }
      }
    }

    // 4. Map sang kiểu RecentPurchasedItem với thông tin sản phẩm và tính số lượng bình quân
    const result: RecentPurchasedItem[] = [];

    productStatsMap.forEach((stats, prodKey) => {
      const matchedProduct = allProducts.find(
        (p) => p.id === prodKey || p.sku === prodKey || p.sku === stats.sampleItem.sku
      );

      const avgQuantity = Math.max(1, Math.round(stats.totalQty / stats.orderCount));
      const monthlyAvg = Math.max(1, Math.round((stats.totalQty / months) * 10) / 10);

      const stock = matchedProduct?.stock ?? 50;
      let stockStatus: StockStatus = 'in_stock';
      if (stock <= 0) {
        stockStatus = 'out_of_stock';
      } else if (stock <= 10) {
        stockStatus = 'low_stock';
      }

      let purchaseFrequency: PurchaseFrequency = 'occasional';
      if (stats.orderCount >= 3) {
        purchaseFrequency = 'frequent';
      } else if (stats.orderCount >= 2) {
        purchaseFrequency = 'regular';
      }

      result.push({
        productId: matchedProduct?.id || stats.sampleItem.productId || prodKey,
        sku: matchedProduct?.sku || stats.sampleItem.sku,
        name: matchedProduct?.name || stats.sampleItem.name,
        unitPrice: matchedProduct?.salePrice || stats.lastPrice,
        image: matchedProduct?.image,
        unit: matchedProduct?.unit || 'Cái',
        stock,
        category: matchedProduct?.category || 'Khác',
        totalQuantity: stats.totalQty,
        orderCount: stats.orderCount,
        avgQuantity,
        monthlyAvg,
        lastPurchasedDate: stats.lastDate,
        lastPurchasedPrice: stats.lastPrice,
        lastOrderCode: stats.lastCode,
        lastPurchasedQty: stats.lastQty,
        stockStatus,
        purchaseFrequency,
      });
    });

    return result.sort((a, b) => {
      if (b.orderCount !== a.orderCount) {
        return b.orderCount - a.orderCount;
      }
      return b.totalQuantity - a.totalQuantity;
    });
  },

  /**
   * Gom nhóm danh sách mặt hàng đã mua theo Ngành hàng / Nhóm hàng (SCRUM-519)
   */
  groupHistoryByCategory: (items: RecentPurchasedItem[]): CategoryGroupedHistory[] => {
    const groupMap = new Map<string, RecentPurchasedItem[]>();

    items.forEach((item) => {
      const catName = item.category || 'Mặt hàng khác';
      const list = groupMap.get(catName) || [];
      list.push(item);
      groupMap.set(catName, list);
    });

    const groups: CategoryGroupedHistory[] = [];
    groupMap.forEach((catItems, categoryName) => {
      const totalQty = catItems.reduce((sum, it) => sum + it.totalQuantity, 0);
      groups.push({
        categoryName,
        items: catItems,
        totalQuantity: totalQty,
      });
    });

    // Sắp xếp nhóm có nhiều sản phẩm lên đầu
    return groups.sort((a, b) => b.items.length - a.items.length);
  },

  /**
   * Lấy danh sách các đơn hàng đã mua gần nhất của đại lý để hỗ trợ chọn nhanh (SCRUM-519)
   */
  getPreviousOrders: (
    agentId: string,
    agentCode: string | undefined,
    allOrders: Order[],
    allProducts: Product[]
  ): PreviousOrderSummary[] => {
    if (!agentId) return [];

    const agentOrders = allOrders
      .filter((order) => {
        if (order.status === 'cancelled') return false;
        return (
          order.customerId === agentId ||
          (agentCode && order.customerId === agentCode)
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt.replace(' ', 'T')).getTime() -
          new Date(a.createdAt.replace(' ', 'T')).getTime()
        );
      })
      .slice(0, 5); // Tối đa 5 đơn gần nhất

    return agentOrders.map((order) => ({
      id: order.id,
      code: order.code,
      createdAt: order.createdAt,
      total: order.total,
      status: order.status,
      items: order.items.map((it) => {
        const prod = allProducts.find(
          (p) => p.id === it.productId || p.sku === it.sku
        );
        return {
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          unit: prod?.unit || 'Cái',
          stock: prod?.stock ?? 50,
          image: prod?.image,
        };
      }),
    }));
  },
};
