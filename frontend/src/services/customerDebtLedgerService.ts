/**
 * Service quản lý Sổ chi tiết công nợ đại lý (Story S8-10, SCRUM-843 -> SCRUM-849).
 * Tuân thủ quy định hiệu năng AGENTS.md:
 * - Dùng API Client 127.0.0.1
 * - Cơ chế RAM In-Memory Cache chuyển tab tức thì (<0ms)
 * - Tải file Excel & PDF trực tiếp từ Backend
 */

import { apiClient } from '../api/client';
import {
  CustomerDebtLedgerResponse,
  CustomerDebtLedgerOverviewResponse,
} from '../types/debtLedger';

const CACHE_TTL_MS = 30000; // 30 giây

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CustomerDebtLedgerService {
  private memoryCache = new Map<string, CacheEntry<any>>();

  private getCacheKey(prefix: string, params: Record<string, any>): string {
    const sortedKey = Object.keys(params)
      .sort()
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return `${prefix}:${sortedKey}`;
  }

  public clearCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Lấy Sổ chi tiết công nợ của 1 đại lý có hỗ trợ lọc khoảng thời gian (SCRUM-844, SCRUM-845).
   */
  public async getLedger(
    customerId: string,
    fromDate?: string,
    toDate?: string,
    forceRefresh: boolean = false
  ): Promise<CustomerDebtLedgerResponse> {
    const cacheKey = this.getCacheKey(`ledger:${customerId}`, { from_date: fromDate, to_date: toDate });

    if (!forceRefresh) {
      const cached = this.memoryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const params: Record<string, string> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;

    const response = await apiClient.get<CustomerDebtLedgerResponse>(
      `/customer-debt-ledgers/${encodeURIComponent(customerId)}`,
      { params }
    );

    this.memoryCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    });

    return response.data;
  }

  /**
   * Lấy danh sách tổng quan công nợ các đại lý.
   */
  public async getOverview(
    search?: string,
    fromDate?: string,
    toDate?: string,
    page: number = 1,
    pageSize: number = 50,
    forceRefresh: boolean = false
  ): Promise<CustomerDebtLedgerOverviewResponse> {
    const cacheKey = this.getCacheKey('overview', {
      search,
      from_date: fromDate,
      to_date: toDate,
      page,
      page_size: pageSize,
    });

    if (!forceRefresh) {
      const cached = this.memoryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const params: Record<string, any> = { page, page_size: pageSize };
    if (search) params.search = search;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;

    const response = await apiClient.get<CustomerDebtLedgerOverviewResponse>(
      '/customer-debt-ledgers',
      { params }
    );

    this.memoryCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    });

    return response.data;
  }

  /**
   * Tải file Excel (.xlsx) chuẩn biểu mẫu kế toán Việt Nam (SCRUM-847).
   */
  public async downloadExcel(
    customerId: string,
    fromDate?: string,
    toDate?: string,
    customerName?: string
  ): Promise<void> {
    const params: Record<string, string> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;

    const response = await apiClient.get(
      `/customer-debt-ledgers/${encodeURIComponent(customerId)}/export-excel`,
      {
        params,
        responseType: 'blob',
      }
    );

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeCust = (customerName || customerId).replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    link.download = `So_chi_tiet_cong_no_${safeCust}_${fromDate || 'all'}_${toDate || 'all'}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Tải file PDF (.pdf) chuẩn vector A4 Landscape (SCRUM-846).
   */
  public async downloadPdf(
    customerId: string,
    fromDate?: string,
    toDate?: string,
    customerName?: string
  ): Promise<void> {
    const params: Record<string, string> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;

    const response = await apiClient.get(
      `/customer-debt-ledgers/${encodeURIComponent(customerId)}/export-pdf`,
      {
        params,
        responseType: 'blob',
      }
    );

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeCust = (customerName || customerId).replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    link.download = `So_chi_tiet_cong_no_${safeCust}_${fromDate || 'all'}_${toDate || 'all'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Lấy URL trang in ấn HTML và mở cửa sổ in ấn độc lập.
   */
  public openPrintWindow(customerId: string, fromDate?: string, toDate?: string): void {
    const baseURL = apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api/v1';
    const query = new URLSearchParams();
    if (fromDate) query.append('from_date', fromDate);
    if (toDate) query.append('to_date', toDate);

    const token = localStorage.getItem('kv_auth_token') || localStorage.getItem('access_token');
    const url = `${baseURL}/customer-debt-ledgers/${encodeURIComponent(customerId)}/print-html?${query.toString()}`;

    // Mở trang in trong cửa sổ mới
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
  }
}

export const customerDebtLedgerService = new CustomerDebtLedgerService();
