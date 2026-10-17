// Dịch vụ quản lý đơn hàng chờ duyệt và xử lý vi phạm (SCRUM-237 / SCRUM-563)
import { ApprovalOrder, ApprovalStatus } from '../types/OrderApproval';
import { initialApprovalOrders } from '../mock/orderApprovals';
import { getStorageItem, setStorageItem } from './storage';
import { orderService } from './orderService';

const STORAGE_KEY = 'kv_order_approvals';

export const orderApprovalService = {
  getAll: async (): Promise<ApprovalOrder[]> => {
    return getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
  },

  getById: async (id: string): Promise<ApprovalOrder | undefined> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    return list.find((item) => item.id === id || item.orderId === id || item.orderCode === id);
  },

  approve: async (
    id: string,
    approverName: string,
    notes?: string
  ): Promise<ApprovalOrder> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Không tìm thấy đơn hàng cần phê duyệt');
    }

    const current = list[index];
    const updated: ApprovalOrder = {
      ...current,
      approvalStatus: 'approved',
      approverNotes: notes || 'Đã phê duyệt ngoại lệ vi phạm chính sách',
      approvedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      approvedBy: approverName,
    };

    list[index] = updated;
    setStorageItem(STORAGE_KEY, list);

    // Cập nhật trạng thái đơn hàng sang confirmed trong orderService nếu có
    try {
      if (current.orderId) {
        await orderService.updateStatus(current.orderId, 'confirmed');
      }
    } catch (e) {
      console.warn('Lỗi đồng bộ orderService:', e);
    }

    return updated;
  },

  reject: async (
    id: string,
    approverName: string,
    reason: string
  ): Promise<ApprovalOrder> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Không tìm thấy đơn hàng cần từ chối');
    }

    const current = list[index];
    const updated: ApprovalOrder = {
      ...current,
      approvalStatus: 'rejected',
      rejectedReason: reason,
      rejectedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      rejectedBy: approverName,
    };

    list[index] = updated;
    setStorageItem(STORAGE_KEY, list);

    return updated;
  },

  batchApprove: async (
    ids: string[],
    approverName: string,
    notes?: string
  ): Promise<ApprovalOrder[]> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    const updatedList: ApprovalOrder[] = [];
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

    for (const id of ids) {
      const index = list.findIndex((item) => item.id === id);
      if (index !== -1 && list[index].approvalStatus === 'pending') {
        const item = list[index];
        const updated: ApprovalOrder = {
          ...item,
          approvalStatus: 'approved',
          approverNotes: notes || 'Phê duyệt hàng loạt ngoại lệ vi phạm chính sách',
          approvedAt: timestamp,
          approvedBy: approverName,
        };
        list[index] = updated;
        updatedList.push(updated);

        try {
          if (item.orderId) {
            orderService.updateStatus(item.orderId, 'confirmed').catch(() => {});
          }
        } catch {}
      }
    }

    setStorageItem(STORAGE_KEY, list);
    return updatedList;
  },

  batchReject: async (
    ids: string[],
    approverName: string,
    reason: string
  ): Promise<ApprovalOrder[]> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    const updatedList: ApprovalOrder[] = [];
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

    for (const id of ids) {
      const index = list.findIndex((item) => item.id === id);
      if (index !== -1 && list[index].approvalStatus === 'pending') {
        const item = list[index];
        const updated: ApprovalOrder = {
          ...item,
          approvalStatus: 'rejected',
          rejectedReason: reason,
          rejectedAt: timestamp,
          rejectedBy: approverName,
        };
        list[index] = updated;
        updatedList.push(updated);
      }
    }

    setStorageItem(STORAGE_KEY, list);
    return updatedList;
  },

  returnForEdit: async (
    id: string,
    approverName: string,
    notes: string
  ): Promise<ApprovalOrder> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Không tìm thấy đơn hàng cần yêu cầu chỉnh sửa');
    }

    const current = list[index];
    const updated: ApprovalOrder = {
      ...current,
      approvalStatus: 'revision',
      revisionNotes: notes,
      returnedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      returnedBy: approverName,
    };

    list[index] = updated;
    setStorageItem(STORAGE_KEY, list);

    try {
      if (current.orderId) {
        await orderService.updateStatus(current.orderId, 'pending');
      }
    } catch (e) {
      console.warn('Lỗi đồng bộ orderService:', e);
    }

    return updated;
  },

  batchReturnForEdit: async (
    ids: string[],
    approverName: string,
    notes: string
  ): Promise<ApprovalOrder[]> => {
    const list = getStorageItem<ApprovalOrder[]>(STORAGE_KEY, initialApprovalOrders);
    const updatedList: ApprovalOrder[] = [];
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

    for (const id of ids) {
      const index = list.findIndex((item) => item.id === id);
      if (index !== -1 && list[index].approvalStatus === 'pending') {
        const item = list[index];
        const updated: ApprovalOrder = {
          ...item,
          approvalStatus: 'revision',
          revisionNotes: notes,
          returnedAt: timestamp,
          returnedBy: approverName,
        };
        list[index] = updated;
        updatedList.push(updated);
      }
    }

    setStorageItem(STORAGE_KEY, list);
    return updatedList;
  },
};
