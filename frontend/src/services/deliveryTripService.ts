import { apiClient } from '../api/client';
import {
  DeliveryTrip,
  DeliveryTripCreatePayload,
  TripDriverVehicleAssignPayload,
  AreaGroupingSuggestion,
  PendingDispatchForRouting,
  DeliveryManifestResponse,
} from '../types/DeliveryTrip';

export const deliveryTripService = {
  /**
   * Lấy danh sách gợi ý gom phiếu xuất theo khu vực địa lý (S6-06)
   */
  getGroupingSuggestions: async (warehouseId?: number): Promise<AreaGroupingSuggestion[]> => {
    const res = await apiClient.get<AreaGroupingSuggestion[]>('/delivery-trips/grouping-suggestions', {
      params: warehouseId ? { warehouse_id: warehouseId } : {},
    });
    return res.data;
  },

  /**
   * Lấy danh sách phiếu xuất kho chờ điều phối (chưa gán chuyến)
   */
  getPendingDispatches: async (params?: {
    warehouse_id?: number;
    area?: string;
  }): Promise<PendingDispatchForRouting[]> => {
    const res = await apiClient.get<PendingDispatchForRouting[]>('/delivery-trips/pending-dispatches', {
      params,
    });
    return res.data;
  },

  /**
   * Tạo chuyến giao hàng mới gom nhiều phiếu xuất và gán tài xế/xe (S6-06)
   */
  createTrip: async (payload: DeliveryTripCreatePayload): Promise<DeliveryTrip> => {
    const res = await apiClient.post<DeliveryTrip>('/delivery-trips', payload);
    return res.data;
  },

  /**
   * Gán, đổi hoặc bỏ gán tài xế & phương tiện cho chuyến giao (S6-06)
   */
  assignDriverAndVehicle: async (
    tripId: string,
    payload: TripDriverVehicleAssignPayload
  ): Promise<DeliveryTrip> => {
    const res = await apiClient.put<DeliveryTrip>(
      `/delivery-trips/${tripId}/assign-driver-vehicle`,
      payload
    );
    return res.data;
  },

  /**
   * Lấy dữ liệu danh sách điểm giao của chuyến kèm địa chỉ, SĐT để in ấn (Manifest) (S6-06)
   */
  getManifest: async (tripId: string): Promise<DeliveryManifestResponse> => {
    const res = await apiClient.get<DeliveryManifestResponse>(`/delivery-trips/${tripId}/manifest`);
    return res.data;
  },

  /**
   * Lấy danh sách các chuyến giao hàng
   */
  getTrips: async (params?: {
    warehouse_id?: number;
    status?: string;
    area?: string;
    driver_name?: string;
    skip?: number;
    limit?: number;
  }): Promise<DeliveryTrip[]> => {
    const res = await apiClient.get<DeliveryTrip[]>('/delivery-trips', { params });
    return res.data;
  },

  /**
   * Lấy chi tiết chuyến giao hàng
   */
  getTripById: async (tripId: string): Promise<DeliveryTrip> => {
    const res = await apiClient.get<DeliveryTrip>(`/delivery-trips/${tripId}`);
    return res.data;
  },

  /**
   * Xuất bến bắt đầu chuyến giao hàng (READY -> IN_TRANSIT)
   */
  startTrip: async (tripId: string): Promise<DeliveryTrip> => {
    const res = await apiClient.post<DeliveryTrip>(`/delivery-trips/${tripId}/start`);
    return res.data;
  },

  /**
   * Hủy chuyến giao hàng khi chưa xuất bến (nhả phiếu xuất về hàng đợi)
   */
  cancelTrip: async (tripId: string): Promise<DeliveryTrip> => {
    const res = await apiClient.delete<DeliveryTrip>(`/delivery-trips/${tripId}`);
    return res.data;
  },
};
