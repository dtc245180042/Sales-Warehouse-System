import { apiClient } from './api';

export interface OrderPrintData {
  order_id: string;
  order_code: string;
  created_at: string;
  status: string;
  status_title: string;
  status_badge_color: string;
  status_badge_bg: string;
  watermark: string | null;
  is_valid: boolean;
  barcode_svg: string;
  company_info: {
    name: string;
    address: string;
    hotline: string;
    email: string;
  };
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string;
    tax_code: string;
    address: string;
  };
  delivery: {
    receiver_name: string;
    receiver_phone: string;
    address: string;
    expected_date: string;
    notes: string;
  };
  staff: {
    id: string;
    name: string;
  };
  items: Array<{
    stt: number;
    product_id: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    price: number;
    price_formatted: string;
    discount_display: string;
    discount_amount: number;
    subtotal: number;
    subtotal_formatted: string;
    applied_discount_policy_name?: string;
  }>;
  financials: {
    subtotal_before_discount: number;
    subtotal_before_discount_formatted: string;
    discount_total: number;
    discount_total_formatted: string;
    net_after_discount: number;
    net_after_discount_formatted: string;
    tax_amount: number;
    tax_amount_formatted: string;
    final_total: number;
    final_total_formatted: string;
    paid_amount: number;
    paid_amount_formatted: string;
    remaining_debt: number;
    remaining_debt_formatted: string;
    payment_method: string;
    payment_status: string;
  };
  note: string;
}

export const orderPrintService = {
  /**
   * Lấy trang HTML in ấn chuẩn A4 hoàn chỉnh từ Backend (SSOT)
   */
  getPrintHtml: async (orderId: string): Promise<string> => {
    const response = await apiClient.get<string>(`/orders/${orderId}/print-html`, {
      responseType: 'text',
    });
    return response.data;
  },

  /**
   * Lấy cấu trúc JSON đầy đủ của chứng từ in ấn đơn hàng
   */
  getPrintData: async (orderId: string): Promise<OrderPrintData> => {
    const response = await apiClient.get<OrderPrintData>(`/orders/${orderId}/print-data`);
    return response.data;
  },
};
