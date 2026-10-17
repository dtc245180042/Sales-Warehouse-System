/**
 * TypeScript types cho Báo cáo Công nợ Quá hạn theo Tuổi nợ (Story S8-09).
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AgingBucketSummary {
  bucket_label: string;
  total_amount: number;
  customer_count: number;
  invoice_count: number;
  percentage: number;
}

export interface DebtAgingCustomerRow {
  customer_id: string;
  customer_name: string;
  customer_code?: string;
  region?: string;
  assigned_sales_rep?: string;
  total_invoices: number;
  total_debt: number;
  current_amount: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
  overdue_total: number;
  overdue_ratio: number;
  risk_level: RiskLevel;
  oldest_overdue_days: number;
  oldest_invoice_id?: string;
}

export interface SalesRepAgingSummary {
  sales_rep_name: string;
  customer_count: number;
  total_debt: number;
  overdue_total: number;
  current_amount: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
  overdue_ratio: number;
  high_risk_customers: number;
}

export interface DebtAgingReportResponse {
  report_date: string;
  total_customers_with_debt: number;
  total_debt_amount: number;
  total_overdue_amount: number;
  total_invoices_outstanding: number;
  bucket_summaries: AgingBucketSummary[];
  customers: DebtAgingCustomerRow[];
  top_risk_customers: DebtAgingCustomerRow[];
  by_sales_rep: SalesRepAgingSummary[];
}

export interface DebtAgingReportFilter {
  customer_id?: string;
  sales_rep?: string;
  region?: string;
  as_of_date?: string; // YYYY-MM-DD
}
