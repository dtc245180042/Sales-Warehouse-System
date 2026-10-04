// Mock data for User / Nhân viên bán hàng portal
export interface ProductItem {
  id: string;
  code: string;
  sku?: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image: string;
  unit: string;
  description: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  rating: number;
  soldCount: number;
}

export interface CartItem {
  product: ProductItem;
  quantity: number;
}

export interface OrderItemRecord {
  productId: string;
  productCode?: string;
  sku?: string;
  name?: string;
  productName?: string;
  price: number;
  quantity: number;
  image?: string;
  subtotal?: number;
  total?: number;
}

export type OrderStatusType = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'transfer' | 'e_wallet' | 'ewallet';

export interface UserOrder {
  id: string;
  code: string;
  orderNumber?: string;
  createdAt: string;
  staffId: string;
  staffName: string;
  createdByName?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: OrderItemRecord[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'paid' | 'unpaid';
  status: OrderStatusType;
  notes?: string;
  timeline?: {
    status?: string;
    title: string;
    time?: string;
    desc?: string;
    completed?: boolean;
    current?: boolean;
  }[];
}

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  isRead: boolean;
  orderId?: string;
  link?: string;
}

export interface UserProfileData {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  roleTitle?: string;
  roleName?: string;
  department?: string;
  employeeId?: string;
  employeeCode?: string;
  avatar: string;
  createdAt?: string;
  joinedDate?: string;
  todayOrdersCount?: number;
  monthlyOrdersCount?: number;
  personalRevenue?: number;
  productsSoldCount?: number;
  storeInfo?: {
    name: string;
    address: string;
    phone: string;
    manager: string;
  };
}

export const mockCategories = [
  'Tất cả danh mục',
  'Điện thoại & Phụ kiện',
  'Laptop & Máy tính',
  'Thiết bị âm thanh',
  'Phụ kiện sạc & cáp',
  'Linh kiện mạng & lưu trữ',
];

export const initialMockProducts: ProductItem[] = [
  {
    id: 'PRD-002',
    code: 'SP-LOG-MX3S',
    name: 'Chuột Không Dây Logitech MX Master 3S Quiet',
    category: 'Laptop & Máy tính',
    price: 2450000,
    originalPrice: 2690000,
    stock: 35,
    image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=80',
    unit: 'Cái',
    description: 'Chuột công thái học cao cấp với switch bấm êm giảm 90% tiếng ồn, cảm biến 8000 DPI trên mọi bề mặt kính, con cuộn siêu nhanh MagSpeed cuộn 1000 dòng/giây.',
    status: 'in_stock',
    rating: 4.8,
    soldCount: 98,
  },
  {
    id: 'PRD-003',
    code: 'SP-SNY-XM5',
    name: 'Tai Nghe Chống Ồn Sony WH-1000XM5 Không Dây',
    category: 'Thiết bị âm thanh',
    price: 7990000,
    originalPrice: 8490000,
    stock: 12,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80',
    unit: 'Chiếc',
    description: 'Tai nghe chụp tai hàng đầu với 2 bộ xử lý và 8 micro chống ồn đỉnh cao, chất âm chuẩn Hi-Res Audio, thời lượng pin 30 giờ và công nghệ đàm thoại khử gió sắc nét.',
    status: 'in_stock',
    rating: 5.0,
    soldCount: 65,
  },
  {
    id: 'PRD-004',
    code: 'SP-APL-AIR3',
    name: 'Tai Nghe Apple AirPods 3 MagSafe Charging Case',
    category: 'Thiết bị âm thanh',
    price: 4390000,
    originalPrice: 4790000,
    stock: 18,
    image: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=500&auto=format&fit=crop&q=80',
    unit: 'Bộ',
    description: 'Âm thanh không gian cá nhân hóa với theo dõi chuyển động đầu động lực, kháng mồ hôi và nước IPX4, thời lượng nghe lên đến 30 giờ kết hợp hộp sạc MagSafe.',
    status: 'in_stock',
    rating: 4.7,
    soldCount: 210,
  },
  {
    id: 'PRD-005',
    code: 'SP-SAM-T71T',
    name: 'Ổ Cứng SSD Di Động Samsung T7 Shield 1TB Chống Nước',
    category: 'Linh kiện mạng & lưu trữ',
    price: 2890000,
    originalPrice: 3150000,
    stock: 6,
    image: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80',
    unit: 'Cái',
    description: 'Tốc độ đọc ghi lên tới 1.050MB/s, vỏ cao su chịu va đập rơi từ 3m, chuẩn kháng bụi nước IP65 bảo vệ dữ liệu tối ưu trong mọi điều kiện di chuyển.',
    status: 'low_stock',
    rating: 4.9,
    soldCount: 54,
  },
  {
    id: 'PRD-006',
    code: 'SP-DEL-U2723',
    name: 'Màn Hình Dell UltraSharp U2723QE 27 inch 4K IPS Black',
    category: 'Laptop & Máy tính',
    price: 13900000,
    originalPrice: 14500000,
    stock: 0,
    image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=80',
    unit: 'Chiếc',
    description: 'Màn hình chuyên đồ họa công nghệ IPS Black cho tỷ lệ tương phản 2000:1, độ phân giải 4K UHD, kết nối cổng USB-C Hub 90W truyền hình ảnh và sạc một cáp duy nhất.',
    status: 'out_of_stock',
    rating: 4.9,
    soldCount: 43,
  },
  {
    id: 'PRD-007',
    code: 'SP-UGR-65W',
    name: 'Củ Sạc Nhanh Ugreen GaN 65W 3 Cổng Type-C Nexode',
    category: 'Phụ kiện sạc & cáp',
    price: 650000,
    originalPrice: 750000,
    stock: 45,
    image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500&auto=format&fit=crop&q=80',
    unit: 'Cái',
    description: 'Củ sạc công nghệ GaN siêu nhỏ gọn, sạc nhanh đồng thời laptop, điện thoại và máy tính bảng với công nghệ phân phối dòng điện thông minh Power Dispenser.',
    status: 'in_stock',
    rating: 4.8,
    soldCount: 320,
  },
  {
    id: 'PRD-008',
    code: 'SP-KCH-K2PR',
    name: 'Bàn Phím Cơ Không Dây Keychron K2 Pro QMK/VIA Hot-swap',
    category: 'Laptop & Máy tính',
    price: 2350000,
    originalPrice: 2500000,
    stock: 22,
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80',
    unit: 'Bộ',
    description: 'Bàn phím cơ layout 75% hỗ trợ tùy biến phím qua QMK/VIA, switch cơ Keychron K Pro mượt mà, kết nối 3 thiết bị Bluetooth hoặc cắm dây Type-C, tương thích Mac & Windows.',
    status: 'in_stock',
    rating: 4.9,
    soldCount: 88,
  },
  {
    id: 'PRD-009',
    code: 'SP-BEL-3IN1',
    name: 'Đế Sạc Không Dây Belkin BoostCharge Pro 3-in-1 15W MagSafe',
    category: 'Phụ kiện sạc & cáp',
    price: 3690000,
    originalPrice: 3990000,
    stock: 5,
    image: 'https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=500&auto=format&fit=crop&q=80',
    unit: 'Bộ',
    description: 'Đế sạc không dây sang trọng chứng nhận chính thức Apple MagSafe 15W, sạc đồng thời iPhone, Apple Watch Fast Charging và AirPods trên cùng một chân đứng phong cách.',
    status: 'low_stock',
    rating: 4.9,
    soldCount: 38,
  },
  {
    id: 'PRD-010',
    code: 'SP-IP15-128',
    name: 'Ốp Lưng Kháng Khuẩn MagSafe iPhone 15 Pro Max Silicon',
    category: 'Điện thoại & Phụ kiện',
    price: 890000,
    originalPrice: 1100000,
    stock: 60,
    image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=500&auto=format&fit=crop&q=80',
    unit: 'Cái',
    description: 'Chất liệu liquid silicone mềm mượt chống bám vân tay, tích hợp vòng nam châm MagSafe hít cực chặt, lớp nỉ vi sợi chống xước thân máy hoàn hảo.',
    status: 'in_stock',
    rating: 4.7,
    soldCount: 175,
  },
];

export const initialMockOrders: UserOrder[] = [
  {
    id: 'ORD-101',
    code: 'HD-2026-001',
    createdAt: '02/10/2026 09:15',
    staffId: 'USR-004',
    staffName: 'Nguyễn Văn A',
    customerName: 'Nguyễn Văn B',
    customerPhone: '0901234567',
    customerEmail: 'nguyenvanb@gmail.com',
    customerAddress: '15 Lê Duẩn, P. Bến Nghé, Quận 1, TP. HCM',
    items: [
      {
        productId: 'PRD-002',
        productCode: 'SP-LOG-MX3S',
        name: 'Chuột Không Dây Logitech MX Master 3S Quiet',
        price: 2450000,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=80',
        subtotal: 2450000,
      },
      {
        productId: 'PRD-007',
        productCode: 'SP-UGR-65W',
        name: 'Củ Sạc Nhanh Ugreen GaN 65W 3 Cổng Type-C Nexode',
        price: 650000,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500&auto=format&fit=crop&q=80',
        subtotal: 650000,
      },
    ],
    subtotal: 3850000,
    discount: 150000,
    tax: 370000,
    total: 4070000,
    paymentMethod: 'transfer',
    paymentStatus: 'paid',
    status: 'completed',
    notes: 'Khách yêu cầu giao gấp buổi sáng',
    timeline: [
      { status: 'created', title: 'Đã tạo đơn hàng', time: '02/10/2026 09:15', completed: true },
      { status: 'confirmed', title: 'Đã xác nhận đơn hàng', time: '02/10/2026 09:20', completed: true },
      { status: 'processing', title: 'Đang xử lý & đóng gói', time: '02/10/2026 09:40', completed: true },
      { status: 'completed', title: 'Hoàn thành đơn hàng', time: '02/10/2026 10:15', completed: true, current: true },
    ],
  },
  {
    id: 'ORD-102',
    code: 'HD-2026-002',
    createdAt: '02/10/2026 08:30',
    staffId: 'USR-004',
    staffName: 'Nguyễn Văn A',
    customerName: 'Trần Văn C',
    customerPhone: '0912987654',
    customerEmail: 'tranvanc@yahoo.com',
    customerAddress: '240 Nguyễn Thị Minh Khai, Quận 3, TP. HCM',
    items: [
      {
        productId: 'PRD-002',
        productCode: 'SP-LOG-MX3S',
        name: 'Chuột Không Dây Logitech MX Master 3S Quiet',
        price: 2450000,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=80',
        subtotal: 2450000,
      },
    ],
    subtotal: 2450000,
    discount: 50000,
    tax: 240000,
    total: 2640000,
    paymentMethod: 'cash',
    paymentStatus: 'unpaid',
    status: 'processing',
    notes: 'Thanh toán tiền mặt khi nhận hàng',
    timeline: [
      { status: 'created', title: 'Đã tạo đơn hàng', time: '02/10/2026 08:30', completed: true },
      { status: 'confirmed', title: 'Đã xác nhận đơn hàng', time: '02/10/2026 08:35', completed: true },
      { status: 'processing', title: 'Đang chuẩn bị hàng tại kho', time: '02/10/2026 08:50', completed: true, current: true },
      { status: 'completed', title: 'Hoàn thành', completed: false },
    ],
  },
  {
    id: 'ORD-103',
    code: 'HD-2026-003',
    createdAt: '01/10/2026 16:45',
    staffId: 'USR-004',
    staffName: 'Nguyễn Văn A',
    customerName: 'Lê Hoàng Dũng',
    customerPhone: '0988776655',
    customerEmail: 'lehoangdung@outlook.com',
    customerAddress: '88 Võ Văn Tần, Quận 3, TP. HCM',
    items: [
      {
        productId: 'PRD-004',
        productCode: 'SP-APL-AIR3',
        name: 'Tai Nghe Apple AirPods 3 MagSafe Charging Case',
        price: 4390000,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=500&auto=format&fit=crop&q=80',
        subtotal: 4390000,
      },
      {
        productId: 'PRD-010',
        productCode: 'SP-IP15-128',
        name: 'Ốp Lưng Kháng Khuẩn MagSafe iPhone 15 Pro Max Silicon',
        price: 890000,
        quantity: 2,
        image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=500&auto=format&fit=crop&q=80',
        subtotal: 1780000,
      },
    ],
    subtotal: 6170000,
    discount: 200000,
    tax: 597000,
    total: 6567000,
    paymentMethod: 'e_wallet',
    paymentStatus: 'paid',
    status: 'completed',
    notes: 'Khách thanh toán qua MoMo',
    timeline: [
      { status: 'created', title: 'Đã tạo đơn hàng', time: '01/10/2026 16:45', completed: true },
      { status: 'confirmed', title: 'Đã xác nhận đơn hàng', time: '01/10/2026 16:50', completed: true },
      { status: 'processing', title: 'Đang xử lý', time: '01/10/2026 17:10', completed: true },
      { status: 'completed', title: 'Hoàn thành giao hàng', time: '01/10/2026 17:45', completed: true, current: true },
    ],
  },
  {
    id: 'ORD-104',
    code: 'HD-2026-004',
    createdAt: '01/10/2026 11:20',
    staffId: 'USR-004',
    staffName: 'Nguyễn Văn A',
    customerName: 'Phạm Thu Thảo',
    customerPhone: '0977223344',
    customerEmail: 'thuthao.pham@gmail.com',
    customerAddress: '45 Trần Hưng Đạo, Quận 5, TP. HCM',
    items: [
      {
        productId: 'PRD-003',
        productCode: 'SP-SNY-XM5',
        name: 'Tai Nghe Chống Ồn Sony WH-1000XM5 Không Dây',
        price: 7990000,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80',
        subtotal: 7990000,
      },
    ],
    subtotal: 7990000,
    discount: 300000,
    tax: 769000,
    total: 8459000,
    paymentMethod: 'transfer',
    paymentStatus: 'paid',
    status: 'confirmed',
    notes: 'Giao giờ hành chính',
    timeline: [
      { status: 'created', title: 'Đã tạo đơn hàng', time: '01/10/2026 11:20', completed: true },
      { status: 'confirmed', title: 'Đã xác nhận thanh toán', time: '01/10/2026 11:30', completed: true, current: true },
      { status: 'processing', title: 'Đang chuẩn bị hàng', completed: false },
      { status: 'completed', title: 'Hoàn thành', completed: false },
    ],
  },
];

export const initialMockNotifications: UserNotification[] = [
  {
    id: 'NOTIF-01',
    title: 'Đơn hàng HD-2026-001 hoàn thành',
    message: 'Đơn hàng của khách hàng Nguyễn Văn B đã giao thành công và hoàn tất thanh toán.',
    type: 'order_completed',
    createdAt: '15 phút trước',
    isRead: false,
    orderId: 'ORD-101',
  },
  {
    id: 'NOTIF-02',
    title: 'Cảnh báo tồn kho sản phẩm',
    message: 'Sản phẩm Ổ Cứng SSD Di Động Samsung T7 Shield 1TB chỉ còn 6 chiếc trong kho.',
    type: 'stock_alert',
    createdAt: '45 phút trước',
    isRead: false,
  },
  {
    id: 'NOTIF-03',
    title: 'Đơn hàng HD-2026-002 đã được xác nhận',
    message: 'Bộ phận kho đã nhận đơn HD-2026-002 và đang tiến hành đóng gói xuất hàng.',
    type: 'order_confirmed',
    createdAt: '2 giờ trước',
    isRead: true,
    orderId: 'ORD-102',
  },
  {
    id: 'NOTIF-04',
    title: 'Chương trình khuyến mãi phụ kiện tháng 10',
    message: 'Giảm ngay 10% cho toàn bộ củ sạc nhanh và cáp kết nối từ ngày 01/10 đến 10/10.',
    type: 'promotion',
    createdAt: '1 ngày trước',
    isRead: true,
  },
  {
    id: 'NOTIF-05',
    title: 'Bảo trì hệ thống định kỳ',
    message: 'Hệ thống kho vận sẽ đồng bộ dữ liệu tồn kho lúc 23:00 tối nay. Vui lòng hoàn tất đơn bán hàng trước thời gian này.',
    type: 'system',
    createdAt: '2 ngày trước',
    isRead: true,
  },
];

export const initialUserProfile: UserProfileData = {
  id: 'USR-004',
  name: 'Nguyễn Văn A',
  username: 'user01',
  email: 'user@khovanpro.vn',
  phone: '0901234567',
  role: 'USER',
  roleTitle: 'Nhân viên bán hàng',
  roleName: 'Nhân viên bán hàng',
  department: 'Bộ phận Bán Hàng & POS',
  employeeId: 'NVBH-2026-08',
  employeeCode: 'NVBH-2026-08',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
  createdAt: '15/01/2025',
  joinedDate: '15/01/2025',
  todayOrdersCount: 24,
  monthlyOrdersCount: 168,
  personalRevenue: 28500000,
  productsSoldCount: 312,
  storeInfo: {
    name: 'Chi nhánh SALEPRO Trung Tâm Quận 1',
    address: '123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    phone: '1900 6868 - Máy lẻ 101',
    manager: 'Trần Minh Quân (Quản lý trưởng)',
  },
};

export const mockWeeklyRevenueChart = [
  { day: 'T2 (26/09)', revenue: 14200000, orders: 15 },
  { day: 'T3 (27/09)', revenue: 19800000, orders: 18 },
  { day: 'T4 (28/09)', revenue: 22400000, orders: 20 },
  { day: 'T5 (29/09)', revenue: 18900000, orders: 16 },
  { day: 'T6 (30/09)', revenue: 27500000, orders: 25 },
  { day: 'T7 (01/10)', revenue: 34100000, orders: 30 },
  { day: 'CN (02/10)', revenue: 28500000, orders: 24 },
];
