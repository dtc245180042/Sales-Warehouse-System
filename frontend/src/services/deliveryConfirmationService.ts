import { apiClient } from '../api/client';

export interface DeliveryFailureReasonItem {
  code: string;
  label: string;
}

export interface DeliveryConfirmPayload {
  receiver_name: string;
  receiver_phone?: string;
  delivered_at?: string;
  proof_image_url: string;
  notes?: string;
}

export interface DeliveryFailedPayload {
  failure_reason: string;
  failure_notes?: string;
  notes?: string;
}

export interface DispatchDeliveryResponse {
  id: number;
  dispatch_id: string;
  order_id: string;
  customer_id: string;
  customer_name?: string;
  warehouse_id: number;
  warehouse_name?: string;
  status: 'DELIVERED' | 'DELIVERY_FAILED' | string;
  receiver_name?: string;
  receiver_phone?: string;
  delivered_at?: string;
  proof_image_url?: string;
  failure_reason?: string;
  failure_notes?: string;
  returned_to_warehouse: boolean;
  returned_warehouse_id?: number;
  returned_at?: string;
  confirmed_by: number;
  confirmed_by_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface UploadProofResponse {
  proof_image_url: string;
  original_filename: string;
  file_size: number;
}

export const deliveryConfirmationService = {
  /**
   * Lấy danh mục lý do giao hàng thất bại chuẩn hóa từ Backend (S6-08)
   */
  getFailureReasons: async (): Promise<DeliveryFailureReasonItem[]> => {
    try {
      const res = await apiClient.get<DeliveryFailureReasonItem[]>('/dispatch-deliveries/failure-reasons');
      return res.data;
    } catch (err) {
      console.warn('[deliveryConfirmationService] Fallback failure reasons:', err);
      return [
        { code: 'RECIPIENT_UNAVAILABLE', label: 'Khách hàng đi vắng / không liên lạc được' },
        { code: 'WRONG_ADDRESS', label: 'Sai địa chỉ / không tìm thấy địa chỉ người nhận' },
        { code: 'RECIPIENT_REJECTED', label: 'Khách hàng từ chối nhận hàng (đổi ý)' },
        { code: 'DAMAGED_IN_TRANSIT', label: 'Hàng hóa bị hư hại / móp méo trong lúc vận chuyển' },
        { code: 'FORCE_MAJEURE', label: 'Lý do bất khả kháng (thời tiết / tai nạn giao thông)' },
        { code: 'OTHER', label: 'Lý do khác' },
      ];
    }
  },

  /**
   * Tải lên ảnh biên bản giao nhận có chữ ký (POD)
   */
  uploadProofFile: async (file: File): Promise<UploadProofResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<UploadProofResponse>('/dispatch-deliveries/upload-proof', formData);
    return res.data;
  },

  /**
   * Xác nhận giao hàng thành công kèm người nhận, thời điểm giao và ảnh chứng từ (POD)
   */
  confirmDelivery: async (
    dispatchId: string,
    payload: DeliveryConfirmPayload
  ): Promise<DispatchDeliveryResponse> => {
    const res = await apiClient.post<DispatchDeliveryResponse>(
      `/dispatch-deliveries/${dispatchId}/confirm`,
      payload
    );
    return res.data;
  },

  /**
   * Báo giao hàng không thành công, lưu lý do và kích hoạt tự động hoàn hàng về kho
   */
  failDelivery: async (
    dispatchId: string,
    payload: DeliveryFailedPayload
  ): Promise<DispatchDeliveryResponse> => {
    const res = await apiClient.post<DispatchDeliveryResponse>(
      `/dispatch-deliveries/${dispatchId}/fail`,
      payload
    );
    return res.data;
  },

  /**
   * Tra cứu thông tin xác nhận giao hàng hoặc chứng từ POD của phiếu xuất
   */
  getDeliveryInfo: async (dispatchId: string): Promise<DispatchDeliveryResponse | null> => {
    try {
      const res = await apiClient.get<DispatchDeliveryResponse>(`/dispatch-deliveries/${dispatchId}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return null;
      }
      throw err;
    }
  },
};
