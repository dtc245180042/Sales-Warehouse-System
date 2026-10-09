import { Agent } from '../types/Agent';
import { initialAgents } from '../mock/agents';
import { getStorageItem, setStorageItem } from './storage';

const STORAGE_KEY = 'kv_agents';

export const agentService = {
  getAll: async (): Promise<Agent[]> => {
    return getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
  },

  getById: async (id: string): Promise<Agent | undefined> => {
    const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
    return agents.find((a) => a.id === id || a.code === id);
  },

  create: async (data: Omit<Agent, 'id' | 'code' | 'createdAt' | 'totalOrders' | 'totalSpent' | 'outstandingDebt'>): Promise<Agent> => {
    const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
    const newAgent: Agent = {
      ...data,
      id: `AGT-${String(agents.length + 1).padStart(3, '0')}`,
      code: `DL-${1000 + agents.length + 1}`,
      totalOrders: 0,
      totalSpent: 0,
      outstandingDebt: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setStorageItem(STORAGE_KEY, [newAgent, ...agents]);
    return newAgent;
  },

  update: async (id: string, data: Partial<Agent>): Promise<Agent> => {
    const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
    const index = agents.findIndex((a) => a.id === id);
    if (index === -1) throw new Error('Không tìm thấy đại lý');
    const updated = { ...agents[index], ...data };
    agents[index] = updated;
    setStorageItem(STORAGE_KEY, [...agents]);
    return updated;
  },

  delete: async (id: string): Promise<boolean> => {
    const agents = getStorageItem<Agent[]>(STORAGE_KEY, initialAgents);
    setStorageItem(STORAGE_KEY, agents.filter((a) => a.id !== id));
    return true;
  },
};
