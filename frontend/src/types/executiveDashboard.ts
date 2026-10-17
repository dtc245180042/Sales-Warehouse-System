export interface DashboardKPISummary {
  revenue_today: number;
  revenue_this_month: number;
  pending_approval_orders: number;
  pending_dispatch_orders: number;
  overdue_debt_amount: number;
  low_stock_sku_count: number;
  total_orders_today: number;
  total_orders_this_month: number;
  overdue_agencies_count: number;
}

export interface DailySalesPoint {
  date: string;
  label: string;
  sales_amount: number;
  order_count: number;
}

export interface RegionalSalesPoint {
  region: string;
  sales_amount: number;
  order_count: number;
  percentage: number;
}

export interface OverdueAgencyItem {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  customer_phone?: string;
  region?: string;
  credit_limit: number;
  overdue_amount: number;
  max_overdue_days: number;
  overdue_invoices_count: number;
  status: string;
}

export interface ExecutiveDashboardResponse {
  kpis: DashboardKPISummary;
  daily_sales: DailySalesPoint[];
  regional_sales: RegionalSalesPoint[];
  overdue_agencies: OverdueAgencyItem[];
  filter_period: string;
  selected_region?: string;
  cached: boolean;
  execution_time_ms: number;
  generated_at: string;
}
