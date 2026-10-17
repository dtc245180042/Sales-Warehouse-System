// Kiểu dữ liệu Đơn hàng chờ duyệt & Lý do vi phạm chính sách (SCRUM-237 / SCRUM-563)

export type ViolationType =
  | 'credit_limit'      // Vượt hạn mức công nợ cho phép
  | 'below_floor_price'  // Bán dưới giá sàn tối thiểu quy định
  | 'max_discount'      // Vượt mức chiết khấu tối đa của nhân viên
  | 'overdue_debt'      // Khách hàng / đại lý có khoản nợ quá hạn
  | 'out_of_stock'      // Số lượng đặt vượt tồn kho khả dụng
  | 'payment_term';     // Điều khoản thanh toán ghi nợ đặc biệt

export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision';

export type ApprovalActionType = 'approve' | 'reject' | 'revision';

export interface AffectedItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  floorPrice?: number;
  discountPct?: number;
  maxDiscountPct?: number;
  stockAvailable?: number;
}

export interface OrderViolation {
  id: string;
  type: ViolationType;
  title: string;
  severity: ViolationSeverity;
  description: string;
  currentValue: number | string;
  limitValue: number | string;
  differenceValue?: string;
  exceededAmount?: number;
  exceededPercent?: number;
  affectedItems?: AffectedItem[];
}

export interface ApprovalOrder {
  id: string;
  orderId: string;
  orderCode: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerGroup?: string;
  totalAmount: number;
  createdAt: string;
  createdStaffId: string;
  createdStaffName: string;
  approvalStatus: ApprovalStatus;
  highestSeverity: ViolationSeverity;
  violations: OrderViolation[];
  approverNotes?: string;
  rejectedReason?: string;
  revisionNotes?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  returnedAt?: string;
  returnedBy?: string;
}

export interface ApprovalFilterOptions {
  search?: string;
  violationType?: 'all' | ViolationType;
  severity?: 'all' | ViolationSeverity;
  status?: 'all' | ApprovalStatus;
  staffId?: string;
  timeRange?: 'all' | 'today' | '7days' | '30days';
}
