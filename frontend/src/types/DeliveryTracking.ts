// Kiểu dữ liệu Theo dõi trạng thái giao hàng của đơn & Timeline các mốc (SCRUM-695 / SCRUM-260)

export type DeliveryMilestoneKey =
  | 'approved'    // Đã duyệt
  | 'preparing'   // Đang soạn
  | 'dispatched'  // Đã xuất
  | 'shipping'    // Đang giao
  | 'delivered';  // Đã giao

export type MilestoneStatus = 'completed' | 'in_progress' | 'pending' | 'cancelled';

export interface DeliveryMilestone {
  key: DeliveryMilestoneKey;
  label: string;
  shortDescription: string;
  detailedNote?: string;
  timestamp?: string; // YYYY-MM-DD HH:mm
  status: MilestoneStatus;
  performedBy?: string; // Tên nhân viên/hệ thống thực hiện
  roleTitle?: string; // Chức vụ: Quản lý kinh doanh, Thủ kho, Tài xế giao vận...
  location?: string; // Vị trí (Kho xuất, Trung tâm phân phối, Địa chỉ đại lý...)
}

export interface DeliveryTrackingDetails {
  orderId: string;
  orderCode: string;
  trackingNumber: string; // Mã vận đơn (Vd: VNPOST-882194, OMS-EXP-3921)
  carrier: string; // Đơn vị giao nhận (Đội vận tải OMS Express, GHTK, Viettel Post...)
  carrierPhone?: string;
  driverName?: string; // Họ tên tài xế / Shipper
  driverPhone?: string; // SĐT tài xế
  vehiclePlate?: string; // Biển số xe
  estimatedDeliveryDate: string; // Thời gian dự kiến giao
  actualDeliveryDate?: string; // Thời gian giao thực tế
  sourceWarehouse: string; // Kho xuất hàng
  sourceWarehouseAddress?: string; // Địa chỉ kho xuất
  destinationAddress: string; // Địa chỉ nhận của đại lý
  recipientName: string; // Người nhận tại đại lý
  recipientPhone: string; // SĐT người nhận
  packagesCount: number; // Số kiện hàng
  totalWeightKg: number; // Trọng lượng ước tính (kg)
  shippingFee: number; // Phí vận chuyển
  currentMilestone: DeliveryMilestoneKey;
  isCancelled?: boolean;
  cancelledReason?: string;
  cancelledAt?: string;
  milestones: DeliveryMilestone[];
  lastUpdated: string;
}
