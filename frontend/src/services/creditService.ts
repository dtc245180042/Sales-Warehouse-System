import { apiClient } from '../api/client';
import {
  CustomerCreditProfile,
  CustomerCreditHistory,
  CreditProfileUpdatePayload,
  CreditCheckResult,
} from '../types/CreditProfile';

export const creditService = {
  /**
   * Lấy hồ sơ hạn mức công nợ hiện tại của đại lý
   */
  getProfile: async (customerId: string): Promise<CustomerCreditProfile> => {
    const res = await apiClient.get(`/customers/${encodeURIComponent(customerId)}/credit-profile`);
    return res.data;
  },

  /**
   * Cập nhật hạn mức công nợ và số ngày nợ tối đa (yêu cầu quyền Kế toán / QLKD / Admin)
   */
  updateProfile: async (
    customerId: string,
    payload: CreditProfileUpdatePayload
  ): Promise<CustomerCreditProfile> => {
    const res = await apiClient.put(
      `/customers/${encodeURIComponent(customerId)}/credit-profile`,
      payload
    );
    return res.data;
  },

  /**
   * Lấy nhật ký lịch sử điều chỉnh hạn mức công nợ (Append-Only)
   */
  getHistory: async (customerId: string): Promise<CustomerCreditHistory[]> => {
    const res = await apiClient.get(`/customers/${encodeURIComponent(customerId)}/credit-history`);
    return Array.isArray(res.data) ? res.data : [];
  },

  /**
   * Kiểm tra điều kiện công nợ và quá hạn (tạo đơn hoặc xuất kho)
   */
  checkCredit: async (
    customerId: string,
    unpaidAmount: number,
    orderId?: string,
    context: 'order' | 'dispatch' = 'order'
  ): Promise<CreditCheckResult> => {
    const res = await apiClient.post(
      `/customers/${encodeURIComponent(customerId)}/check-credit`,
      {
        unpaid_amount: unpaidAmount,
        order_id: orderId,
        context: context,
      }
    );
    return res.data;
  },

  /**
   * Lấy tóm tắt công nợ, hạn mức và nợ quá hạn cho màn hình tạo đơn (SCRUM-499)
   */
  getSummary: async (customerId: string): Promise<CustomerCreditProfile> => {
    const res = await apiClient.get(`/customers/${encodeURIComponent(customerId)}/credit-summary`);
    return res.data;
  },
};
