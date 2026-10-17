export type CollectionStatus = 'pending' | 'submitted' | 'confirmed' | 'rejected';

export interface CollectionReceipt {
  id: string;
  code: string;               // Mã khoản thu (VD: KT-20261017-001)
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  routeName: string;          // Tuyến đường
  amount: number;             // Số tiền thu
  collectedBy: string;        // Nhân viên thu tiền
  collectedAt: string;        // Thời điểm thu
  receiptImageUrl?: string;   // URL ảnh biên lai
  receiptImageFile?: File;    // File ảnh khi upload
  status: CollectionStatus;
  note?: string;
  confirmedBy?: string;       // Kế toán xác nhận
  confirmedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}
