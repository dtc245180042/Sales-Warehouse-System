import { Warehouse, WarehouseLocation } from '../types/Warehouse';
import { initialWarehouses } from '../mock/warehouses';
import { getStorageItem, setStorageItem } from './storage';
import { agentService } from './agentService';

const STORAGE_KEY = 'kv_warehouses';

export const warehouseService = {
  getAll: async (): Promise<Warehouse[]> => {
    return getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
  },

  getById: async (id: string): Promise<Warehouse | undefined> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    return warehouses.find((w) => w.id === id || w.code.toUpperCase() === id.toUpperCase());
  },

  create: async (
    data: Omit<Warehouse, 'id' | 'createdAt' | 'code'> & { code?: string }
  ): Promise<Warehouse> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const cleanCode = (data.code && data.code.trim())
      ? data.code.trim().toUpperCase()
      : `KHO-${String(warehouses.length + 1).padStart(2, '0')}`;

    const existing = warehouses.find((w) => w.code.trim().toUpperCase() === cleanCode);
    if (existing) {
      throw new Error(`Mã kho "${cleanCode}" đã tồn tại. Vui lòng nhập mã khác.`);
    }

    const newWarehouse: Warehouse = {
      ...data,
      id: `WH-${String(warehouses.length + 1).padStart(3, '0')}`,
      code: cleanCode,
      locations: data.locations || [],
      createdAt: new Date().toISOString().split('T')[0],
    };
    setStorageItem(STORAGE_KEY, [newWarehouse, ...warehouses]);
    return newWarehouse;
  },

  update: async (id: string, data: Partial<Warehouse>): Promise<Warehouse> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const index = warehouses.findIndex((w) => w.id === id);
    if (index === -1) throw new Error('Không tìm thấy thông tin kho');

    if (data.code) {
      const cleanCode = data.code.trim().toUpperCase();
      const existing = warehouses.find(
        (w) => w.id !== id && w.code.trim().toUpperCase() === cleanCode
      );
      if (existing) {
        throw new Error(`Mã kho "${cleanCode}" đã trùng với kho khác.`);
      }
      data.code = cleanCode;
    }

    const updated = {
      ...warehouses[index],
      ...data,
      updatedAt: new Date().toISOString().split('T')[0],
    };
    warehouses[index] = updated;
    setStorageItem(STORAGE_KEY, warehouses);
    return updated;
  },

  delete: async (id: string): Promise<boolean> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const filtered = warehouses.filter((w) => w.id !== id);
    setStorageItem(STORAGE_KEY, filtered);
    return true;
  },

  // SCRUM-538: Quản lý vị trí trong kho
  getLocations: async (warehouseId: string): Promise<WarehouseLocation[]> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const wh = warehouses.find((w) => w.id === warehouseId);
    return wh?.locations || [];
  },

  createLocation: async (
    warehouseId: string,
    data: Omit<WarehouseLocation, 'id' | 'warehouseId'>
  ): Promise<WarehouseLocation> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const index = warehouses.findIndex((w) => w.id === warehouseId);
    if (index === -1) throw new Error('Không tìm thấy kho để thêm vị trí');

    const locations = warehouses[index].locations || [];
    const cleanCode = data.code.trim().toUpperCase();
    if (locations.some((l) => l.code.toUpperCase() === cleanCode)) {
      throw new Error(`Mã vị trí "${cleanCode}" đã tồn tại trong kho này.`);
    }

    const newLoc: WarehouseLocation = {
      ...data,
      id: `LOC-${Date.now()}`,
      warehouseId,
      code: cleanCode,
    };

    warehouses[index].locations = [...locations, newLoc];
    setStorageItem(STORAGE_KEY, warehouses);
    return newLoc;
  },

  updateLocation: async (
    warehouseId: string,
    locationId: string,
    data: Partial<WarehouseLocation>
  ): Promise<WarehouseLocation> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const whIndex = warehouses.findIndex((w) => w.id === warehouseId);
    if (whIndex === -1) throw new Error('Không tìm thấy kho');

    const locations = warehouses[whIndex].locations || [];
    const locIndex = locations.findIndex((l) => l.id === locationId);
    if (locIndex === -1) throw new Error('Không tìm thấy vị trí lưu trữ');

    const updated = { ...locations[locIndex], ...data };
    locations[locIndex] = updated;
    warehouses[whIndex].locations = locations;
    setStorageItem(STORAGE_KEY, warehouses);
    return updated;
  },

  deleteLocation: async (warehouseId: string, locationId: string): Promise<boolean> => {
    const warehouses = getStorageItem<Warehouse[]>(STORAGE_KEY, initialWarehouses);
    const whIndex = warehouses.findIndex((w) => w.id === warehouseId);
    if (whIndex === -1) throw new Error('Không tìm thấy kho');

    warehouses[whIndex].locations = (warehouses[whIndex].locations || []).filter(
      (l) => l.id !== locationId
    );
    setStorageItem(STORAGE_KEY, warehouses);
    return true;
  },

  // SCRUM-538: Gán kho mặc định cho đại lý
  assignDefaultWarehouseToAgent: async (
    agentId: string,
    warehouseId: string,
    warehouseName: string
  ): Promise<boolean> => {
    await agentService.update(agentId, {
      defaultWarehouseId: warehouseId,
      defaultWarehouseName: warehouseName,
    });
    return true;
  },
};
