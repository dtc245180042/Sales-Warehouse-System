// Kiểu dữ liệu Đại lý (Agent/Distributor) - SCRUM-229

export type AgentStatus = 'active' | 'inactive' | 'pending';
export type AgentGroup = 'platinum' | 'gold' | 'silver' | 'standard';

export interface Agent {
  id: string;
  code: string;           // Mã đại lý (VD: DL-001)
  name: string;           // Tên đại lý / Công ty
  phone: string;          // Số điện thoại chính
  email: string;
  address: string;        // Địa chỉ đầy đủ
  province: string;       // Tỉnh / Thành phố
  district: string;       // Quận / Huyện
  region: string;         // Khu vực phụ trách (Miền Nam, Miền Bắc, Miền Trung)
  customerGroup: AgentGroup;       // Nhóm khách hàng
  assignedStaffId?: string;        // Nhân viên phụ trách
  assignedStaffName?: string;      // Tên nhân viên phụ trách
  totalOrders: number;
  totalSpent: number;
  outstandingDebt: number;         // Công nợ tồn
  creditLimit?: number;            // Hạn mức tín dụng được cấp (VNĐ)
  maxDebtDays?: number;            // Số ngày nợ tối đa cho phép
  availableCredit?: number;        // Hạn mức khả dụng còn lại
  lastOrderDate?: string;
  createdAt: string;
  status: AgentStatus;
  taxCode?: string;                // Mã số thuế
  contactPerson?: string;          // Người liên hệ chính
}
