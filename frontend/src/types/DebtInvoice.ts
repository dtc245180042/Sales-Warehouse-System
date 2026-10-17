// Kiểu dữ liệu Công nợ & Hoá đơn đã phát hành (SCRUM-755 / SCRUM-268)

export type DebtStatus = 'paid' | 'unpaid' | 'partially_paid' | 'overdue';

export interface InvoiceItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // Tỷ lệ thuế VAT (ví dụ: 8 hoặc 10%)
  vatAmount: number;
  subtotal: number;
  total: number;
}

export interface PaymentTransaction {
  id: string;
  paymentCode: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'cash' | 'credit';
  transactionReference?: string; // Mã giao dịch ngân hàng
  paymentDate: string;
  note?: string;
  recordedBy: string;
}

export interface DebtInvoice {
  id: string;
  invoiceNumber: string; // Số hoá đơn (Vd: 0001248, 0001249)
  invoiceSeries: string; // Ký hiệu mẫu số & ký hiệu hoá đơn (Vd: 1C26TBB)
  templateCode: string; // Ký hiệu mẫu số (Vd: 1/001)
  issueDate: string; // Ngày phát hành hoá đơn điện tử (YYYY-MM-DD HH:mm)
  dueDate: string; // Hạn thanh toán công nợ (YYYY-MM-DD)
  
  // Liên kết đơn hàng & đại lý
  orderId: string;
  orderCode: string;
  agentId: string;
  agentName: string;
  agentTaxCode?: string;
  agentAddress?: string;
  agentPhone?: string;
  agentEmail?: string;

  // Đơn vị phát hành (Bên bán)
  sellerName: string;
  sellerTaxCode: string;
  sellerAddress: string;
  sellerBankAccount?: string;
  sellerBankName?: string;

  // Tài chính
  subtotalAmount: number; // Tiền hàng chưa thuế
  vatRateAverage: number; // Thuế suất bình quân (%)
  vatAmount: number; // Tiền thuế VAT
  grandTotal: number; // Tổng cộng tiền thanh toán
  paidAmount: number; // Số tiền đại lý đã thanh toán
  remainingDebt: number; // Dư nợ công nợ còn lại

  // Trạng thái công nợ
  status: DebtStatus;
  overdueDays?: number; // Số ngày quá hạn nếu có

  // Dòng hàng trên hoá đơn
  items: InvoiceItem[];

  // Lịch sử thanh toán công nợ
  payments: PaymentTransaction[];

  // Chữ ký số điện tử
  digitalSignature: {
    signer: string;
    signedAt: string;
    isValid: boolean;
    certificateSerial?: string;
  };

  notes?: string;
}

export interface DebtFilter {
  search?: string;
  agentId?: string;
  status?: 'all' | DebtStatus;
  startDate?: string;
  endDate?: string;
}
