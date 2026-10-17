export interface AgencyDebtReportItem {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  phone?: string;
  address?: string;
  tax_code?: string;
  region?: string;
  customer_group?: string;
  assigned_sales_rep?: string;
  credit_limit: number;
  max_debt_days: number;

  // Tài chính
  total_receivable: number;
  total_paid: number;
  total_debt: number;

  // 4 nhóm tuổi nợ (AC)
  debt_0_30: number;
  debt_31_60: number;
  debt_61_90: number;
  debt_over_90: number;

  // Quá hạn (AC)
  overdue_debt: number;
  max_overdue_days: number;
  is_overdue: boolean;

  unpaid_invoices_count: number;
  oldest_invoice_date?: string;
}

export interface AgencyDebtSummary {
  total_customers: number;
  total_receivable: number;
  total_paid: number;
  total_debt: number;
  total_debt_0_30: number;
  total_debt_31_60: number;
  total_debt_61_90: number;
  total_debt_over_90: number;
  total_overdue_debt: number;
  overdue_customers_count: number;
}

export interface AgencyDebtReportResponse {
  items: AgencyDebtReportItem[];
  summary: AgencyDebtSummary;
  total: number;
  page: number;
  limit: number;
  as_of_date: string;
}

export interface AgencyInvoiceDetail {
  invoice_id: string;
  client_request_id?: string;
  issued_at: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  aging_days: number;
  aging_bucket: string;
  days_overdue: number;
  is_overdue: boolean;
  notes?: string;
}

export interface AgencyDebtDetailResponse {
  customer: AgencyDebtReportItem;
  invoices: AgencyInvoiceDetail[];
}

export interface AgencyDebtFilterParams {
  as_of_date?: string;
  search?: string;
  region?: string;
  customer_group?: string;
  assigned_sales_rep?: string;
  only_overdue?: boolean;
  aging_group?: string;
  has_debt_only?: boolean;
  page?: number;
  limit?: number;
}
