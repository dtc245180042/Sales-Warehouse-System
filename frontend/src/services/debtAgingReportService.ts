/**
 * Service gọi API Báo cáo Công nợ Quá hạn theo Tuổi nợ (Story S8-09).
 *
 * Tuân thủ AGENTS.md:
 * - Dùng 127.0.0.1 (không dùng localhost để tránh timeout IPv6 trên Windows).
 * - Giữ cơ chế fallback demo khi API chưa sẵn sàng.
 */
import { apiClient } from '../api/client';
import {
  DebtAgingReportResponse,
  DebtAgingReportFilter,
  DebtAgingCustomerRow,
} from '../types/DebtAgingReport';

// ===========================================================================
// DỮ LIỆU DEMO (Fallback khi backend chưa sẵn sàng)
// ===========================================================================
const DEMO_REPORT: DebtAgingReportResponse = {
  report_date: new Date().toLocaleDateString('vi-VN'),
  total_customers_with_debt: 6,
  total_debt_amount: 1_485_000_000,
  total_overdue_amount: 920_000_000,
  total_invoices_outstanding: 14,
  bucket_summaries: [
    { bucket_label: 'Chưa đến hạn', total_amount: 565_000_000, customer_count: 3, invoice_count: 5, percentage: 38.0 },
    { bucket_label: '1-30 ngày', total_amount: 180_000_000, customer_count: 2, invoice_count: 3, percentage: 12.1 },
    { bucket_label: '31-60 ngày', total_amount: 240_000_000, customer_count: 2, invoice_count: 2, percentage: 16.2 },
    { bucket_label: '61-90 ngày', total_amount: 210_000_000, customer_count: 1, invoice_count: 2, percentage: 14.1 },
    { bucket_label: 'Trên 90 ngày', total_amount: 290_000_000, customer_count: 1, invoice_count: 2, percentage: 19.5 },
  ],
  customers: [
    {
      customer_id: 'CUS-001',
      customer_name: 'Đại lý Dương Quang Trung',
      customer_code: 'DL-001',
      region: 'TP. HCM',
      assigned_sales_rep: 'Nguyễn Văn An',
      total_invoices: 3,
      total_debt: 500_000_000,
      current_amount: 0,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 210_000_000,
      bucket_over_90: 290_000_000,
      overdue_total: 500_000_000,
      overdue_ratio: 1.0,
      risk_level: 'CRITICAL',
      oldest_overdue_days: 115,
      oldest_invoice_id: 'HD-2026-0000001',
    },
    {
      customer_id: 'CUS-002',
      customer_name: 'Đại lý Trần Trung Hiếu',
      customer_code: 'DL-002',
      region: 'Hà Nội',
      assigned_sales_rep: 'Lê Thị Bình',
      total_invoices: 2,
      total_debt: 300_000_000,
      current_amount: 0,
      bucket_1_30: 0,
      bucket_31_60: 240_000_000,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_total: 240_000_000,
      overdue_ratio: 0.8,
      risk_level: 'HIGH',
      oldest_overdue_days: 48,
      oldest_invoice_id: 'HD-2026-0000002',
    },
    {
      customer_id: 'CUS-003',
      customer_name: 'Đại lý Nguyễn Thị Thu Hà',
      customer_code: 'DL-003',
      region: 'Đà Nẵng',
      assigned_sales_rep: 'Nguyễn Văn An',
      total_invoices: 2,
      total_debt: 200_000_000,
      current_amount: 0,
      bucket_1_30: 180_000_000,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_total: 180_000_000,
      overdue_ratio: 0.9,
      risk_level: 'MEDIUM',
      oldest_overdue_days: 22,
      oldest_invoice_id: 'HD-2026-0000003',
    },
    {
      customer_id: 'CUS-004',
      customer_name: 'Đại lý Công Ty Phú Quý',
      customer_code: 'DL-004',
      region: 'Cần Thơ',
      assigned_sales_rep: 'Lê Thị Bình',
      total_invoices: 3,
      total_debt: 285_000_000,
      current_amount: 285_000_000,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_total: 0,
      overdue_ratio: 0.0,
      risk_level: 'LOW',
      oldest_overdue_days: 0,
      oldest_invoice_id: undefined,
    },
    {
      customer_id: 'CUS-005',
      customer_name: 'Đại lý Minh Châu Electronics',
      customer_code: 'DL-005',
      region: 'TP. HCM',
      assigned_sales_rep: 'Phạm Văn Cảnh',
      total_invoices: 2,
      total_debt: 150_000_000,
      current_amount: 150_000_000,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_total: 0,
      overdue_ratio: 0.0,
      risk_level: 'LOW',
      oldest_overdue_days: 0,
    },
    {
      customer_id: 'CUS-006',
      customer_name: 'Đại lý Nam Tiến Phát',
      customer_code: 'DL-006',
      region: 'Hà Nội',
      assigned_sales_rep: 'Phạm Văn Cảnh',
      total_invoices: 2,
      total_debt: 50_000_000,
      current_amount: 130_000_000,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_total: 0,
      overdue_ratio: 0.0,
      risk_level: 'LOW',
      oldest_overdue_days: 0,
    },
  ],
  top_risk_customers: [],
  by_sales_rep: [
    {
      sales_rep_name: 'Nguyễn Văn An',
      customer_count: 2,
      total_debt: 700_000_000,
      overdue_total: 680_000_000,
      current_amount: 0,
      bucket_1_30: 180_000_000,
      bucket_31_60: 0,
      bucket_61_90: 210_000_000,
      bucket_over_90: 290_000_000,
      overdue_ratio: 0.97,
      high_risk_customers: 1,
    },
    {
      sales_rep_name: 'Lê Thị Bình',
      customer_count: 2,
      total_debt: 585_000_000,
      overdue_total: 240_000_000,
      current_amount: 285_000_000,
      bucket_1_30: 0,
      bucket_31_60: 240_000_000,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_ratio: 0.41,
      high_risk_customers: 1,
    },
    {
      sales_rep_name: 'Phạm Văn Cảnh',
      customer_count: 2,
      total_debt: 200_000_000,
      overdue_total: 0,
      current_amount: 280_000_000,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      overdue_ratio: 0.0,
      high_risk_customers: 0,
    },
  ],
};

// Top risk customers derived from demo data
DEMO_REPORT.top_risk_customers = DEMO_REPORT.customers
  .filter((c) => c.risk_level !== 'LOW')
  .slice(0, 10);

// ===========================================================================
// SERVICE
// ===========================================================================
export const debtAgingReportService = {
  /**
   * Lấy báo cáo công nợ quá hạn theo tuổi nợ.
   * Fallback về dữ liệu demo nếu API chưa sẵn sàng.
   */
  getReport: async (filters?: DebtAgingReportFilter): Promise<DebtAgingReportResponse> => {
    try {
      const params: Record<string, string> = {};
      if (filters?.customer_id) params.customer_id = filters.customer_id;
      if (filters?.sales_rep) params.sales_rep = filters.sales_rep;
      if (filters?.region) params.region = filters.region;
      if (filters?.as_of_date) params.as_of_date = filters.as_of_date;

      const res = await apiClient.get<DebtAgingReportResponse>('/debt-aging-reports', { params });
      if (res.data && typeof res.data.total_customers_with_debt === 'number') {
        return res.data;
      }
    } catch (err) {
      console.warn('[debtAgingReportService] Fallback to demo data:', err);
    }
    // Lọc demo data theo filter
    let demo = { ...DEMO_REPORT };
    if (filters?.sales_rep) {
      const repFilter = filters.sales_rep.toLowerCase();
      demo = {
        ...demo,
        customers: demo.customers.filter(
          (c) => c.assigned_sales_rep?.toLowerCase().includes(repFilter)
        ),
      };
    }
    if (filters?.region) {
      const regionFilter = filters.region.toLowerCase();
      demo = {
        ...demo,
        customers: demo.customers.filter(
          (c) => c.region?.toLowerCase().includes(regionFilter)
        ),
      };
    }
    return demo;
  },

  /**
   * Xuất Excel - gọi URL download trực tiếp.
   */
  exportExcel: async (filters?: DebtAgingReportFilter): Promise<void> => {
    const params = new URLSearchParams();
    if (filters?.customer_id) params.append('customer_id', filters.customer_id);
    if (filters?.sales_rep) params.append('sales_rep', filters.sales_rep);
    if (filters?.region) params.append('region', filters.region);
    if (filters?.as_of_date) params.append('as_of_date', filters.as_of_date);

    const token =
      localStorage.getItem('kv_auth_token') ||
      localStorage.getItem('user_token') ||
      localStorage.getItem('access_token');

    const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/v1';
    const url = `${baseUrl}/debt-aging-reports/export?${params.toString()}`;

    // Dùng fetch để xử lý blob download với Authorization header
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error('Không thể xuất Excel. Vui lòng thử lại.');
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `BaoCaoCongNoQuaHan_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  },
};
