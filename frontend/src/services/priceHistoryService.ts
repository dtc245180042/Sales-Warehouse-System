import { apiClient } from '../api/client';
import {
  ProductPriceHistoryItem,
  ProductPriceHistoryFilterParams,
  ProductPriceHistoryListResponse,
} from '../types/PriceHistory';

function mapApiHistoryItem(data: any): ProductPriceHistoryItem {
  return {
    id: data.id,
    batchId: data.batch_id || data.batchId,
    productId: String(data.product_id || data.productId || ''),
    productSku: data.product_sku || data.productSku || '',
    productName: data.product_name || data.productName || '',
    priceListId: data.price_list_id || data.priceListId,
    priceListName: data.price_list_name || data.priceListName,
    customerGroup: data.customer_group || data.customerGroup,
    priceType: data.price_type || data.priceType || 'LISTED_PRICE',
    oldPrice: Number(data.old_price ?? data.oldPrice ?? 0),
    newPrice: Number(data.new_price ?? data.newPrice ?? 0),
    changeDiff: Number(data.change_diff ?? data.changeDiff ?? 0),
    changePercent: Number(data.change_percent ?? data.changePercent ?? 0),
    reason: data.reason || '',
    effectiveFrom: data.effective_from || data.effectiveFrom || data.created_at || '',
    changedById: data.changed_by_id || data.changedById,
    changedByName: data.changed_by_name || data.changedByName || 'Hệ thống',
    changedByRole: data.changed_by_role || data.changedByRole || 'System',
    createdAt: data.created_at || data.createdAt || '',
  };
}

let memoryCachePriceHistory: ProductPriceHistoryListResponse | null = null;

export const priceHistoryService = {
  getCached: (): ProductPriceHistoryListResponse | null => {
    return memoryCachePriceHistory;
  },

  getAllPriceHistories: async (
    params: ProductPriceHistoryFilterParams = {}
  ): Promise<ProductPriceHistoryListResponse> => {
    try {
      const queryParams: Record<string, any> = {
        page: params.page || 1,
        limit: params.limit || 20,
      };
      if (params.productId) queryParams.product_id = params.productId;
      if (params.search) queryParams.search = params.search;
      if (params.customerGroup && params.customerGroup !== 'ALL') {
        queryParams.customer_group = params.customerGroup;
      }
      if (params.priceType && params.priceType !== 'ALL') {
        queryParams.price_type = params.priceType;
      }
      if (params.fromDate) queryParams.from_date = params.fromDate;
      if (params.toDate) queryParams.to_date = params.toDate;

      const res = await apiClient.get('/price-histories', { params: queryParams });
      const result: ProductPriceHistoryListResponse = {
        items: Array.isArray(raw.items) ? raw.items.map(mapApiHistoryItem) : [],
        total: raw.total || 0,
        page: raw.page || 1,
        limit: raw.limit || 20,
        totalPages: raw.total_pages || raw.totalPages || 1,
      };
      memoryCachePriceHistory = result;
      return result;
    } catch (error) {
      console.warn('[priceHistoryService] Error fetching all price histories:', error);
      return { items: [], total: 0, page: 1, limit: 20, totalPages: 1 };
    }
  },

  getByProductId: async (
    productId: string,
    params: Omit<ProductPriceHistoryFilterParams, 'productId'> = {}
  ): Promise<ProductPriceHistoryListResponse> => {
    try {
      const queryParams: Record<string, any> = {
        page: params.page || 1,
        limit: params.limit || 20,
      };
      if (params.customerGroup && params.customerGroup !== 'ALL') {
        queryParams.customer_group = params.customerGroup;
      }
      if (params.fromDate) queryParams.from_date = params.fromDate;
      if (params.toDate) queryParams.to_date = params.toDate;

      const res = await apiClient.get(`/products/${encodeURIComponent(productId)}/price-history`, {
        params: queryParams,
      });
      const raw = res.data;
      return {
        items: Array.isArray(raw.items) ? raw.items.map(mapApiHistoryItem) : [],
        total: raw.total || 0,
        page: raw.page || 1,
        limit: raw.limit || 20,
        totalPages: raw.total_pages || raw.totalPages || 1,
      };
    } catch (error) {
      console.warn(`[priceHistoryService] Error fetching history for product ${productId}:`, error);
      return { items: [], total: 0, page: 1, limit: 20, totalPages: 1 };
    }
  },
};
