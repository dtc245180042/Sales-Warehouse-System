export interface LinePricingLookupRequest {
  customer_id: string;
  product_id?: string;
  sku?: string;
  quantity?: number;
  custom_price?: number;
}

export interface LinePricingLookupResponse {
  success: boolean;
  has_effective_price_list: boolean;
  price_list_id?: number | null;
  price_list_code?: string | null;
  price_list_name?: string | null;
  customer_id: string;
  customer_group: string;
  customer_group_label: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  listed_price: number;
  default_price: number;
  floor_price: number;
  applied_unit_price: number;
  is_manual_price: boolean;
  is_below_floor: boolean;
  requires_approval: boolean;
  approval_reason?: string | null;
  quantity: number;
  discount_rate: number;
  discount_amount_per_unit: number;
  total_discount: number;
  final_unit_price: number;
  line_total: number;
  applied_discount_policy_id?: number | null;
  applied_discount_policy_name?: string | null;
  message?: string | null;
}

export interface EffectivePriceListResponse {
  has_effective_price_list: boolean;
  customer: {
    id: string;
    code: string;
    name: string;
    customer_group: string;
    customer_group_label: string;
  };
  price_list?: {
    id: number;
    code: string;
    name: string;
    scope_type: string;
    target_group: string;
    valid_from: string;
    valid_to?: string | null;
    items_count: number;
  } | null;
  message?: string | null;
}
