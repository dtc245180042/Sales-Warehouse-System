import { Agent, AgentGroup, AgentStatus } from '../types/Agent';
import { initialAgents } from '../mock/agents';
import { getStorageItem, setStorageItem } from './storage';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'kv_agents';

function mapCustomerToAgent(c: any): Agent {
  const defaultLimit =
    c.customer_group === 'TIER_1' || c.customer_group === 'VIP'
      ? 200000000
      : c.customer_group === 'TIER_2'
      ? 100000000
      : 50000000;
  const creditLimit = Number(c.credit_limit ?? c.creditLimit ?? defaultLimit);
  const outstandingDebt = Number(c.current_debt ?? c.currentDebt ?? 0);

  let mappedGroup: AgentGroup = 'standard';
  const rawGroup = (c.customer_group || c.customerGroup || '').toUpperCase();
  if (rawGroup === 'TIER_1' || rawGroup === 'VIP' || rawGroup === 'PLATINUM') mappedGroup = 'platinum';
  else if (rawGroup === 'TIER_2' || rawGroup === 'GOLD') mappedGroup = 'gold';
  else if (rawGroup === 'WHOLESALE' || rawGroup === 'SILVER') mappedGroup = 'silver';
  else mappedGroup = 'standard';

  let mappedStatus: AgentStatus = 'active';
  if (c.status === 'inactive' || c.status === 'locked') mappedStatus = 'inactive';
  else if (c.status === 'pending') mappedStatus = 'pending';

  return {
    id: c.id,
    code: c.code || '',
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    province: c.region || 'Hà Nội',
    district: '',
    region: c.region || 'Miền Bắc',
    customerGroup: mappedGroup,
    contactPerson: c.contactPerson || c.name || '',
    taxCode: c.tax_code || c.taxCode || '',
    assignedStaffId: c.assigned_staff_id || c.assignedStaffId || 'USR-003',
    assignedStaffName: c.assigned_sales_rep || c.assigned_staff_name || c.assignedStaffName || 'Nhân viên kinh doanh',
    creditLimit,
    outstandingDebt,
    maxDebtDays: Number(c.max_debt_days ?? c.maxDebtDays ?? 30),
    availableCredit: Math.max(0, creditLimit - outstandingDebt),
    status: mappedStatus,
    totalOrders: Number(c.total_orders ?? c.totalOrders ?? 0),
    totalSpent: Number(c.total_spent ?? c.totalSpent ?? 0),
    createdAt: c.created_at ? c.created_at.split('T')[0] : (c.createdAt || new Date().toISOString().split('T')[0]),
  };
}

export const agentService = {
  getAll: async (): Promise<Agent[]> => {
    try {
      const res = await apiClient.get('/customers', { params: { page_size: 500 } });
      const rawList = res.data?.items || (Array.isArray(res.data) ? res.data : []);
      if (rawList.length > 0) {
        const mapped = rawList.map(mapCustomerToAgent);
        setStorageItem(STORAGE_KEY, mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[agentService] Không thể tải danh sách đại lý từ CSDL, fallback sang local:', err);
    }

    const list = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
    return list.map((a) => {
      const defaultLimit =
        a.customerGroup === 'platinum'
          ? 200000000
          : a.customerGroup === 'gold'
          ? 100000000
          : a.customerGroup === 'silver'
          ? 50000000
          : 30000000;
      const creditLimit = a.creditLimit ?? defaultLimit;
      const outstandingDebt = a.outstandingDebt ?? 0;
      return {
        ...a,
        creditLimit,
        maxDebtDays: a.maxDebtDays ?? 30,
        availableCredit: a.availableCredit ?? Math.max(0, creditLimit - outstandingDebt),
      };
    });
  },

  getById: async (id: string): Promise<Agent | undefined> => {
    try {
      const res = await apiClient.get(`/customers/${encodeURIComponent(id)}`);
      if (res.data) {
        return mapCustomerToAgent(res.data);
      }
    } catch {
      // fallback
    }
    const all = await agentService.getAll();
    return all.find((a) => a.id === id || a.code === id);
  },

  create: async (data: Omit<Agent, 'id' | 'code' | 'createdAt' | 'totalOrders' | 'totalSpent' | 'outstandingDebt'>): Promise<Agent> => {
    let group = 'TIER_1';
    if (data.customerGroup === 'platinum') group = 'TIER_1';
    else if (data.customerGroup === 'gold') group = 'TIER_2';
    else if (data.customerGroup === 'silver') group = 'WHOLESALE';
    else if (data.customerGroup === 'standard') group = 'RETAIL';

    const payload: any = {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      customer_group: group,
      region: data.region || 'Miền Bắc',
      assigned_sales_rep: data.assignedStaffName || null,
      status: data.status === 'inactive' ? 'inactive' : 'active',
    };

    if (data.taxCode && data.taxCode.trim()) {
      payload.tax_code = data.taxCode.trim();
    } else {
      payload.tax_code = null;
    }

    try {
      const res = await apiClient.post('/customers', payload);
      const newAgent = mapCustomerToAgent(res.data);
      const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
      setStorageItem(STORAGE_KEY, [newAgent, ...agents.filter((a) => a.id !== newAgent.id)]);
      return newAgent;
    } catch (err: any) {
      console.error('[agentService] Lỗi khi tạo đại lý mới vào CSDL:', err);
      throw err;
    }
  },

  update: async (id: string, data: Partial<Agent>): Promise<Agent> => {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.phone !== undefined) payload.phone = data.phone.trim();
    if (data.email !== undefined) payload.email = data.email?.trim() || null;
    if (data.address !== undefined) payload.address = data.address?.trim() || null;
    if (data.region !== undefined) payload.region = data.region;
    if (data.assignedStaffName !== undefined) payload.assigned_sales_rep = data.assignedStaffName || null;
    if (data.status !== undefined) payload.status = data.status === 'inactive' ? 'inactive' : 'active';
    if (data.taxCode !== undefined) {
      payload.tax_code = data.taxCode && data.taxCode.trim() ? data.taxCode.trim() : null;
    }
    if (data.customerGroup !== undefined) {
      if (data.customerGroup === 'platinum') payload.customer_group = 'TIER_1';
      else if (data.customerGroup === 'gold') payload.customer_group = 'TIER_2';
      else if (data.customerGroup === 'silver') payload.customer_group = 'WHOLESALE';
      else payload.customer_group = 'RETAIL';
    }

    try {
      const res = await apiClient.put(`/customers/${encodeURIComponent(id)}`, payload);
      const updated = mapCustomerToAgent(res.data);
      const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
      const index = agents.findIndex((a) => a.id === id);
      if (index !== -1) {
        agents[index] = updated;
        setStorageItem(STORAGE_KEY, [...agents]);
      }
      return updated;
    } catch (err: any) {
      console.error('[agentService] Lỗi khi cập nhật đại lý trong CSDL:', err);
      throw err;
    }
  },

  delete: async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/customers/${encodeURIComponent(id)}`);
      const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
      setStorageItem(STORAGE_KEY, agents.filter((a) => a.id !== id));
      return true;
    } catch (err: any) {
      console.error('[agentService] Lỗi khi xóa đại lý trong CSDL:', err);
      throw err;
    }
  },
};
