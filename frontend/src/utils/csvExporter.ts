/**
 * TIỆN ÍCH XUẤT FILE EXCEL / CSV HIỆU NĂNG CAO DÀNH CHO DỮ LIỆU CỰC LỚN (BIG DATA EXPORT)
 * - Sử dụng Blob và URL.createObjectURL thay thế cho data URI để vượt qua giới hạn độ dài URL (2MB limit).
 * - Sử dụng BOM UTF-8 (\uFEFF) giúp Microsoft Excel hiển thị chuẩn 100% tiếng Việt có dấu.
 * - Xử lý theo cơ chế Chunking phân mảnh hàng loạt giúp trình duyệt không bị đơ hoặc tràn bộ nhớ RAM (OOM)
 *   khi xuất dữ liệu hàng chục nghìn đến hàng trăm nghìn dòng.
 */

function escapeCSVCell(val: any): string {
  if (val === null || val === undefined) {
    return '""';
  }
  const str = String(val);
  // Nếu có dấu phẩy, dấu nháy kép hoặc xuống dòng -> bọc trong nháy kép và escape nháy kép kép
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export interface CSVExportOptions {
  filename: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  chunkSize?: number;
}

/**
 * Xuất dữ liệu lớn ra file CSV tương thích Excel
 */
export function exportToCSV({
  filename,
  headers,
  rows,
  chunkSize = 5000,
}: CSVExportOptions): void {
  const parts: string[] = [];

  // 1. Thêm dòng tiêu đề (Header row)
  const headerLine = headers.map(escapeCSVCell).join(',') + '\r\n';
  parts.push(headerLine);

  // 2. Gom dữ liệu theo từng lô (Chunking) để tối ưu phân bổ bộ nhớ
  const totalRows = rows.length;
  for (let i = 0; i < totalRows; i += chunkSize) {
    const chunkRows = rows.slice(i, i + chunkSize);
    let chunkString = '';
    for (let j = 0; j < chunkRows.length; j++) {
      const row = chunkRows[j];
      chunkString += row.map(escapeCSVCell).join(',') + '\r\n';
    }
    parts.push(chunkString);
  }

  // 3. Tạo Blob với BOM UTF-8 (\uFEFF) hỗ trợ tiếng Việt trên Excel
  const blob = new Blob(['\uFEFF', ...parts], {
    type: 'text/csv;charset=utf-8;',
  });

  // 4. Tạo URL tải xuống an toàn qua Object URL
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 5. Giải phóng vùng nhớ Object URL
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1500);
}
