import { apiClient } from '../api/client';

export interface PortalProfile {
  user_id: number;
  username: string;
  email: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  customer_phone: string;
  customer_group: string;
  region?: string;
  address?: string;
  status?: string;
}

export interface PortalCredit {
  credit_limit: number;
  max_debt_days: number;
  dispatched_debt: number;
  committed_debt: number;
  total_used_credit: number;
  available_credit: number;
  has_overdue: boolean;
  allow_order_on_credit: boolean;
}

export interface PortalProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  packaging_spec?: string;
  image_url?: string;
  sale_price: number;
  stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  min_order_quantity: number;
}

export interface PortalDeliveryAddress {
  id: number;
  customer_id: string;
  name: string;
  receiver_name: string;
  phone: string;
  address: string;
  is_default: boolean;
  status: string;
}

export interface CartCalculationResult {
  items: Array<{
    product_id: string;
    sku: string;
    name: string;
    unit: string;
    unit_price: number;
    quantity: number;
    line_subtotal: number;
    discount_rate: number;
    line_discount: number;
    line_total: number;
    applied_policy_name?: string;
  }>;
  subtotal: number;
  total_discount: number;
  tax_amount: number;
  total_amount: number;
}

export const portalService = {
  getProfile: async (): Promise<PortalProfile> => {
    const res = await apiClient.get<PortalProfile>('/portal/me');
    return res.data;
  },

  getCredit: async (): Promise<PortalCredit> => {
    const res = await apiClient.get<PortalCredit>('/portal/credit');
    return res.data;
  },

  getProducts: async (params?: { search?: string; category_id?: number; page?: number; limit?: number }) => {
    const res = await apiClient.get<{ items: PortalProduct[]; total: number; page: number; limit: number }>('/portal/products', { params });
    return res.data;
  },

  getDeliveryAddresses: async (): Promise<PortalDeliveryAddress[]> => {
    const res = await apiClient.get<PortalDeliveryAddress[]>('/portal/delivery-addresses');
    return res.data;
  },

  calculateCart: async (items: Array<{ product_id: string; quantity: number; unit: string }>): Promise<CartCalculationResult> => {
    const res = await apiClient.post<CartCalculationResult>('/portal/cart/calculate', { items });
    return res.data;
  },

  createOrder: async (data: {
    expected_total: number;
    delivery_address_id: number;
    delivery_notes?: string;
    items: Array<{ product_id: string; quantity: number; unit: string }>;
  }, idempotencyKey: string) => {
    const res = await apiClient.post('/portal/orders', data, {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    });
    return res.data;
  },
};
