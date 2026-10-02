export interface RevenueMonthPoint {
  month: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface DailyPoint {
  day: string;
  revenue: number;
  orders: number;
}

export const monthlyRevenueData: RevenueMonthPoint[] = [
  { month: 'T10/25', revenue: 420000000, profit: 98000000, orders: 112 },
  { month: 'T11/25', revenue: 510000000, profit: 125000000, orders: 135 },
  { month: 'T12/25', revenue: 680000000, profit: 172000000, orders: 189 },
  { month: 'T1/26', revenue: 590000000, profit: 145000000, orders: 154 },
  { month: 'T2/26', revenue: 480000000, profit: 110000000, orders: 128 },
  { month: 'T3/26', revenue: 620000000, profit: 155000000, orders: 165 },
  { month: 'T4/26', revenue: 580000000, profit: 138000000, orders: 149 },
  { month: 'T5/26', revenue: 710000000, profit: 180000000, orders: 192 },
  { month: 'T6/26', revenue: 790000000, profit: 210000000, orders: 215 },
  { month: 'T7/26', revenue: 840000000, profit: 228000000, orders: 230 },
  { month: 'T8/26', revenue: 920000000, profit: 255000000, orders: 260 },
  { month: 'T9/26', revenue: 985000000, profit: 275000000, orders: 284 },
];

export const dailyRevenueData: DailyPoint[] = [
  { day: '25/09', revenue: 42500000, orders: 11 },
  { day: '26/09', revenue: 38200000, orders: 9 },
  { day: '27/09', revenue: 51000000, orders: 14 },
  { day: '28/09', revenue: 64800000, orders: 18 },
  { day: '29/09', revenue: 59400000, orders: 15 },
  { day: '30/09', revenue: 78500000, orders: 22 },
  { day: '01/10', revenue: 86450000, orders: 25 },
];

export const categoryDistribution = [
  { name: 'Điện Thoại & Tablet', value: 38, color: '#4f46e5' },
  { name: 'Laptop & Máy Tính', value: 28, color: '#06b6d4' },
  { name: 'Phụ Kiện', value: 16, color: '#10b981' },
  { name: 'Âm Thanh', value: 10, color: '#f59e0b' },
  { name: 'Gia Dụng & Mạng', value: 8, color: '#ec4899' },
];

export const recentActivities = [
  { id: 'ACT-01', user: 'Nhân Viên', action: 'Hoàn tất đơn hàng DH-2026-004', time: '10 phút trước', type: 'order' },
  { id: 'ACT-02', user: 'Quản Lý', action: 'Xác nhận đơn hàng doanh nghiệp DH-2026-003', time: '45 phút trước', type: 'order' },
  { id: 'ACT-03', user: 'Quản Trị', action: 'Cập nhật giá bán sỉ cho nhóm laptop Dell', time: '2 giờ trước', type: 'product' },
  { id: 'ACT-04', user: 'Đặng Tuấn Anh', action: 'Nhập kho phiếu PNK-2026-001 (50 sản phẩm)', time: '3 giờ trước', type: 'inventory' },
  { id: 'ACT-05', user: 'Hệ thống tự động', action: 'Cảnh báo tồn kho: Chuột Logitech Brio 4K chỉ còn 1 cái', time: '4 giờ trước', type: 'alert' },
];
