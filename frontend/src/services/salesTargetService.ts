import { apiClient } from '../api/client';
import {
  SalesTarget,
  SalesTargetCreateRequest,
  SalesTargetUpdateRequest,
  SalesTargetProgressItem,
  SalesTargetAuditRecord,
} from '../types/SalesTarget';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_sales_targets';
const STORAGE_AUDIT_KEY = 'kv_sales_target_audits';

const INITIAL_DEMO_TARGETS: SalesTarget[] = [];
const INITIAL_DEMO_AUDITS: SalesTargetAuditRecord[] = [];
const MOCK_ACHIEVEMENTS: Record<string, { revenue: number; orders: number }> = {};

export const salesTargetService = {
  getAll: async (params?: {
    year?: number;
    month?: number;
    scope?: string;
    status?: string;
  }): Promise<SalesTarget[]> => {
    try {
      const res = await apiClient.get('/sales-targets', { params });
      if (res.data && Array.isArray(res.data.items || res.data)) {
        const items = res.data.items || res.data;
        setStorageItem(STORAGE_KEY, items);
        return items;
      }
    } catch {
      // Fallback
    }

    let list = getStorageItem<SalesTarget[]>(STORAGE_KEY, INITIAL_DEMO_TARGETS);

    if (params?.year) {
      list = list.filter((t) => t.year === Number(params.year));
    }
    if (params?.month) {
      list = list.filter((t) => t.month === Number(params.month));
    }
    if (params?.scope && params.scope !== 'all') {
      list = list.filter((t) => t.scope === params.scope);
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((t) => t.status === params.status);
    }

    return list;
  },

  getById: async (id: string): Promise<SalesTarget | null> => {
    try {
      const res = await apiClient.get(`/sales-targets/${id}`);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }
    const list = getStorageItem<SalesTarget[]>(STORAGE_KEY, INITIAL_DEMO_TARGETS);
    return list.find((t) => t.id === id) || null;
  },

  create: async (
    payload: SalesTargetCreateRequest,
    currentUser: { id?: string | number; name?: string; role?: string }
  ): Promise<SalesTarget> => {
    const list = getStorageItem<SalesTarget[]>(STORAGE_KEY, INITIAL_DEMO_TARGETS);

    // Business check: Không cho phép tạo 2 chỉ tiêu cùng scope + user/territory + tháng
    const exists = list.some(
      (t) =>
        t.year === payload.year &&
        t.month === payload.month &&
        t.scope === payload.scope &&
        (payload.scope === 'individual' ? t.userId === payload.userId : t.territory === payload.territory)
    );

    if (exists) {
      throw new Error(
        `Đã tồn tại chỉ tiêu ${payload.scope === 'individual' ? 'cho nhân viên này' : 'cho khu vực này'} trong Tháng ${payload.month}/${payload.year}`
      );
    }

    const id = `TGT-${payload.year}${String(payload.month).padStart(2, '0')}-${Math.floor(
      100 + Math.random() * 900
    )}`;
    const newTarget: SalesTarget = {
      ...payload,
      id,
      period: `Tháng ${String(payload.month).padStart(2, '0')}/${payload.year}`,
      status: 'active',
      createdBy: String(currentUser.id || 'USR-001'),
      createdByName: currentUser.name || 'Quản lý',
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await apiClient.post('/sales-targets', newTarget);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const updated = [newTarget, ...list];
    setStorageItem(STORAGE_KEY, updated);

    // Record audit
    salesTargetService.recordAudit({
      targetId: id,
      action: 'CREATE',
      newRevenue: payload.targetRevenue,
      changeSummary: `Tạo chỉ tiêu ${newTarget.period} cho ${
        payload.userName || payload.territory
      }: ${payload.targetRevenue.toLocaleString('vi-VN')} đ`,
      userId: String(currentUser.id || 'USR-001'),
      userName: currentUser.name || 'Quản lý',
      userRole: currentUser.role || 'SalesManager',
    });

    return newTarget;
  },

  update: async (
    id: string,
    payload: SalesTargetUpdateRequest,
    currentUser: { id?: string | number; name?: string; role?: string }
  ): Promise<SalesTarget> => {
    const list = getStorageItem<SalesTarget[]>(STORAGE_KEY, INITIAL_DEMO_TARGETS);
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Không tìm thấy chỉ tiêu');

    const current = list[idx];
    const isLocked = current.status === 'locked';

    if (isLocked && (!payload.reason || payload.reason.trim().length < 20)) {
      throw new Error('Chỉ tiêu đã khoá yêu cầu nhập lý do điều chỉnh tối thiểu 20 ký tự');
    }

    try {
      const res = await apiClient.patch(`/sales-targets/${id}`, payload);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const oldRevenue = current.targetRevenue;
    const newRevenue = payload.targetRevenue ?? current.targetRevenue;
    const newOrders = payload.targetOrders ?? current.targetOrders;

    const updatedTarget: SalesTarget = {
      ...current,
      targetRevenue: newRevenue,
      targetOrders: newOrders,
      updatedAt: new Date().toISOString(),
    };

    list[idx] = updatedTarget;
    setStorageItem(STORAGE_KEY, list);

    // Record audit
    salesTargetService.recordAudit({
      targetId: id,
      action: isLocked ? 'UPDATE_LOCKED' : 'UPDATE',
      oldRevenue,
      newRevenue,
      reason: payload.reason,
      changeSummary: isLocked
        ? `Sửa chỉ tiêu đã khoá từ ${oldRevenue.toLocaleString('vi-VN')} đ sang ${newRevenue.toLocaleString(
            'vi-VN'
          )} đ. Lý do: "${payload.reason}"`
        : `Cập nhật chỉ tiêu từ ${oldRevenue.toLocaleString('vi-VN')} đ sang ${newRevenue.toLocaleString(
            'vi-VN'
          )} đ`,
      userId: String(currentUser.id || 'USR-001'),
      userName: currentUser.name || 'Quản lý',
      userRole: currentUser.role || 'SalesManager',
    });

    return updatedTarget;
  },

  lockPeriod: async (
    year: number,
    month: number,
    currentUser: { id?: string | number; name?: string; role?: string }
  ): Promise<{ count: number }> => {
    try {
      const res = await apiClient.post('/sales-targets/lock', { year, month });
      if (res.data) return res.data;
    } catch {
      // Fallback
    }

    const list = getStorageItem<SalesTarget[]>(STORAGE_KEY, INITIAL_DEMO_TARGETS);
    let count = 0;
    const nowStr = new Date().toISOString();

    const updatedList = list.map((t) => {
      if (t.year === year && t.month === month && t.status === 'active') {
        count++;
        salesTargetService.recordAudit({
          targetId: t.id,
          action: 'LOCK',
          changeSummary: `Khoá chỉ tiêu kỳ Tháng ${month}/${year}`,
          userId: String(currentUser.id || 'USR-001'),
          userName: currentUser.name || 'Admin',
          userRole: currentUser.role || 'Admin',
        });
        return {
          ...t,
          status: 'locked' as const,
          lockedAt: nowStr,
          lockedBy: String(currentUser.id || 'USR-001'),
          lockedByName: currentUser.name || 'Admin',
        };
      }
      return t;
    });

    setStorageItem(STORAGE_KEY, updatedList);
    return { count };
  },

  getProgress: async (year: number, month: number): Promise<SalesTargetProgressItem[]> => {
    try {
      const res = await apiClient.get('/sales-targets/progress', { params: { year, month } });
      if (res.data && Array.isArray(res.data)) return res.data;
    } catch {
      // Fallback
    }

    const list = getStorageItem<SalesTarget[]>(STORAGE_KEY, INITIAL_DEMO_TARGETS);
    const targets = list.filter((t) => t.year === year && t.month === month);

    return targets.map((t) => {
      const mock = MOCK_ACHIEVEMENTS[t.id] || {
        revenue: Math.round(t.targetRevenue * (0.6 + Math.random() * 0.45)),
        orders: Math.round((t.targetOrders || 100) * (0.6 + Math.random() * 0.45)),
      };

      const currentRev = mock.revenue;
      const remainingRev = Math.max(0, t.targetRevenue - currentRev);
      const revPct = t.targetRevenue > 0 ? (currentRev / t.targetRevenue) * 100 : 0;

      const targetOrd = t.targetOrders || 100;
      const currentOrd = mock.orders;
      const ordPct = targetOrd > 0 ? (currentOrd / targetOrd) * 100 : 0;

      return {
        targetId: t.id,
        scope: t.scope,
        userId: t.userId,
        userName: t.userName,
        userRole: t.userRole,
        territory: t.territory,
        targetRevenue: t.targetRevenue,
        currentRevenue: currentRev,
        remainingRevenue: remainingRev,
        revenuePercentage: Math.round(revPct * 10) / 10,
        targetOrders: targetOrd,
        currentOrders: currentOrd,
        ordersPercentage: Math.round(ordPct * 10) / 10,
        status: t.status,
      };
    });
  },

  getAuditHistory: async (targetId: string): Promise<SalesTargetAuditRecord[]> => {
    try {
      const res = await apiClient.get(`/sales-targets/${targetId}/audits`);
      if (res.data && Array.isArray(res.data)) return res.data;
    } catch {
      // Fallback
    }

    const audits = getStorageItem<SalesTargetAuditRecord[]>(STORAGE_AUDIT_KEY, INITIAL_DEMO_AUDITS);
    return audits
      .filter((a) => a.targetId === targetId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  recordAudit: (
    audit: Omit<SalesTargetAuditRecord, 'id' | 'timestamp'>
  ): SalesTargetAuditRecord => {
    const audits = getStorageItem<SalesTargetAuditRecord[]>(STORAGE_AUDIT_KEY, INITIAL_DEMO_AUDITS);
    const newRecord: SalesTargetAuditRecord = {
      ...audit,
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    const updated = [newRecord, ...audits];
    setStorageItem(STORAGE_AUDIT_KEY, updated);
    return newRecord;
  },
};
