/**
 * Types cho Sổ chi tiết công nợ đại lý (Story S8-10, SCRUM-843 -> SCRUM-849).
 */

export interface DebtLedgerItem {
  id: string;
  date: string;
  document_type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | string;
  document_type_label: string;
  document_code: string;
  reference_code?: string | null;
  description?: string | null;
  increase_amount: number;
  decrease_amount: number;
  running_balance: number;
  due_date?: string | null;
  status?: string | null;
}

export interface CustomerDebtSummary {
  customer_id: string;
  customer_code?: string | null;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_code?: string | null;
  credit_limit: number;
  max_debt_days: number;
  current_debt: number;
  available_credit: number;
}

export interface CustomerDebtLedgerResponse {
  customer: CustomerDebtSummary;
  from_date?: string | null;
  to_date?: string | null;
  opening_balance: number;
  total_increase: number;
  total_decrease: number;
  closing_balance: number;
  items: DebtLedgerItem[];
  total_items: number;
}

export interface CustomerDebtLedgerOverviewItem {
  customer_id: string;
  customer_code?: string | null;
  customer_name: string;
  phone?: string | null;
  credit_limit: number;
  max_debt_days: number;
  opening_balance: number;
  total_increase: number;
  total_decrease: number;
  closing_balance: number;
  transactions_count: number;
}

export interface CustomerDebtLedgerOverviewResponse {
  items: CustomerDebtLedgerOverviewItem[];
  total: number;
  total_closing_debt: number;
}
