// Types for Excel/CSV Import feature

export type ImportRowStatus = 'new' | 'update' | 'error' | 'warning';

export interface ImportRowError {
  field: string;
  message: string;
}

export interface ImportRow {
  rowIndex: number; // 1-based row number in original file (header = row 1, data starts at row 2)
  status: ImportRowStatus;
  data: {
    sku: string;
    name: string;
    category: string;
    barcode: string;
    costPrice: string | number;
    salePrice: string | number;
    stock: string | number;
    minStock: string | number;
    unit: string;
    description?: string;
    supplierName?: string;
  };
  errors: ImportRowError[];
  warnings: ImportRowError[];
  existingProductId?: string; // If this is an update, the existing product ID
}

export interface ImportSummary {
  totalRows: number;
  newRows: number;
  updateRows: number;
  errorRows: number;
  warningRows: number;
  validRows: number;
}

export interface ImportResult {
  fileName: string;
  fileSize: number;
  importedAt: string;
  rows: ImportRow[];
  summary: ImportSummary;
}

export type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

// ── Post-import detailed report ──────────────────────

export type ImportOutcome = 'created' | 'updated' | 'skipped_error' | 'skipped_warning';

export interface ImportReportRow {
  rowIndex: number;
  outcome: ImportOutcome;
  sku: string;
  name: string;
  salePrice: string | number;
  stock: string | number;
  unit: string;
  errors: ImportRowError[];
  warnings: ImportRowError[];
}

export interface ImportReport {
  fileName: string;
  fileSize: number;
  startedAt: string;   // ISO timestamp when import confirmed
  finishedAt: string;  // ISO timestamp when import completed
  durationMs: number;
  totalProcessed: number;
  created: number;
  updated: number;
  skippedError: number;
  skippedWarning: number;
  rows: ImportReportRow[];
}
