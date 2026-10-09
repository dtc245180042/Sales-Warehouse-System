import { apiClient } from '../api/client';

export interface CustomerLockStatus {
  customerId: string;
  customerName?: string;
  isLocked: boolean;
  status: 'active' | 'inactive' | 'locked';
  lockReason?: string;
  lockedAt?: string;
  lockedBy?: string;
  warningMessage?: string;
}

export interface CustomerLockHistoryItem {
  id: number;
  customerId: string;
  action: 'lock' | 'unlock';
  reason: string;
  actorUsername?: string;
  actorName?: string;
  actorRole?: string;
  createdAt?: string;
}

export const customerLockService = {
  getStatus: async (customerId: string): Promise<CustomerLockStatus> => {
    const res = await apiClient.get<CustomerLockStatus>(
      `/customer-locks/${encodeURIComponent(customerId)}/status`
    );
    return res.data;
  },

  lock: async (customerId: string, reason: string): Promise<CustomerLockStatus> => {
    const res = await apiClient.post<CustomerLockStatus>(
      `/customer-locks/${encodeURIComponent(customerId)}/lock`,
      { reason: reason.trim() }
    );
    return res.data;
  },

  unlock: async (customerId: string, reason?: string): Promise<CustomerLockStatus> => {
    const res = await apiClient.post<CustomerLockStatus>(
      `/customer-locks/${encodeURIComponent(customerId)}/unlock`,
      { reason: reason ? reason.trim() : undefined }
    );
    return res.data;
  },

  getHistory: async (customerId: string): Promise<CustomerLockHistoryItem[]> => {
    const res = await apiClient.get<CustomerLockHistoryItem[]>(
      `/customer-locks/${encodeURIComponent(customerId)}/history`
    );
    return res.data;
  },
};
