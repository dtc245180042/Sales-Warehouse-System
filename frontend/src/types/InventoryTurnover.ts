/**
 * Types for Inventory Turnover Report (Vòng Quay Tồn Kho)
 * SCRUM-827 & SCRUM-833
 */

export interface TurnoverSummary {
  asOfDate: string;                     // Ngày tính báo cáo
  totalSkus: number;
  totalWarehouseValue: number;          // Tổng giá trị kho (VND)
  avgDaysOfSupply: number;              // Số ngày tồn bình quân tất cả SKU
  slowMovingCount: number;              // Số SKU > 90 ngày không GD
  deadStockCount: number;               // Số SKU > 180 ngày không GD (hàng tồn chết)
  avgTurnoverRatio: number;             // Vòng quay trung bình (lần/năm)
  topTurnoverSku: string;               // SKU có vòng quay nhanh nhất
  worstTurnoverSku: string;             // SKU có vòng quay chậm nhất
}

export interface WarehouseTurnoverRow {
  warehouseId: number;
  warehouseName: string;
  skuCount: number;
  totalValue: number;                   // VND theo giá vốn
  avgTurnoverDays: number;              // Số ngày tồn bình quân của kho này
  slowMovingCount: number;
  turnoverRatio: number;                // Số lần quay vốn / năm (annualized)
}

export interface CategoryTurnoverRow {
  categoryId: string;
  categoryName: string;
  skuCount: number;
  totalValue: number;
  avgTurnoverDays: number;
  slowMovingCount: number;
  slowMovingSkus: SlowMovingSku[];      // Danh sách SKU chậm trong nhóm này
  turnoverRatio: number;
}

export interface SlowMovingSku {
  productId: string;
  sku: string;
  productName: string;
  warehouseName: string;
  categoryName: string;
  physicalStock: number;
  stockValue: number;                   // VND
  lastMovementDate: string;
  daysSinceLastMovement: number;
  severity: 'warning' | 'alert' | 'dead'; // 30-60d | 61-180d | >180d
}

export interface SkuTurnoverRow {
  productId: string;
  sku: string;
  productName: string;
  categoryName: string;
  warehouseName: string;
  physicalStock: number;
  stockValue: number;
  avgMonthlySales: number;              // Sản lượng bán trung bình / tháng (3 tháng gần nhất)
  daysOfSupply: number;                 // physicalStock / (avgMonthlySales / 30)
  turnoverRatio: number;                // (avgMonthlySales * 12) / physicalStock
  lastMovementDate: string;
  daysSinceLastMovement: number;
  severity: 'ok' | 'warning' | 'alert' | 'dead';
}

export interface InventoryTurnoverReportData {
  summary: TurnoverSummary;
  byWarehouse: WarehouseTurnoverRow[];
  byCategory: CategoryTurnoverRow[];
  bySku: SkuTurnoverRow[];
  slowMovingList: SlowMovingSku[];      // Top SKU chậm nhất
}

export interface TurnoverFilter {
  warehouseId?: number | 'all';
  categoryId?: string | 'all';
  search?: string;
  severity?: 'all' | 'warning' | 'alert' | 'dead';
  onlySlowMoving?: boolean;
}
