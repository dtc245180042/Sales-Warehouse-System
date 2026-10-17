export type WarehouseStatus = 'active' | 'inactive';

export interface WarehouseLocation {
  id: string;
  warehouseId: string;
  code: string;           // VD: A1-KE01
  zone: string;           // Khu: A, B, C
  shelf: string;          // Kệ: 1, 2, 3
  description?: string;
  capacity?: number;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  code: string;           // VD: KHO-HN-01
  name: string;           // Kho Tổng Hà Nội
  address: string;
  province: string;
  district?: string;
  manager: string;        // Tên người phụ trách
  managerId?: string;     // userId người phụ trách
  phone?: string;
  capacity?: number;      // Sức chứa (m2 hoặc số kiện)
  status: WarehouseStatus;
  locations?: WarehouseLocation[];
  createdAt: string;
  updatedAt?: string;
}
