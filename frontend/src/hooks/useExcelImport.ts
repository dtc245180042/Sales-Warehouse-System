import { useState, useCallback } from 'react';
import { ImportRow, ImportResult, ImportStep, ImportSummary, ImportReport, ImportReportRow } from '../types/ExcelImport';
import { initialProducts } from '../mock/products';
import { getStorageItem, setStorageItem } from '../services/storage';
import { Product } from '../types/Product';

const PRODUCTS_STORAGE_KEY = 'kv_products';

// Required columns mapping (case-insensitive header matching)
const COLUMN_ALIASES: Record<string, string> = {
  'mã sku': 'sku',
  'sku': 'sku',
  'mã sản phẩm': 'sku',
  'tên sản phẩm': 'name',
  'tên': 'name',
  'name': 'name',
  'danh mục': 'category',
  'category': 'category',
  'mã vạch': 'barcode',
  'barcode': 'barcode',
  'giá nhập': 'costPrice',
  'giá vốn': 'costPrice',
  'cost price': 'costPrice',
  'costprice': 'costPrice',
  'giá bán': 'salePrice',
  'sale price': 'salePrice',
  'saleprice': 'salePrice',
  'tồn kho': 'stock',
  'số lượng': 'stock',
  'stock': 'stock',
  'tồn kho tối thiểu': 'minStock',
  'min stock': 'minStock',
  'minstock': 'minStock',
  'đơn vị': 'unit',
  'unit': 'unit',
  'mô tả': 'description',
  'description': 'description',
  'nhà cung cấp': 'supplierName',
  'supplier': 'supplierName',
  'suppliername': 'supplierName',
};

const REQUIRED_FIELDS = ['sku', 'name', 'salePrice', 'unit'];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function parseNumber(val: string | number): number {
  if (typeof val === 'number') return val;
  // Remove currency symbols, dots used as thousand separators
  const cleaned = String(val).replace(/[₫đ\s,]/g, '').replace(/\./g, '');
  return parseFloat(cleaned);
}

/**
 * Parse CSV text into rows of string arrays
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    // Simple CSV parser: handle quoted fields
    const cells: string[] = [];
    let inQuote = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

/**
 * Validate and parse rows
 */
function validateAndParseRows(rawRows: string[][]): ImportRow[] {
  if (rawRows.length < 2) return [];

  // Build header map
  const headerRow = rawRows[0].map(normalizeHeader);
  const fieldMap: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const mapped = COLUMN_ALIASES[headerRow[i]];
    if (mapped) {
      fieldMap[mapped] = i;
    }
  }

  const existingSkus = new Set(initialProducts.map((p) => p.sku.toLowerCase()));
  const seenSkusInFile = new Map<string, number>(); // sku -> rowIndex

  const result: ImportRow[] = [];

  for (let rIdx = 1; rIdx < rawRows.length; rIdx++) {
    const cells = rawRows[rIdx];
    // Skip completely empty rows
    if (cells.every((c) => !c.trim())) continue;

    const getField = (field: string): string =>
      fieldMap[field] !== undefined ? (cells[fieldMap[field]] ?? '').trim() : '';

    const sku = getField('sku');
    const name = getField('name');
    const category = getField('category');
    const barcode = getField('barcode');
    const costPriceRaw = getField('costPrice');
    const salePriceRaw = getField('salePrice');
    const stockRaw = getField('stock');
    const minStockRaw = getField('minStock');
    const unit = getField('unit');
    const description = getField('description');
    const supplierName = getField('supplierName');

    const errors: ImportRow['errors'] = [];
    const warnings: ImportRow['warnings'] = [];

    // --- Required field checks ---
    for (const f of REQUIRED_FIELDS) {
      if (!getField(f)) {
        errors.push({ field: f, message: `Trường "${f}" là bắt buộc và không được để trống.` });
      }
    }

    // --- Numeric validation ---
    const costPrice = parseNumber(costPriceRaw);
    const salePrice = parseNumber(salePriceRaw);
    const stock = parseNumber(stockRaw || '0');
    const minStock = parseNumber(minStockRaw || '0');

    if (salePriceRaw && isNaN(salePrice)) {
      errors.push({ field: 'salePrice', message: 'Giá bán không hợp lệ (phải là số).' });
    }
    if (costPriceRaw && isNaN(costPrice)) {
      errors.push({ field: 'costPrice', message: 'Giá nhập không hợp lệ (phải là số).' });
    }
    if (stockRaw && isNaN(stock)) {
      errors.push({ field: 'stock', message: 'Tồn kho không hợp lệ (phải là số nguyên).' });
    }

    if (!isNaN(salePrice) && !isNaN(costPrice) && costPrice > 0 && salePrice < costPrice) {
      warnings.push({ field: 'salePrice', message: 'Giá bán thấp hơn giá nhập — kiểm tra lại?' });
    }

    if (!isNaN(salePrice) && salePrice <= 0) {
      errors.push({ field: 'salePrice', message: 'Giá bán phải lớn hơn 0.' });
    }

    // --- Duplicate SKU in same file ---
    if (sku) {
      const skuKey = sku.toLowerCase();
      if (seenSkusInFile.has(skuKey)) {
        warnings.push({
          field: 'sku',
          message: `SKU trùng với dòng ${seenSkusInFile.get(skuKey)} trong cùng tệp.`,
        });
      } else {
        seenSkusInFile.set(skuKey, rIdx + 1);
      }
    }

    // Determine if it's a new product or an update
    const isExisting = sku ? existingSkus.has(sku.toLowerCase()) : false;
    const existingProduct = isExisting
      ? initialProducts.find((p) => p.sku.toLowerCase() === sku.toLowerCase())
      : undefined;

    let status: ImportRow['status'];
    if (errors.length > 0) {
      status = 'error';
    } else if (warnings.length > 0) {
      status = 'warning';
    } else if (isExisting) {
      status = 'update';
    } else {
      status = 'new';
    }

    result.push({
      rowIndex: rIdx + 1, // +1 for 1-based, header is row 1
      status,
      data: {
        sku,
        name,
        category,
        barcode,
        costPrice: isNaN(costPrice) ? costPriceRaw : costPrice,
        salePrice: isNaN(salePrice) ? salePriceRaw : salePrice,
        stock: isNaN(stock) ? 0 : Math.floor(stock),
        minStock: isNaN(minStock) ? 0 : Math.floor(minStock),
        unit,
        description,
        supplierName,
      },
      errors,
      warnings,
      existingProductId: existingProduct?.id,
    });
  }

  return result;
}

function computeSummary(rows: ImportRow[]): ImportSummary {
  return {
    totalRows: rows.length,
    newRows: rows.filter((r) => r.status === 'new').length,
    updateRows: rows.filter((r) => r.status === 'update').length,
    errorRows: rows.filter((r) => r.status === 'error').length,
    warningRows: rows.filter((r) => r.status === 'warning').length,
    validRows: rows.filter((r) => r.status === 'new' || r.status === 'update').length,
  };
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────

export function useExcelImport() {
  const [step, setStep] = useState<ImportStep>('upload');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setParseError(null);

    try {
      const text = await file.text();

      // Detect if it's a CSV (simple heuristic: not a binary file)
      // For XLSX we'd need a library; here we simulate XLSX by treating it as CSV for demo
      let rawRows: string[][];
      if (file.name.toLowerCase().endsWith('.csv')) {
        rawRows = parseCSV(text);
      } else {
        // XLSX - simulate with mock data since we can't parse binary without a library
        rawRows = generateMockXlsxRows();
      }

      const rows = validateAndParseRows(rawRows);
      const summary = computeSummary(rows);

      setImportResult({
        fileName: file.name,
        fileSize: file.size,
        importedAt: new Date().toISOString(),
        rows,
        summary,
      });
      setStep('preview');
    } catch (e) {
      setParseError(`Không thể đọc tệp: ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setStep('upload');
    setImportResult(null);
    setImportReport(null);
    setParseError(null);
    setIsDragging(false);
  }, []);

  /**
   * Build and store the detailed ImportReport after a simulated import run.
   * Call this AFTER the "importing" animation, just before transitioning to "done".
   */
  const buildReport = useCallback(
    (result: ImportResult, startedAt: string, finishedAt: string): ImportReport => {
      // ── Persist valid rows to localStorage (simulate actual DB write) ──
      const today = new Date().toISOString().split('T')[0];
      const products = getStorageItem<Product[]>(PRODUCTS_STORAGE_KEY, initialProducts);
      const productMap = new Map<string, Product>(products.map((p) => [p.sku.toLowerCase(), p]));

      for (const row of result.rows) {
        if (row.status !== 'new' && row.status !== 'update') continue;
        const { sku, name, category, barcode, costPrice, salePrice, stock, minStock, unit, description, supplierName } = row.data;
        const existing = productMap.get(sku.toLowerCase());

        if (row.status === 'new' || !existing) {
          // Create new product
          const newProduct: Product = {
            id: row.existingProductId ?? `PRD-IMP-${Date.now()}-${row.rowIndex}`,
            sku,
            barcode: barcode || '',
            name,
            category: category || 'Khác',
            supplierId: '',
            supplierName: supplierName || '',
            costPrice: typeof costPrice === 'number' ? costPrice : 0,
            salePrice: typeof salePrice === 'number' ? salePrice : 0,
            stock: typeof stock === 'number' ? stock : 0,
            minStock: typeof minStock === 'number' ? minStock : 0,
            unit: unit || 'Chiếc',
            image: '',
            description: description || '',
            status: 'active',
            createdAt: today,
            updatedAt: today,
          };
          productMap.set(sku.toLowerCase(), newProduct);
        } else {
          // Update existing product fields
          const updated: Product = {
            ...existing,
            name: name || existing.name,
            category: category || existing.category,
            barcode: barcode || existing.barcode,
            costPrice: typeof costPrice === 'number' ? costPrice : existing.costPrice,
            salePrice: typeof salePrice === 'number' ? salePrice : existing.salePrice,
            stock: typeof stock === 'number' ? stock : existing.stock,
            minStock: typeof minStock === 'number' ? minStock : existing.minStock,
            unit: unit || existing.unit,
            description: description || existing.description,
            supplierName: supplierName || existing.supplierName,
            updatedAt: today,
          };
          productMap.set(sku.toLowerCase(), updated);
        }
      }

      // Save back — filter only valid product IDs (exclude pure-new imports not in initialProducts)
      // We merge: initialProducts ids + newly created
      const mergedProducts = Array.from(productMap.values());
      setStorageItem(PRODUCTS_STORAGE_KEY, mergedProducts);

      // ── Build report rows ──
      const reportRows: ImportReportRow[] = result.rows.map((row) => {
        let outcome: ImportReportRow['outcome'];
        if (row.status === 'new') outcome = 'created';
        else if (row.status === 'update') outcome = 'updated';
        else if (row.status === 'warning') outcome = 'skipped_warning';
        else outcome = 'skipped_error';

        return {
          rowIndex: row.rowIndex,
          outcome,
          sku: row.data.sku,
          name: row.data.name,
          salePrice: row.data.salePrice,
          stock: row.data.stock,
          unit: row.data.unit,
          errors: row.errors,
          warnings: row.warnings,
        };
      });

      const startMs = new Date(startedAt).getTime();
      const endMs = new Date(finishedAt).getTime();

      return {
        fileName: result.fileName,
        fileSize: result.fileSize,
        startedAt,
        finishedAt,
        durationMs: endMs - startMs,
        totalProcessed: result.rows.length,
        created: result.summary.newRows,
        updated: result.summary.updateRows,
        skippedError: result.summary.errorRows,
        skippedWarning: result.summary.warningRows,
        rows: reportRows,
      };
    },
    [],
  );

  return {
    step,
    setStep,
    importResult,
    importReport,
    setImportReport,
    buildReport,
    isDragging,
    setIsDragging,
    isProcessing,
    parseError,
    processFile,
    reset,
  };
}

// ──────────────────────────────────────────
// Demo mock XLSX rows (for .xlsx files in demo)
// ──────────────────────────────────────────

function generateMockXlsxRows(): string[][] {
  return [
    ['Mã SKU', 'Tên sản phẩm', 'Danh mục', 'Mã vạch', 'Giá nhập', 'Giá bán', 'Tồn kho', 'Tồn kho tối thiểu', 'Đơn vị', 'Nhà cung cấp', 'Mô tả'],
    // New products
    ['SMT-RING-GEN2', 'Smart Ring Gen 2 Titan', 'Phụ Kiện Công Nghệ', '893850900001', '2800000', '3990000', '50', '8', 'Chiếc', 'Tech Import VN', 'Theo dõi sức khỏe 24/7 không cần sạc'],
    ['WRL-CHRG-100W', 'Trạm Sạc Nhanh 100W GaN 4 Cổng', 'Phụ Kiện Công Nghệ', '893850900002', '650000', '990000', '120', '20', 'Chiếc', 'Baseus VN', 'Sạc 4 thiết bị cùng lúc, công nghệ GaN thế hệ 3'],
    // Existing products (will be marked as UPDATE)
    ['IP15P-128-TI', 'iPhone 15 Pro 128GB Titan Tự Nhiên', 'Điện Thoại & Tablet', '893850123001', '22500000', '25990000', '20', '5', 'Chiếc', 'Apple Distribution VN', 'Chip A17 Pro mạnh mẽ'],
    ['SAM-S24U-512', 'Samsung Galaxy S24 Ultra 512GB', 'Điện Thoại & Tablet', '893850123002', '25000000', '28990000', '12', '4', 'Chiếc', 'Samsung Electronics Vina', 'Galaxy AI tích hợp'],
    // Row with errors
    ['', 'Sản phẩm lỗi thiếu SKU', 'Phụ Kiện Công Nghệ', '893850900099', '500000', '700000', '10', '2', 'Chiếc', '', ''],
    ['ERR-PRICE-001', 'Sản phẩm giá bán sai', 'Laptop & Máy Tính', '893850900100', 'abc_invalid', '-500', '5', '1', 'Chiếc', '', ''],
    // Row with warning (selling below cost)
    ['WARN-MARG-001', 'Cáp Sạc USB-C 240W', 'Phụ Kiện Công Nghệ', '893850900200', '350000', '280000', '200', '30', 'Chiếc', 'Generic', 'Cáp sạc nhanh 240W PD3.1'],
    // Another new product
    ['XIAO-PAD-6PRO', 'Xiaomi Pad 6 Pro 256GB Wi-Fi', 'Điện Thoại & Tablet', '893850900300', '8900000', '11490000', '30', '5', 'Chiếc', 'Xiaomi Vietnam Official', 'Snapdragon 8+ Gen 1, màn hình 144Hz'],
  ];
}
