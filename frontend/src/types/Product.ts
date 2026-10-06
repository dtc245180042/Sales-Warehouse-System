export type ProductStatus = 'active' | 'out_of_stock' | 'low_stock' | 'inactive';

// Đơn vị tính & hệ số quy đổi
export interface UnitConversion {
  id: string;
  unitName: string;       // Tên đơn vị (Thùng, Lốc, Chiếc...)
  ratio: number;          // Số lượng đơn vị cơ sở tương đương 1 đơn vị này
  isBase: boolean;        // Đây có phải đơn vị cơ sở không
  barcode?: string;       // Barcode riêng cho đơn vị này (tuỳ chọn)
  salePrice?: number;     // Giá bán theo đơn vị này (tuỳ chọn)
  notes?: string;         // Ghi chú thêm
}

export interface ProductUnitConfig {
  productId: string;
  baseUnit: string;             // Tên đơn vị cơ sở
  units: UnitConversion[];      // Danh sách tất cả đơn vị
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  supplierId: string;
  supplierName: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  unit: string;
  packagingSpecification?: string; // Quy cách đóng gói (SCRUM-220)
  image: string;
  description: string;
  status: ProductStatus;
  hasTransactions?: boolean; // Đã phát sinh giao dịch - không thể xóa (SCRUM-220/381)
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
}
