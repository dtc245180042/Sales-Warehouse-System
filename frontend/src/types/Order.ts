export type OrderStatus = 'draft' | 'pending' | 'pending_approval' | 'confirmed' | 'shipping' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'transfer' | 'card';
export type PaymentStatus = 'paid' | 'unpaid' | 'partial';

export interface OrderItem {
  productId: string;
  product_id?: string | number;
  sku: string;
  name: string;
  unit?: string;
  price: number;
  quantity: number;
  discount: number;
  subtotal: number;
  floorPrice?: number;
  floor_price?: number;
  isBelowFloor?: boolean;
  is_below_floor?: boolean;
  appliedDiscountPolicyName?: string;
  applied_discount_policy_name?: string;
  appliedDiscountPolicyId?: number;
  applied_discount_policy_id?: number;
  discountRate?: number;
  discount_rate?: number;
  discountAmount?: number;
  discount_amount?: number;
  availableStock?: number;
  available_stock?: number;
  physicalStock?: number;
  physical_stock?: number;
  reservedStock?: number;
  reserved_stock?: number;
  warehouse?: string;
  maxOrderableQuantity?: number;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  staffId: string;
  staffName: string;
  note?: string;
  requiresApproval?: boolean;
  approvalReason?: string;
  customerIsLocked?: boolean;
  customerLockWarning?: string;
  deliveryAddressId?: number;
  deliveryAddressName?: string;
  deliveryReceiverName?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  expectedDeliveryDate?: string;
  copiedFromOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderCopyResponse {
  order: Order;
  warnings: string[];
  message: string;
}

export interface OrderCalculateItem {
  product_id: string | number;
  quantity: number;
  price?: number;
  unit?: string;
}

export interface OrderCalculateRequest {
  customer_id: string;
  items: OrderCalculateItem[];
  price_list_id?: number;
}

export interface OrderCalculateItemResponse {
  product_id: string;
  sku?: string;
  name: string;
  unit?: string;
  unit_price: number;
  quantity: number;
  discount_amount: number;
  discount_rate?: number;
  subtotal: number;
  applied_discount_name?: string;
}

export interface OrderCalculateResponse {
  subtotal: number;
  discount: number;
  total: number;
  items: OrderCalculateItemResponse[];
}

export interface ProductSearchForOrder {
  id: number | string;
  sku: string;
  name: string;
  price: number;
  sale_price: number;
  stock: number;
  available_stock?: number;
  physical_stock?: number;
  reserved_stock?: number;
  warehouse?: string;
  unit: string;
  packaging_spec?: string;
  available_units: string[];
}

export interface LineItemAvailabilityResult {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  requested_quantity: number;
  physical_stock: number;
  reserved_stock: number;
  available_stock: number;
  max_orderable_quantity: number;
  warehouse_name: string;
  warehouse_code: string;
  is_available: boolean;
  warning_message?: string;
}

export interface CheckOrderAvailabilityResponse {
  customer_id: string;
  warehouse_name: string;
  warehouse_code: string;
  all_items_available: boolean;
  items: LineItemAvailabilityResult[];
  summary_message?: string;
}
