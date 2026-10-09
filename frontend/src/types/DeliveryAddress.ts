export interface DeliveryAddress {
  id: number;
  customerId: string;
  name: string;
  receiverName: string;
  phone: string;
  address: string;
  directionsNote?: string;
  isDefault: boolean;
  status: string;
  createdAt?: string;
}

export interface DeliveryAddressCreateDTO {
  name: string;
  receiver_name: string;
  phone: string;
  address: string;
  directions_note?: string;
  is_default?: boolean;
  status?: string;
}

export interface DeliveryAddressUpdateDTO {
  name?: string;
  receiver_name?: string;
  phone?: string;
  address?: string;
  directions_note?: string;
  is_default?: boolean;
  status?: string;
}
