export interface ProductPriceHistoryItem {
  id: number;
  batchId?: string;
  productId: string;
  productSku?: string;
  productName: string;
  priceListId?: number;
  priceListName?: string;
  customerGroup?: string;
  priceType: 'LISTED_PRICE' | 'FLOOR_PRICE' | 'SALE_PRICE' | string;
  oldPrice: number;
  newPrice: number;
  changeDiff: number;
  changePercent: number;
  reason: string;
  effectiveFrom: string;
  changedById?: number;
  changedByName?: string;
  changedByRole?: string;
  createdAt: string;
}

export interface ProductPriceHistoryFilterParams {
  productId?: string;
  search?: string;
  customerGroup?: string;
  priceType?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface ProductPriceHistoryListResponse {
  items: ProductPriceHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
