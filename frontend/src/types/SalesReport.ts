/**
 * Types for Sales Multi-dimensional Report
 * SCRUM-815, SCRUM-819, SCRUM-821
 */

export type ReportDimension = 'staff' | 'territory' | 'agent' | 'category' | 'sku';

export type ReportPeriodType = 'month' | 'quarter' | 'custom';

export type ComparisonMode = 'none' | 'prev_period' | 'same_period_last_year';

export interface SalesReportFilter {
  periodType: ReportPeriodType;
  year: number;
  month?: number;
  quarter?: number;
  fromDate?: string;
  toDate?: string;
  dimension: ReportDimension;
  compareWithPrev?: boolean;
  comparisonMode?: ComparisonMode;
}

export interface SalesReportRow {
  id: string;
  label: string;             // Tên nhân viên / khu vực / đại lý / nhóm hàng / SKU
  subLabel?: string;         // Phụ đề (khu vực của NV, nhóm hàng của SKU, mã SKU)
  orders: number;            // Số đơn hàng
  revenue: number;           // Doanh số thuần (VND)
  avgOrderValue: number;     // Giá trị trung bình mỗi đơn

  // So sánh cùng kỳ trước (SCRUM-821)
  prevRevenue?: number;      // Doanh số kỳ trước
  revenueDelta?: number;     // revenue - prevRevenue
  revenueGrowthPct?: number; // (delta / prevRevenue) * 100

  quantity?: number;         // Tổng sản lượng xuất bán
  prevQuantity?: number;     // Sản lượng kỳ trước
  quantityDelta?: number;
  quantityGrowthPct?: number;

  grossMargin?: number;          // Biên LN gộp kỳ này (VND)
  grossMarginPct?: number;       // Tỷ lệ biên LN gộp (%)
  prevGrossMargin?: number;      // Biên LN gộp kỳ trước
  prevGrossMarginPct?: number;
  grossMarginDelta?: number;     // Chênh lệch tuyệt đối
  grossMarginPctDelta?: number;  // Chênh lệch điểm % (+2.5 pp)

  topProducts?: Array<{
    name: string;
    sku: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface SalesReportSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalQuantity: number;
  totalGrowth?: number;
  topDimension: string;
  bottomDimension: string;

  // Comparison metrics (SCRUM-821)
  prevTotalRevenue?: number;
  totalRevenueDelta?: number;
  totalRevenueGrowthPct?: number;
  avgGrossMarginPct?: number;
  prevAvgGrossMarginPct?: number;
}

export interface SalesReportResult {
  filter: SalesReportFilter;
  summary: SalesReportSummary;
  rows: SalesReportRow[];
  generatedAt: string;
}
