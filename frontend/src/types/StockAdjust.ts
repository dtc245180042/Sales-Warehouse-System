export type AdjustType = 'damaged' | 'lost' | 'expired';

export type AdjustStatus = 'pending' | 'approved' | 'rejected';

export interface StockAdjustItem {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;       // Tồn kho hiện tại
  adjustQty: number;          // Số lượng cần giảm/điều chỉnh
  costPrice: number;          // Giá vốn (VND)
  lossValue: number;          // Giá trị tổn thất = adjustQty * costPrice
  note?: string;              // Ghi chú riêng từng dòng
}

export interface StockAdjustRequest {
  warehouse: string;
  adjustType: AdjustType;
  adjustDate: string;
  reason: string;             // Lý do điều chỉnh (bắt buộc >= 10 ký tự)
  items: StockAdjustItem[];
  attachmentUrl?: string;
  note?: string;
}

export interface StockAdjustVoucher extends StockAdjustRequest {
  id: string;
  code: string;               // Mã phiếu, VD: DCXK-20261015-001
  status: AdjustStatus;
  totalLossQty: number;
  totalLossValue: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectReason?: string;
}
