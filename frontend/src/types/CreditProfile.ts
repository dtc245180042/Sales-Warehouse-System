export interface CustomerCreditProfile {
  id?: number;
  customerId: string;
  creditLimit: number;
  maxDebtDays: number;
  currentDebt: number;
  availableCredit: number;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerCreditHistory {
  id: number;
  customerId: string;
  oldCreditLimit: number;
  newCreditLimit: number;
  oldMaxDebtDays: number;
  newMaxDebtDays: number;
  reason: string;
  changedBy: string;
  createdAt: string;
}

export interface CreditProfileUpdatePayload {
  credit_limit: number;
  max_debt_days: number;
  reason: string;
}

export interface CreditCheckResult {
  allowed: boolean;
  errorMessage?: string | null;
  creditLimit: number;
  maxDebtDays: number;
  dispatchedDebt: number;
  orderUnpaidAmount: number;
  excessAmount: number;
  overdueDays: number;
  overdueOrderCode?: string | null;
}
