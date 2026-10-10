import { apiClient } from '../api/client';
import {
  DeliveryAddress,
  DeliveryAddressCreateDTO,
  DeliveryAddressUpdateDTO,
} from '../types/DeliveryAddress';

function mapApiDeliveryAddress(data: any): DeliveryAddress {
  return {
    id: data.id,
    customerId: data.customerId ?? data.customer_id,
    name: data.name,
    receiverName: data.receiverName ?? data.receiver_name ?? '',
    phone: data.phone ?? '',
    address: data.address ?? '',
    directionsNote: data.directionsNote ?? data.directions_note ?? '',
    isDefault: Boolean(data.isDefault ?? data.is_default),
    status: data.status ?? 'active',
    createdAt: data.createdAt ?? data.created_at ?? '',
  };
}

export const deliveryAddressService = {
  getByCustomerId: async (customerId: string): Promise<DeliveryAddress[]> => {
    try {
      const res = await apiClient.get(`/customers/${encodeURIComponent(customerId)}/delivery-addresses`);
      if (Array.isArray(res.data)) {
        return res.data.map(mapApiDeliveryAddress);
      }
      return [];
    } catch (error) {
      console.warn('[deliveryAddressService] Error fetching addresses:', error);
      return [];
    }
  },

  create: async (
    customerId: string,
    payload: DeliveryAddressCreateDTO
  ): Promise<DeliveryAddress> => {
    const res = await apiClient.post(
      `/customers/${encodeURIComponent(customerId)}/delivery-addresses`,
      payload
    );
    return mapApiDeliveryAddress(res.data);
  },

  update: async (
    addressId: number,
    payload: DeliveryAddressUpdateDTO
  ): Promise<DeliveryAddress> => {
    const res = await apiClient.put(`/delivery-addresses/${addressId}`, payload);
    return mapApiDeliveryAddress(res.data);
  },

  setDefault: async (addressId: number): Promise<DeliveryAddress> => {
    const res = await apiClient.patch(`/delivery-addresses/${addressId}/set-default`);
    return mapApiDeliveryAddress(res.data);
  },

  delete: async (addressId: number): Promise<boolean> => {
    await apiClient.delete(`/delivery-addresses/${addressId}`);
    return true;
  },
};
