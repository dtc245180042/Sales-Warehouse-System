import { apiClient } from '../api/client';
import {
  AgencyDebtReportItem,
  AgencyDebtReportResponse,
  AgencyDebtDetailResponse,
  AgencyDebtFilterParams,
  AgencyDebtSummary,
} from '../types/AgencyDebt';

const DEMO_AGENCY_DEBT_ITEMS: AgencyDebtReportItem[] = [
  {
    customer_id: 'CUS-001',
    customer_code: 'DL-001',
    customer_name: 'Đại lý Dương Quang Trung',
    phone: '0901234567',
    address: '128 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM',
    tax_code: '0101010101',
    region: 'Miền Nam',
    customer_group: 'TIER_1',
    assigned_sales_rep: 'Lê Thị Nhân Viên Kinh Doanh',
    credit_limit: 300000000,
    max_debt_days: 30,
    total_receivable: 285890000,
    total_paid: 100000000,
    total_debt: 185890000,
    debt_0_30: 120000000,
    debt_31_60: 65890000,
    debt_61_90: 0,
    debt_over_90: 0,
    overdue_debt: 65890000,
    max_overdue_days: 12,
    is_overdue: true,
    unpaid_invoices_count: 2,
    oldest_invoice_date: '2026-09-02T08:00:00Z',
  },
  {
    customer_id: 'CUS-002',
    customer_code: 'DL-002',
    customer_name: 'Đại lý Trần Trung Hiếu',
    phone: '0902345678',
    address: '45 Phố Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
    tax_code: '0202020202',
    region: 'Miền Bắc',
    customer_group: 'WHOLESALE',
    assigned_sales_rep: 'Nguyễn Văn Giám Đốc Kinh Doanh',
    credit_limit: 200000000,
    max_debt_days: 45,
    total_receivable: 131835000,
    total_paid: 50000000,
    total_debt: 81835000,
    debt_0_30: 81835000,
    debt_31_60: 0,
    debt_61_90: 0,
    debt_over_90: 0,
    overdue_debt: 0,
    max_overdue_days: 0,
    is_overdue: false,
    unpaid_invoices_count: 1,
    oldest_invoice_date: '2026-10-05T09:00:00Z',
  },
  {
    customer_id: 'CUS-003',
    customer_code: 'DL-003',
    customer_name: 'Công ty TNHH Thiết Bị Số Minh Anh',
    phone: '0903456789',
    address: '25 Nguyễn Tri Phương, Quận Thanh Khê, Đà Nẵng',
    tax_code: '0303030303',
    region: 'Miền Trung',
    customer_group: 'VIP',
    assigned_sales_rep: 'Lê Thị Nhân Viên Kinh Doanh',
    credit_limit: 500000000,
    max_debt_days: 30,
    total_receivable: 450000000,
    total_paid: 150000000,
    total_debt: 300000000,
    debt_0_30: 100000000,
    debt_31_60: 80000000,
    debt_61_90: 70000000,
    debt_over_90: 50000000,
    overdue_debt: 120000000,
    max_overdue_days: 42,
    is_overdue: true,
    unpaid_invoices_count: 4,
    oldest_invoice_date: '2026-07-15T10:00:00Z',
  },
  {
    customer_id: 'CUS-004',
    customer_code: 'DL-004',
    customer_name: 'Đại lý Điện Máy Toàn Thắng',
    phone: '0904567890',
    address: '88 Đường 30 Tháng 4, Quận Ninh Kiều, Cần Thơ',
    tax_code: '0404040404',
    region: 'Miền Nam',
    customer_group: 'TIER_2',
    assigned_sales_rep: 'Lê Thị Nhân Viên Kinh Doanh',
    credit_limit: 150000000,
    max_debt_days: 15,
    total_receivable: 98000000,
    total_paid: 20000000,
    total_debt: 78000000,
    debt_0_30: 40000000,
    debt_31_60: 38000000,
    debt_61_90: 0,
    debt_over_90: 0,
    overdue_debt: 38000000,
    max_overdue_days: 18,
    is_overdue: true,
    unpaid_invoices_count: 2,
    oldest_invoice_date: '2026-09-12T14:00:00Z',
  },
  {
    customer_id: 'CUS-005',
    customer_code: 'DL-005',
    customer_name: 'Đại lý Bán Lẻ Hoàng Long',
    phone: '0905678901',
    address: '76 Lạch Tray, Quận Ngô Quyền, Hải Phòng',
    tax_code: '0505050505',
    region: 'Miền Bắc',
    customer_group: 'RETAIL',
    assigned_sales_rep: 'Nguyễn Văn Giám Đốc Kinh Doanh',
    credit_limit: 100000000,
    max_debt_days: 30,
    total_receivable: 62000000,
    total_paid: 62000000,
    total_debt: 0,
    debt_0_30: 0,
    debt_31_60: 0,
    debt_61_90: 0,
    debt_over_90: 0,
    overdue_debt: 0,
    max_overdue_days: 0,
    is_overdue: false,
    unpaid_invoices_count: 0,
    oldest_invoice_date: undefined,
  },
];

const calculateDemoSummary = (items: AgencyDebtReportItem[]): AgencyDebtSummary => {
  return {
    total_customers: items.length,
    total_receivable: items.reduce((sum, i) => sum + i.total_receivable, 0),
    total_paid: items.reduce((sum, i) => sum + i.total_paid, 0),
    total_debt: items.reduce((sum, i) => sum + i.total_debt, 0),
    total_debt_0_30: items.reduce((sum, i) => sum + i.debt_0_30, 0),
    total_debt_31_60: items.reduce((sum, i) => sum + i.debt_31_60, 0),
    total_debt_61_90: items.reduce((sum, i) => sum + i.debt_61_90, 0),
    total_debt_over_90: items.reduce((sum, i) => sum + i.debt_over_90, 0),
    total_overdue_debt: items.reduce((sum, i) => sum + i.overdue_debt, 0),
    overdue_customers_count: items.filter((i) => i.is_overdue).length,
  };
};

// In-Memory RAM Cache để hiển thị ngay tức thì 0ms (Tuân thủ AGENTS.md Quy tắc 3 & 6)
let memoryCacheReport: Record<string, AgencyDebtReportResponse> = {};
let lastFetchTime: Record<string, number> = {};
const CACHE_TTL_MS = 30000; // 30s cache TTL

export const agencyDebtService = {
  /**
   * Lấy dữ liệu báo cáo từ RAM cache (nếu có) để hiển thị tức thì 0ms,
   * tránh màn hình trắng khi chuyển tab.
   */
  getCachedReport: (params?: AgencyDebtFilterParams): AgencyDebtReportResponse | null => {
    const cacheKey = JSON.stringify(params || {});
    const cached = memoryCacheReport[cacheKey];
    const timestamp = lastFetchTime[cacheKey] || 0;
    if (cached && Date.now() - timestamp < CACHE_TTL_MS) {
      return cached;
    }
    return null;
  },

  /**
   * Truy vấn danh sách sổ công nợ theo đại lý kèm phân tích tuổi nợ.
   */
  getAgencyDebtReport: async (
    params?: AgencyDebtFilterParams,
    forceRefresh: boolean = false
  ): Promise<AgencyDebtReportResponse> => {
    const cacheKey = JSON.stringify(params || {});
    if (!forceRefresh) {
      const cached = agencyDebtService.getCachedReport(params);
      if (cached) return cached;
    }

    try {
      const res = await apiClient.get<AgencyDebtReportResponse>('/agency-debt-reports', {
        params,
      });
      if (res.data && res.data.items) {
        memoryCacheReport[cacheKey] = res.data;
        lastFetchTime[cacheKey] = Date.now();
        return res.data;
      }
    } catch (err) {
      console.warn('[agencyDebtService] Fallback to demo agency debt data:', err);
    }

    // Fallback dữ liệu mẫu khi chưa kết nối backend
    let filtered = [...DEMO_AGENCY_DEBT_ITEMS];
    if (params?.has_debt_only) {
      filtered = filtered.filter((x) => x.total_debt > 0 || x.total_receivable > 0);
    }
    if (params?.only_overdue) {
      filtered = filtered.filter((x) => x.is_overdue);
    }
    if (params?.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.customer_code.toLowerCase().includes(s) ||
          x.customer_name.toLowerCase().includes(s) ||
          (x.phone && x.phone.includes(s))
      );
    }
    if (params?.region) {
      filtered = filtered.filter((x) => x.region === params.region);
    }
    if (params?.customer_group) {
      filtered = filtered.filter((x) => x.customer_group === params.customer_group);
    }
    if (params?.aging_group) {
      if (params.aging_group === '0_30') filtered = filtered.filter((x) => x.debt_0_30 > 0);
      else if (params.aging_group === '31_60') filtered = filtered.filter((x) => x.debt_31_60 > 0);
      else if (params.aging_group === '61_90') filtered = filtered.filter((x) => x.debt_61_90 > 0);
      else if (params.aging_group === 'over_90' || params.aging_group === '>90')
        filtered = filtered.filter((x) => x.debt_over_90 > 0);
    }

    const summary = calculateDemoSummary(filtered);
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    const fallbackResponse: AgencyDebtReportResponse = {
      items: paginated,
      summary,
      total: filtered.length,
      page,
      limit,
      as_of_date: params?.as_of_date || new Date().toISOString().split('T')[0],
    };

    memoryCacheReport[cacheKey] = fallbackResponse;
    lastFetchTime[cacheKey] = Date.now();
    return fallbackResponse;
  },

  /**
   * Lấy chi tiết các hóa đơn còn nợ của một đại lý (Drill-down).
   */
  getAgencyDebtInvoices: async (
    customerId: string,
    asOfDate?: string
  ): Promise<AgencyDebtDetailResponse> => {
    try {
      const res = await apiClient.get<AgencyDebtDetailResponse>(
        `/agency-debt-reports/${customerId}/invoices`,
        {
          params: { as_of_date: asOfDate },
        }
      );
      if (res.data && res.data.customer) {
        return res.data;
      }
    } catch (err) {
      console.warn(`[agencyDebtService] Fallback to demo detail for ${customerId}:`, err);
    }

    const foundCust =
      DEMO_AGENCY_DEBT_ITEMS.find((c) => c.customer_id === customerId) ||
      DEMO_AGENCY_DEBT_ITEMS[0];

    return {
      customer: foundCust,
      invoices: [
        {
          invoice_id: `HD-2026-0000001`,
          issued_at: '2026-09-02T08:00:00Z',
          due_date: '2026-10-02T08:00:00Z',
          total_amount: 150000000,
          paid_amount: 84110000,
          remaining_amount: 65890000,
          status: 'PARTIALLY_PAID',
          aging_days: 43,
          aging_bucket: '31_60',
          days_overdue: 13,
          is_overdue: true,
          notes: 'Lô máy chủ Dell PowerEdge',
        },
        {
          invoice_id: `HD-2026-0000002`,
          issued_at: '2026-10-01T08:00:00Z',
          due_date: '2026-10-31T08:00:00Z',
          total_amount: 135890000,
          paid_amount: 15890000,
          remaining_amount: 120000000,
          status: 'PARTIALLY_PAID',
          aging_days: 14,
          aging_bucket: '0_30',
          days_overdue: 0,
          is_overdue: false,
          notes: 'Lô máy trạm HP Zbook',
        },
      ],
    };
  },

  /**
   * Tải xuống file Excel báo cáo sổ công nợ theo đại lý (SCRUM-724).
   */
  exportAgencyDebtExcel: async (params?: AgencyDebtFilterParams): Promise<void> => {
    try {
      const res = await apiClient.get('/agency-debt-reports/export-excel', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const dateStr = (params?.as_of_date || new Date().toISOString().split('T')[0]).replace(
        /-/g,
        ''
      );
      link.setAttribute('download', `so_cong_no_theo_dai_ly_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[agencyDebtService] Export Excel error:', err);
      throw err;
    }
  },

  /**
   * Xóa toàn bộ bộ nhớ đệm RAM khi người dùng bấm nút làm mới.
   */
  invalidateCache: () => {
    memoryCacheReport = {};
    lastFetchTime = {};
  },
};
