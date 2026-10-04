export interface Category {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  parent_id?: number | null;
  level: number;
  is_active: boolean;
  product_count: number;
  children_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface CategoryTree extends Category {
  children: CategoryTree[];
}

export interface CategoryProduct {
  id: number;
  sku: string;
  name: string;
  category_id?: number | null;
  category_name?: string | null;
  price: number;
  unit: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface TransferProductsPayload {
  source_category_id: number;
  target_category_id: number;
  product_ids: number[];
}

export interface TransferProductsResponse {
  success: boolean;
  transferred_count: number;
  message: string;
  target_category_name: string;
}
