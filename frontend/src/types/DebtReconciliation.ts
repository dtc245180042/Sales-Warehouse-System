export type ReconciliationStatus =
  | 'draft'       // Nháp
  | 'sent'        // Đã gửi cho đại lý
  | 'confirmed'   // Đại lý đã xác nhận đồng ý
  | 'disputed'    // Đại lý phản hồi lệch
  | 'resolved';   // Đã giải quyết

export interface ReconciliationOrderItem {
  orderId: string;
  orderCode: string;
  orderDate: string;
  amount: number;       // Giá trị đơn hàng
  paidAmount: number;   // Đã thanh toán
  debtAmount: number;   // Còn nợ
}

export interface DebtReconciliation {
  id: string;
  code: string;                    // Mã biên bản (VD: BB-20261017-001)
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  period: string;                  // Kỳ đối chiếu (VD: "Tháng 10/2026")
  periodFrom: string;
  periodTo: string;

  // Số liệu công nợ
  openingBalance: number;          // Dư nợ đầu kỳ
  totalOrderAmount: number;        // Tổng phát sinh nợ trong kỳ
  totalPaidAmount: number;         // Tổng đã thu trong kỳ
  closingBalance: number;          // Dư nợ cuối kỳ

  orders: ReconciliationOrderItem[];

  status: ReconciliationStatus;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  sentBy?: string;

  // Phản hồi từ đại lý
  agentResponse?: 'confirmed' | 'disputed';
  agentRespondedAt?: string;
  agentNote?: string;
  agentDisputedAmount?: number;

  // Giải quyết
  resolvedBy?: string;
  resolvedAt?: string;
  resolvedNote?: string;
}
