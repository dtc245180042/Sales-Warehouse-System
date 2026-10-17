// Kiểu dữ liệu cho Lịch sử mua hàng gần đây & Số lượng bình quân (SCRUM-236 / SCRUM-519)

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type PurchaseFrequency = 'frequent' | 'regular' | 'occasional';

export interface RecentPurchasedItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  image?: string;
  unit: string;
  stock: number;
  category?: string;

  // Thống kê lịch sử trong 3 tháng gần nhất
  totalQuantity: number;       // Tổng số lượng đã mua trong kỳ
  orderCount: number;          // Số đơn hàng có mua sản phẩm này
  avgQuantity: number;         // Số lượng bình quân mỗi đơn (làm tròn)
  monthlyAvg: number;          // Số lượng bình quân mỗi tháng
  lastPurchasedDate: string;   // Ngày mua gần nhất (YYYY-MM-DD hoặc YYYY-MM-DD HH:mm)
  lastPurchasedPrice: number;  // Đơn giá tại lần mua gần nhất
  lastOrderCode: string;       // Mã đơn hàng gần nhất
  lastPurchasedQty: number;    // Số lượng ở lần mua gần nhất

  // Trạng thái phục vụ quyết định nhập đơn nhanh
  stockStatus: StockStatus;
  purchaseFrequency: PurchaseFrequency;
}

// Gom nhóm theo ngành hàng / nhóm hàng (SCRUM-519)
export interface CategoryGroupedHistory {
  categoryName: string;
  items: RecentPurchasedItem[];
  totalQuantity: number;
}

// Tóm tắt đơn hàng đã mua lần trước (SCRUM-519)
export interface PreviousOrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  unit: string;
  stock: number;
  image?: string;
}

export interface PreviousOrderSummary {
  id: string;
  code: string;
  createdAt: string;
  total: number;
  status: string;
  items: PreviousOrderItem[];
}

export interface PurchaseHistoryFilter {
  search?: string;
  timeRangeMonths?: number;    // Mặc định 3 tháng
  frequency?: 'all' | PurchaseFrequency;
  stockStatus?: 'all' | StockStatus;
}
