import { apiClient } from '../api/client';
import {
  ExecutiveDashboardResponse,
  DashboardKPISummary,
  DailySalesPoint,
  RegionalSalesPoint,
  OverdueAgencyItem,
} from '../types/executiveDashboard';

export const executiveDashboardService = {
  /**
   * Lấy toàn bộ số liệu tổng hợp cho Dashboard điều hành (SLA < 2s)
   */
  async getDashboardData(params?: {
    period?: string;
    custom_start?: string;
    custom_end?: string;
    region?: string;
    refresh?: boolean;
  }): Promise<ExecutiveDashboardResponse> {
    const res = await apiClient.get<ExecutiveDashboardResponse>('/executive-dashboard', {
      params,
    });
    return res.data;
  },

  /**
   * Chỉ lấy các thẻ chỉ số KPI
   */
  async getKPIs(params?: {
    period?: string;
    region?: string;
    refresh?: boolean;
  }): Promise<DashboardKPISummary> {
    const res = await apiClient.get<DashboardKPISummary>('/executive-dashboard/kpis', {
      params,
    });
    return res.data;
  },

  /**
   * Danh sách đại lý quá hạn công nợ
   */
  async getOverdueAgencies(params?: {
    region?: string;
    refresh?: boolean;
  }): Promise<OverdueAgencyItem[]> {
    const res = await apiClient.get<OverdueAgencyItem[]>('/executive-dashboard/overdue-agencies', {
      params,
    });
    return res.data;
  },

  /**
   * Dữ liệu biểu đồ doanh số theo ngày
   */
  async getDailySales(params?: {
    period?: string;
    region?: string;
    refresh?: boolean;
  }): Promise<DailySalesPoint[]> {
    const res = await apiClient.get<DailySalesPoint[]>('/executive-dashboard/daily-sales', {
      params,
    });
    return res.data;
  },

  /**
   * Dữ liệu biểu đồ doanh số theo khu vực
   */
  async getRegionalSales(params?: {
    period?: string;
    refresh?: boolean;
  }): Promise<RegionalSalesPoint[]> {
    const res = await apiClient.get<RegionalSalesPoint[]>('/executive-dashboard/regional-sales', {
      params,
    });
    return res.data;
  },

  /**
   * Xóa cache trên máy chủ
   */
  async clearCache(): Promise<void> {
    await apiClient.post('/executive-dashboard/clear-cache');
  },
};
