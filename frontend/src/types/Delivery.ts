export type DeliveryStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
export type DeliveryPointStatus = 'not_delivered' | 'delivered' | 'failed';

export interface DeliveryPoint {
  id: string;
  sequence: number;           // Thứ tự điểm giao
  customerName: string;
  customerPhone: string;
  address: string;
  orderId: string;
  orderCode: string;
  totalItems: number;
  deliveredItems: number;
  remainingItems: number;
  status: DeliveryPointStatus;
  deliveredAt?: string;
  note?: string;
}

export interface DeliveryTrip {
  id: string;
  code: string;               // Mã chuyến (VD: DL-20261017-001)
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  startTime: string;
  estimatedEndTime: string;   // Thời gian dự kiến kết thúc
  actualEndTime?: string;
  totalPoints: number;
  deliveredPoints: number;
  remainingPoints: number;
  totalItems: number;
  deliveredItems: number;
  remainingItems: number;
  status: DeliveryStatus;
  isOverdue: boolean;         // Quá thời gian dự kiến
  overdueDuration?: number;   // Số phút trễ
  points: DeliveryPoint[];
  warehouseId: string;
  warehouseName: string;
  createdAt: string;
  updatedAt: string;
}
