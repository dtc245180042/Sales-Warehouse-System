import { InventoryHistoryRecord, StockInReceipt, StockOutReceipt } from '../types/Inventory';
import { initialStockInReceipts, initialStockOutReceipts, initialInventoryHistory } from '../mock/inventory';
import { getStorageItem, setStorageItem } from './storage';
import { productService } from './productService';
import { apiClient } from '../api/client';

const KEYS = {
  STOCK_IN: 'kv_stock_in_receipts',
  STOCK_OUT: 'kv_stock_out_receipts',
  HISTORY: 'kv_inventory_history',
};

function mapApiStockIn(r: any): StockInReceipt {
  return {
    id: r.id,
    code: r.code,
    supplierId: r.supplierId || r.supplier_id || '',
    supplierName: r.supplierName || r.supplier_name || '',
    warehouse: r.warehouse,
    date: r.createdAt ? r.createdAt.split(' ')[0] : new Date().toISOString().split('T')[0],
    items: (r.items || []).map((itm: any) => ({
      productId: itm.productId || itm.product_id,
      sku: itm.sku || '',
      name: itm.name || '',
      quantity: Number(itm.quantity || 1),
      costPrice: Number(itm.costPrice ?? itm.cost_price ?? 0),
      subtotal: Number(itm.subtotal || 0),
    })),
    totalQuantity: Number(r.totalItems ?? r.total_items ?? 0),
    totalAmount: Number(r.totalAmount ?? r.total_amount ?? 0),
    note: r.note || undefined,
    status: r.status || 'completed',
    createdBy: r.createdBy || r.created_by || 'Thủ kho',
    createdAt: r.createdAt || new Date().toISOString(),
  };
}

function mapApiStockOut(r: any): StockOutReceipt {
  return {
    id: r.id,
    code: r.code,
    reason: r.reason || 'sale',
    warehouse: r.warehouse,
    destinationWarehouse: r.target_warehouse || undefined,
    date: r.createdAt ? r.createdAt.split(' ')[0] : new Date().toISOString().split('T')[0],
    items: (r.items || []).map((itm: any) => ({
      productId: itm.productId || itm.product_id,
      sku: itm.sku || '',
      name: itm.name || '',
      currentStock: 0,
      quantity: Number(itm.quantity || 1),
      costPrice: Number(itm.costPrice ?? itm.cost_price ?? 0),
      subtotal: Number(itm.subtotal || 0),
    })),
    totalQuantity: Number(r.totalItems ?? r.total_items ?? 0),
    totalAmount: Number(r.totalAmount ?? r.total_amount ?? 0),
    note: r.note || undefined,
    status: r.status || 'completed',
    createdBy: r.createdBy || r.created_by || 'Thủ kho',
    createdAt: r.createdAt || new Date().toISOString(),
  };
}

function mapApiHistory(h: any): InventoryHistoryRecord {
  return {
    id: h.id,
    code: h.code,
    type: h.type,
    productId: h.productId || h.product_id,
    productName: h.productName || h.product_name,
    sku: h.sku || '',
    quantity: Number(h.quantity),
    balanceAfter: Number(h.balanceAfter ?? h.balance_after ?? 0),
    warehouse: h.warehouse,
    performer: h.performer || 'Thủ kho',
    date: h.date || (h.created_at ? h.created_at.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16)),
    note: h.note || '',
  };
}

export const inventoryService = {
  getStockInReceipts: async (): Promise<StockInReceipt[]> => {
    try {
      const res = await apiClient.get('/inventory/stock-in');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiStockIn);
        setStorageItem(KEYS.STOCK_IN, list);
        return list;
      }
    } catch (err) {
      console.warn('[inventoryService] Backend error, fallback to storage:', err);
    }
    return getStorageItem<StockInReceipt[]>(KEYS.STOCK_IN, initialStockInReceipts);
  },

  createStockInReceipt: async (
    data: Omit<StockInReceipt, 'id' | 'code' | 'createdAt'>
  ): Promise<StockInReceipt> => {
    try {
      const payload = {
        supplier_id: data.supplierId,
        supplier_name: data.supplierName,
        warehouse: data.warehouse,
        reason: 'Nhập kho mua hàng',
        items: data.items.map((i) => ({
          product_id: i.productId,
          sku: i.sku,
          name: i.name,
          unit: 'Chiếc',
          quantity: i.quantity,
          cost_price: i.costPrice,
          subtotal: i.subtotal,
        })),
        total_amount: data.totalAmount,
        created_by: data.createdBy,
        note: data.note,
      };
      const res = await apiClient.post('/inventory/stock-in', payload);
      const created = mapApiStockIn(res.data);
      const receipts = getStorageItem<StockInReceipt[]>(KEYS.STOCK_IN, initialStockInReceipts);
      setStorageItem(KEYS.STOCK_IN, [created, ...receipts]);
      return created;
    } catch (err) {
      console.warn('[inventoryService] Backend error, fallback local stock in:', err);
      const receipts = getStorageItem<StockInReceipt[]>(KEYS.STOCK_IN, initialStockInReceipts);
      const code = `PNK-2026-${String(receipts.length + 1).padStart(3, '0')}`;
      const now = new Date();
      const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const newReceipt: StockInReceipt = {
        ...data,
        id: `STK-IN-${String(receipts.length + 1).padStart(3, '0')}`,
        code,
        createdAt: dateFormatted,
      };

      const history = getStorageItem<InventoryHistoryRecord[]>(KEYS.HISTORY, initialInventoryHistory);
      for (const item of newReceipt.items) {
        const updated = await productService.updateStock(item.productId, item.quantity);
        history.unshift({
          id: `HIST-${Date.now()}-${item.productId}`,
          code: newReceipt.code,
          type: 'in',
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          quantity: item.quantity,
          balanceAfter: updated.stock,
          warehouse: newReceipt.warehouse,
          performer: newReceipt.createdBy,
          date: dateFormatted,
          note: newReceipt.note || `Nhập kho theo phiếu ${newReceipt.code}`,
        });
      }

      setStorageItem(KEYS.STOCK_IN, [newReceipt, ...receipts]);
      setStorageItem(KEYS.HISTORY, history);
      return newReceipt;
    }
  },

  getStockOutReceipts: async (): Promise<StockOutReceipt[]> => {
    try {
      const res = await apiClient.get('/inventory/stock-out');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiStockOut);
        setStorageItem(KEYS.STOCK_OUT, list);
        return list;
      }
    } catch (err) {
      console.warn('[inventoryService] Backend error, fallback to storage:', err);
    }
    return getStorageItem<StockOutReceipt[]>(KEYS.STOCK_OUT, initialStockOutReceipts);
  },

  createStockOutReceipt: async (
    data: Omit<StockOutReceipt, 'id' | 'code' | 'createdAt'>
  ): Promise<StockOutReceipt> => {
    try {
      const payload = {
        warehouse: data.warehouse,
        target_warehouse: data.destinationWarehouse,
        reason: data.reason,
        items: data.items.map((i) => ({
          product_id: i.productId,
          sku: i.sku,
          name: i.name,
          unit: 'Chiếc',
          quantity: i.quantity,
          cost_price: i.costPrice,
          subtotal: i.subtotal,
        })),
        total_amount: data.totalAmount,
        created_by: data.createdBy,
        note: data.note,
      };
      const res = await apiClient.post('/inventory/stock-out', payload);
      const created = mapApiStockOut(res.data);
      const receipts = getStorageItem<StockOutReceipt[]>(KEYS.STOCK_OUT, initialStockOutReceipts);
      setStorageItem(KEYS.STOCK_OUT, [created, ...receipts]);
      return created;
    } catch (err) {
      console.warn('[inventoryService] Backend error, fallback local stock out:', err);
      const receipts = getStorageItem<StockOutReceipt[]>(KEYS.STOCK_OUT, initialStockOutReceipts);
      const code = `PXK-2026-${String(receipts.length + 1).padStart(3, '0')}`;
      const now = new Date();
      const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const newReceipt: StockOutReceipt = {
        ...data,
        id: `STK-OUT-${String(receipts.length + 1).padStart(3, '0')}`,
        code,
        createdAt: dateFormatted,
      };

      const history = getStorageItem<InventoryHistoryRecord[]>(KEYS.HISTORY, initialInventoryHistory);
      for (const item of newReceipt.items) {
        const prod = await productService.getById(item.productId);
        if (prod && prod.stock < item.quantity) {
          throw new Error(`Sản phẩm ${item.name} không đủ tồn kho (Còn ${prod.stock}, yêu cầu xuất ${item.quantity})`);
        }
        const updated = await productService.updateStock(item.productId, -item.quantity);
        history.unshift({
          id: `HIST-${Date.now()}-${item.productId}`,
          code: newReceipt.code,
          type: newReceipt.reason === 'transfer' ? 'transfer' : 'out',
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          quantity: -item.quantity,
          balanceAfter: updated.stock,
          warehouse: newReceipt.warehouse,
          performer: newReceipt.createdBy,
          date: dateFormatted,
          note: newReceipt.note || `Xuất kho: ${newReceipt.reason}`,
        });
      }

      setStorageItem(KEYS.STOCK_OUT, [newReceipt, ...receipts]);
      setStorageItem(KEYS.HISTORY, history);
      return newReceipt;
    }
  },

  getHistory: async (): Promise<InventoryHistoryRecord[]> => {
    try {
      const res = await apiClient.get('/inventory/history');
      if (Array.isArray(res.data) && res.data.length > 0) {
        const list = res.data.map(mapApiHistory);
        setStorageItem(KEYS.HISTORY, list);
        return list;
      }
    } catch (err) {
      console.warn('[inventoryService] Backend error, fallback to storage:', err);
    }
    return getStorageItem<InventoryHistoryRecord[]>(KEYS.HISTORY, initialInventoryHistory);
  }
};
