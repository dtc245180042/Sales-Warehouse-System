import { apiClient } from '../api/client';
import {
  DebtRiskConfig,
  DebtRiskConfigUpdatePayload,
  CustomerDebtFlag,
  CustomerDebtFlagHistoryItem,
  DailyEvaluationJobResponse,
  DebtRiskOverviewSummary,
} from '../types/DebtRisk';

// Bộ nhớ đệm RAM (In-Memory Cache) theo nguyên tắc hiệu năng tối ưu vĩnh viễn (AGENTS.md Rule 6.3)
let cachedConfig: DebtRiskConfig | null = null;
let cachedSummary: DebtRiskOverviewSummary | null = null;
const cachedFlags: Map<string, CustomerDebtFlag> = new Map();

export const debtRiskService = {
  /**
   * Lấy cấu hình quy tắc rủi ro công nợ (có RAM cache).
   */
  getConfig: async (forceRefresh = false): Promise<DebtRiskConfig> => {
    if (!forceRefresh && cachedConfig) {
      // SWR: Gọi API ngầm để cập nhật cache
      apiClient.get('/debt-risk/config').then((res) => {
        cachedConfig = normalizeConfig(res.data);
      }).catch(() => {});
      return cachedConfig;
    }

    const res = await apiClient.get('/debt-risk/config');
    cachedConfig = normalizeConfig(res.data);
    return cachedConfig;
  },

  /**
   * Cập nhật quy tắc rủi ro công nợ (Kế toán công nợ / QLKD / Admin).
   */
  updateConfig: async (payload: DebtRiskConfigUpdatePayload): Promise<DebtRiskConfig> => {
    const res = await apiClient.put('/debt-risk/config', payload);
    cachedConfig = normalizeConfig(res.data);
    return cachedConfig;
  },

  /**
   * Lấy danh sách cờ rủi ro của các đại lý.
   */
  getFlags: async (params?: {
    search?: string;
    risk_level?: string;
    is_flagged?: boolean;
    is_blocked?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<CustomerDebtFlag[]> => {
    const res = await apiClient.get('/debt-risk/flags', { params });
    const items = Array.isArray(res.data) ? res.data.map(normalizeFlag) : [];
    items.forEach((f) => {
      cachedFlags.set(f.customer_id, f);
    });
    return items;
  },

  /**
   * Lấy trạng thái cờ rủi ro của 1 đại lý cụ thể.
   */
  getFlag: async (customerId: string, forceRefresh = false): Promise<CustomerDebtFlag> => {
    if (!forceRefresh && cachedFlags.has(customerId)) {
      const cached = cachedFlags.get(customerId)!;
      apiClient.get(`/debt-risk/flags/${encodeURIComponent(customerId)}`).then((res) => {
        cachedFlags.set(customerId, normalizeFlag(res.data));
      }).catch(() => {});
      return cached;
    }

    const res = await apiClient.get(`/debt-risk/flags/${encodeURIComponent(customerId)}`);
    const flag = normalizeFlag(res.data);
    cachedFlags.set(customerId, flag);
    return flag;
  },

  /**
   * Kích hoạt đánh giá lại trạng thái công nợ ngay lập tức cho đại lý.
   */
  reevaluate: async (customerId: string): Promise<CustomerDebtFlag> => {
    const res = await apiClient.post(`/debt-risk/flags/${encodeURIComponent(customerId)}/reevaluate`);
    const flag = normalizeFlag(res.data);
    cachedFlags.set(customerId, flag);
    return flag;
  },

  /**
   * Xem lịch sử cảnh báo và trạng thái khoá/bỏ khoá do công nợ của đại lý.
   */
  getHistory: async (customerId: string): Promise<CustomerDebtFlagHistoryItem[]> => {
    const res = await apiClient.get(`/debt-risk/flags/${encodeURIComponent(customerId)}/history`);
    return Array.isArray(res.data) ? res.data.map(normalizeHistory) : [];
  },

  /**
   * Lịch sử cảnh báo và thay đổi trạng thái rủi ro công nợ toàn hệ thống.
   */
  getAllHistories: async (params?: {
    event_type?: string;
    customer_id?: string;
    skip?: number;
    limit?: number;
  }): Promise<CustomerDebtFlagHistoryItem[]> => {
    const res = await apiClient.get('/debt-risk/history', { params });
    return Array.isArray(res.data) ? res.data.map(normalizeHistory) : [];
  },

  /**
   * Chạy tác vụ đánh giá lại trạng thái rủi ro công nợ hằng ngày.
   */
  runDailyJob: async (): Promise<DailyEvaluationJobResponse> => {
    const res = await apiClient.post('/debt-risk/jobs/daily-evaluation');
    // Xóa cache sau khi chạy job để UI luôn đồng bộ
    cachedFlags.clear();
    cachedSummary = null;
    return res.data;
  },

  /**
   * Lấy số liệu thống kê tổng quan về rủi ro công nợ.
   */
  getSummary: async (forceRefresh = false): Promise<DebtRiskOverviewSummary> => {
    if (!forceRefresh && cachedSummary) {
      apiClient.get('/debt-risk/summary').then((res) => {
        cachedSummary = res.data;
      }).catch(() => {});
      return cachedSummary;
    }
    const res = await apiClient.get('/debt-risk/summary');
    cachedSummary = res.data;
    return cachedSummary;
  },

  /**
   * Xóa toàn bộ bộ nhớ đệm RAM.
   */
  clearCache: () => {
    cachedConfig = null;
    cachedSummary = null;
    cachedFlags.clear();
  },
};

// Helper chuẩn hóa snake_case & camelCase
function normalizeConfig(data: any): DebtRiskConfig {
  return {
    id: data.id,
    configCode: data.config_code || data.configCode || 'DEFAULT',
    autoFlagEnabled: data.auto_flag_enabled !== undefined ? Boolean(data.auto_flag_enabled) : Boolean(data.autoFlagEnabled ?? true),
    actionOnOverdue: data.action_on_overdue || data.actionOnOverdue || 'BLOCK',
    actionOnCreditLimitExceeded: data.action_on_credit_limit_exceeded || data.actionOnCreditLimitExceeded || 'REQUIRE_APPROVAL',
    gracePeriodDays: data.grace_period_days !== undefined ? Number(data.grace_period_days) : Number(data.gracePeriodDays ?? 0),
    minDebtToFlag: data.min_debt_to_flag !== undefined ? Number(data.min_debt_to_flag) : Number(data.minDebtToFlag ?? 0),
    autoLockOnFlag: data.auto_lock_on_flag !== undefined ? Boolean(data.auto_lock_on_flag) : Boolean(data.autoLockOnFlag ?? true),
    description: data.description,
    updatedBy: data.updated_by || data.updatedBy,
    updatedAt: data.updated_at || data.updatedAt,
  };
}

function normalizeFlag(data: any): CustomerDebtFlag {
  return {
    id: data.id,
    customer_id: data.customer_id || data.customerId,
    customerId: data.customer_id || data.customerId,
    customer_name: data.customer_name || data.customerName,
    customerName: data.customer_name || data.customerName,
    is_flagged: Boolean(data.is_flagged ?? data.isFlagged),
    isFlagged: Boolean(data.is_flagged ?? data.isFlagged),
    risk_level: data.risk_level || data.riskLevel || 'SAFE',
    riskLevel: data.risk_level || data.riskLevel || 'SAFE',
    action_applied: data.action_applied || data.actionApplied || 'NONE',
    actionApplied: data.action_applied || data.actionApplied || 'NONE',
    is_blocked: Boolean(data.is_blocked ?? data.isBlocked),
    isBlocked: Boolean(data.is_blocked ?? data.isBlocked),
    requires_approval: Boolean(data.requires_approval ?? data.requiresApproval),
    requiresApproval: Boolean(data.requires_approval ?? data.requiresApproval),
    total_debt: Number(data.total_debt ?? data.totalDebt ?? 0),
    totalDebt: Number(data.total_debt ?? data.totalDebt ?? 0),
    credit_limit: Number(data.credit_limit ?? data.creditLimit ?? 0),
    creditLimit: Number(data.credit_limit ?? data.creditLimit ?? 0),
    excess_amount: Number(data.excess_amount ?? data.excessAmount ?? 0),
    excessAmount: Number(data.excess_amount ?? data.excessAmount ?? 0),
    overdue_amount: Number(data.overdue_amount ?? data.overdueAmount ?? 0),
    overdueAmount: Number(data.overdue_amount ?? data.overdueAmount ?? 0),
    max_overdue_days: Number(data.max_overdue_days ?? data.maxOverdueDays ?? 0),
    maxOverdueDays: Number(data.max_overdue_days ?? data.maxOverdueDays ?? 0),
    oldest_overdue_invoice_code: data.oldest_overdue_invoice_code || data.oldestOverdueInvoiceCode,
    oldestOverdueInvoiceCode: data.oldest_overdue_invoice_code || data.oldestOverdueInvoiceCode,
    flag_reason: data.flag_reason || data.flagReason,
    flagReason: data.flag_reason || data.flagReason,
    last_evaluated_at: data.last_evaluated_at || data.lastEvaluatedAt,
    lastEvaluatedAt: data.last_evaluated_at || data.lastEvaluatedAt,
    evaluated_by: data.evaluated_by || data.evaluatedBy,
    evaluatedBy: data.evaluated_by || data.evaluatedBy,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

function normalizeHistory(data: any): CustomerDebtFlagHistoryItem {
  return {
    id: data.id,
    customer_id: data.customer_id || data.customerId,
    customerId: data.customer_id || data.customerId,
    customer_name: data.customer_name || data.customerName,
    customerName: data.customer_name || data.customerName,
    event_type: data.event_type || data.eventType,
    eventType: data.event_type || data.eventType,
    previous_risk_level: data.previous_risk_level || data.previousRiskLevel,
    previousRiskLevel: data.previous_risk_level || data.previousRiskLevel,
    new_risk_level: data.new_risk_level || data.newRiskLevel,
    newRiskLevel: data.new_risk_level || data.newRiskLevel,
    previous_is_flagged: Boolean(data.previous_is_flagged ?? data.previousIsFlagged),
    previousIsFlagged: Boolean(data.previous_is_flagged ?? data.previousIsFlagged),
    new_is_flagged: Boolean(data.new_is_flagged ?? data.newIsFlagged),
    newIsFlagged: Boolean(data.new_is_flagged ?? data.newIsFlagged),
    previous_is_blocked: Boolean(data.previous_is_blocked ?? data.previousIsBlocked),
    previousIsBlocked: Boolean(data.previous_is_blocked ?? data.previousIsBlocked),
    new_is_blocked: Boolean(data.new_is_blocked ?? data.newIsBlocked),
    newIsBlocked: Boolean(data.new_is_blocked ?? data.newIsBlocked),
    total_debt: Number(data.total_debt ?? data.totalDebt ?? 0),
    totalDebt: Number(data.total_debt ?? data.totalDebt ?? 0),
    overdue_amount: Number(data.overdue_amount ?? data.overdueAmount ?? 0),
    overdueAmount: Number(data.overdue_amount ?? data.overdueAmount ?? 0),
    excess_amount: Number(data.excess_amount ?? data.excessAmount ?? 0),
    excessAmount: Number(data.excess_amount ?? data.excessAmount ?? 0),
    max_overdue_days: Number(data.max_overdue_days ?? data.maxOverdueDays ?? 0),
    maxOverdueDays: Number(data.max_overdue_days ?? data.maxOverdueDays ?? 0),
    reason: data.reason,
    source: data.source,
    actor_username: data.actor_username || data.actorUsername,
    actorUsername: data.actor_username || data.actorUsername,
    created_at: data.created_at || data.createdAt,
    createdAt: data.created_at || data.createdAt,
  };
}
