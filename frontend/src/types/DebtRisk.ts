export type DebtRiskAction = 'BLOCK' | 'REQUIRE_APPROVAL' | 'WARNING_ONLY';
export type DebtRiskLevel = 'SAFE' | 'WARNING' | 'OVERDUE' | 'LIMIT_EXCEEDED' | 'HIGH_RISK';
export type DebtRiskEventType =
  | 'FLAGGED'
  | 'UNFLAGGED'
  | 'AUTO_LOCKED'
  | 'AUTO_UNLOCKED'
  | 'REEVALUATED'
  | 'CONFIG_CHANGED';

export interface DebtRiskConfig {
  id: number;
  config_code?: string;
  configCode?: string;
  auto_flag_enabled?: boolean;
  autoFlagEnabled: boolean;
  action_on_overdue?: DebtRiskAction;
  actionOnOverdue: DebtRiskAction;
  action_on_credit_limit_exceeded?: DebtRiskAction;
  actionOnCreditLimitExceeded: DebtRiskAction;
  grace_period_days?: number;
  gracePeriodDays: number;
  min_debt_to_flag?: number;
  minDebtToFlag: number;
  auto_lock_on_flag?: boolean;
  autoLockOnFlag: boolean;
  description?: string;
  updated_by?: string;
  updatedBy?: string;
  created_at?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface DebtRiskConfigUpdatePayload {
  auto_flag_enabled?: boolean;
  action_on_overdue?: DebtRiskAction;
  action_on_credit_limit_exceeded?: DebtRiskAction;
  grace_period_days?: number;
  min_debt_to_flag?: number;
  auto_lock_on_flag?: boolean;
  description?: string;
}

export interface CustomerDebtFlag {
  id: number;
  customer_id: string;
  customerId?: string;
  customer_name?: string;
  customerName?: string;
  is_flagged: boolean;
  isFlagged?: boolean;
  risk_level: DebtRiskLevel;
  riskLevel?: DebtRiskLevel;
  action_applied: DebtRiskAction | 'NONE';
  actionApplied?: DebtRiskAction | 'NONE';
  is_blocked: boolean;
  isBlocked?: boolean;
  requires_approval: boolean;
  requiresApproval?: boolean;
  total_debt: number;
  totalDebt?: number;
  credit_limit: number;
  creditLimit?: number;
  excess_amount: number;
  excessAmount?: number;
  overdue_amount: number;
  overdueAmount?: number;
  max_overdue_days: number;
  maxOverdueDays?: number;
  oldest_overdue_invoice_code?: string | null;
  oldestOverdueInvoiceCode?: string | null;
  flag_reason?: string | null;
  flagReason?: string | null;
  last_evaluated_at?: string | null;
  lastEvaluatedAt?: string | null;
  evaluated_by?: string | null;
  evaluatedBy?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerDebtFlagHistoryItem {
  id: number;
  customer_id: string;
  customerId?: string;
  customer_name?: string;
  customerName?: string;
  event_type: DebtRiskEventType;
  eventType?: DebtRiskEventType;
  previous_risk_level?: string | null;
  previousRiskLevel?: string | null;
  new_risk_level: string;
  newRiskLevel?: string;
  previous_is_flagged: boolean;
  previousIsFlagged?: boolean;
  new_is_flagged: boolean;
  newIsFlagged?: boolean;
  previous_is_blocked: boolean;
  previousIsBlocked?: boolean;
  new_is_blocked: boolean;
  newIsBlocked?: boolean;
  total_debt: number;
  totalDebt?: number;
  overdue_amount: number;
  overdueAmount?: number;
  excess_amount: number;
  excessAmount?: number;
  max_overdue_days: number;
  maxOverdueDays?: number;
  reason: string;
  source: string;
  actor_username?: string | null;
  actorUsername?: string | null;
  created_at?: string;
  createdAt?: string;
}

export interface DailyEvaluationJobResponse {
  total_customers_scanned: number;
  totalCustomersScanned?: number;
  total_flagged: number;
  totalFlagged?: number;
  newly_flagged: number;
  newlyFlagged?: number;
  newly_unflagged: number;
  newlyUnflagged?: number;
  total_blocked: number;
  totalBlocked?: number;
  total_require_approval: number;
  totalRequireApproval?: number;
  executed_at: string;
  executedAt?: string;
  executed_by: string;
  executedBy?: string;
  details?: Array<{
    customer_id: string;
    customer_name?: string;
    risk_level: string;
    action_applied: string;
    total_debt: number;
    overdue_amount: number;
    max_overdue_days: number;
    reason?: string;
  }>;
}

export interface DebtRiskOverviewSummary {
  total_customers: number;
  totalCustomers?: number;
  safe_count: number;
  safeCount?: number;
  warning_count: number;
  warningCount?: number;
  overdue_count: number;
  overdueCount?: number;
  limit_exceeded_count: number;
  limitExceededCount?: number;
  high_risk_count: number;
  highRiskCount?: number;
  blocked_count: number;
  blockedCount?: number;
  requires_approval_count: number;
  requiresApprovalCount?: number;
  last_evaluated_at?: string | null;
  lastEvaluatedAt?: string | null;
}
