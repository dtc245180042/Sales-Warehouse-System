export type TripStatusType = 'PLANNED' | 'READY' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
export type PointStatusType = 'PENDING' | 'DELIVERING' | 'DELIVERED' | 'PARTIAL' | 'FAILED';

export interface PendingDispatchForRouting {
  id: string;
  order_id: string;
  customer_id: string;
  customer_name?: string;
  customer_address?: string;
  detected_area?: string;
  total_items: number;
  total_dispatched_quantity: number;
  order_total_value: number;
  dispatched_at?: string;
}

export interface AreaGroupingSuggestion {
  area: string;
  dispatch_count: number;
  total_packages: number;
  total_value: number;
  dispatches: PendingDispatchForRouting[];
}

export interface DeliveryTripPointItem {
  id: number;
  point_id: number;
  product_id: string;
  sku?: string;
  product_name?: string;
  unit?: string;
  dispatched_quantity: number;
  delivered_quantity: number;
  undelivered_quantity: number;
  unit_price: number;
  total_price: number;
  delivered_amount: number;
  in_transit_amount: number;
  status: string;
  notes?: string;
}

export interface DeliveryTripPoint {
  id: number;
  trip_id: string;
  stop_order: number;
  dispatch_id?: string;
  order_id?: string;
  customer_id?: string;
  customer_name?: string;
  delivery_address?: string;
  area?: string;
  contact_phone?: string;
  contact_person?: string;
  expected_arrival_time?: string;
  actual_arrival_time?: string;
  status: PointStatusType;
  total_items_count: number;
  delivered_items_count: number;
  undelivered_items_count: number;
  point_value: number;
  delivered_value: number;
  remaining_value: number;
  is_delayed: boolean;
  completion_notes?: string;
  failure_reason?: string;
  hold_on_trip: boolean;
  items: DeliveryTripPointItem[];
}

export interface DeliveryTrip {
  id: string;
  trip_code: string;
  warehouse_id: number;
  warehouse_name?: string;
  area?: string;
  driver_id?: number;
  driver_name?: string;
  driver_phone?: string;
  vehicle_id?: string;
  license_plate?: string;
  vehicle_type?: string;
  status: TripStatusType;
  started_at?: string;
  expected_completion_time?: string;
  actual_completion_time?: string;
  total_points: number;
  delivered_points: number;
  remaining_points: number;
  failed_points: number;
  total_packages: number;
  initial_total_value: number;
  delivered_value: number;
  in_transit_value: number;
  is_delayed: boolean;
  delay_minutes: number;
  delay_warning?: string;
  delay_level?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  points: DeliveryTripPoint[];
}

export interface DeliveryTripCreatePayload {
  warehouse_id: number;
  area?: string;
  driver_id?: number;
  driver_name?: string;
  driver_phone?: string;
  vehicle_id?: string;
  license_plate?: string;
  vehicle_type?: string;
  expected_completion_time?: string;
  notes?: string;
  dispatch_ids: string[];
}

export interface TripDriverVehicleAssignPayload {
  driver_id?: number;
  driver_name?: string;
  driver_phone?: string;
  vehicle_id?: string;
  license_plate?: string;
  vehicle_type?: string;
  notes?: string;
}

export interface DeliveryManifestStopItem {
  product_id: string;
  sku?: string;
  product_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface DeliveryManifestStop {
  stop_order: number;
  point_id: number;
  dispatch_id?: string;
  order_id?: string;
  customer_name?: string;
  delivery_address?: string;
  area?: string;
  contact_phone?: string;
  contact_person?: string;
  total_items_count: number;
  point_value: number;
  items: DeliveryManifestStopItem[];
  completion_notes?: string;
}

export interface DeliveryManifestResponse {
  trip_id: string;
  trip_code: string;
  warehouse_id: number;
  warehouse_name?: string;
  area?: string;
  driver_name?: string;
  driver_phone?: string;
  license_plate?: string;
  vehicle_type?: string;
  status: string;
  created_at?: string;
  expected_completion_time?: string;
  notes?: string;
  total_stops: number;
  total_packages: number;
  total_trip_value: number;
  stops: DeliveryManifestStop[];
}
