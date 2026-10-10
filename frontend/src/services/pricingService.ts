import { apiClient } from './api';
import {
  LinePricingLookupRequest,
  LinePricingLookupResponse,
  EffectivePriceListResponse,
} from '../types/Pricing';

export const pricingService = {
  /**
   * SCRUM-488 & SCRUM-489: Tra cứu giá bán mặc định, giá sàn và chiết khấu sản lượng cho một dòng hàng
   */
  async lookupLinePricing(
    request: LinePricingLookupRequest
  ): Promise<LinePricingLookupResponse> {
    const response = await apiClient.post<LinePricingLookupResponse>(
      '/order-pricings/lookup-line',
      request
    );
    return response.data;
  },

  /**
   * Tra cứu bảng giá đang có hiệu lực áp dụng cho khách hàng/nhóm đại lý
   */
  async getEffectivePriceList(
    customerId: string
  ): Promise<EffectivePriceListResponse> {
    const response = await apiClient.get<EffectivePriceListResponse>(
      `/order-pricings/effective-price-list/${encodeURIComponent(customerId)}`
    );
    return response.data;
  },

  /**
   * Kiểm tra toàn bộ giỏ hàng, bảng giá hiệu lực, giá sàn và tính lại chiết khấu
   */
  async validateCart(data: {
    customer_id: string;
    items: Array<{
      product_id: string;
      sku: string;
      quantity: number;
      custom_price?: number;
    }>;
    price_list_id?: number;
  }) {
    const response = await apiClient.post(
      '/order-pricings/validate-cart',
      data
    );
    return response.data;
  },
};

export default pricingService;
