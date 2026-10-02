import { InventoryHistoryRecord, StockInReceipt, StockOutReceipt } from '../types/Inventory';
import { initialStockInReceipts, initialStockOutReceipts, initialInventoryHistory } from '../mock/inventory';
import { getStorageItem, setStorageItem } from './storage';
import { productService } from './productService';

const KEYS = {
  STOCK_IN: 'kv_stock_in_receipts',
  STOCK_OUT: 'kv_stock_out_receipts',
  HISTORY: 'kv_inventory_history',
};

export const inventoryService = {
  getStockInReceipts: async (): Promise<StockInReceipt[]> => {
    await new Promise((r) => setTimeout(r, 200));
    return getStorageItem<StockInReceipt[]>(KEYS.STOCK_IN, initialStockInReceipts);
  },

  createStockInReceipt: async (
    data: Omit<StockInReceipt, 'id' | 'code' | 'createdAt'>
  ): Promise<StockInReceipt> => {
    await new Promise((r) => setTimeout(r, 300));
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

    // Update stock & record history
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
  },

  getStockOutReceipts: async (): Promise<StockOutReceipt[]> => {
    await new Promise((r) => setTimeout(r, 200));
    return getStorageItem<StockOutReceipt[]>(KEYS.STOCK_OUT, initialStockOutReceipts);
  },

  createStockOutReceipt: async (
    data: Omit<StockOutReceipt, 'id' | 'code' | 'createdAt'>
  ): Promise<StockOutReceipt> => {
    await new Promise((r) => setTimeout(r, 300));
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

    // Verify stock availability & deduct
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
  },

  getHistory: async (): Promise<InventoryHistoryRecord[]> => {
    await new Promise((r) => setTimeout(r, 150));
    return getStorageItem<InventoryHistoryRecord[]>(KEYS.HISTORY, initialInventoryHistory);
  }
};
