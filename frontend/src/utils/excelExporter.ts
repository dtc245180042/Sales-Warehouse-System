/**
 * TIỆN ÍCH XUẤT BẢNG TÍNH EXCEL (.XLS) ĐỊNH DẠNG ĐẸP, CHUẨN PHÂN CỘT
 * - Tạo tài liệu HTML/XML Spreadsheet tương thích 100% với Microsoft Excel, Google Sheets, LibreOffice.
 * - Giải quyết triệt để lỗi CSV bị dồn tất cả dữ liệu vào Cột A trên Windows.
 * - Hỗ trợ font Segoe UI / Arial, căn lề chuẩn (trái, giữa, phải), tô màu Header, kẻ khung bảng,
 *   tô màu trạng thái và dòng Tổng cộng chuyên nghiệp.
 */

export interface ExcelColumnConfig {
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string | number; // vd: '140px', '200px' hoặc số 140
  nowrap?: boolean;
}

export interface ExcelCellObject {
  value: string | number | null | undefined;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  colSpan?: number;
  nowrap?: boolean;
  format?: 'text' | 'number';
}

export type ExcelCellValue = string | number | null | undefined | ExcelCellObject;

export interface ExcelExportDataOptions {
  filename: string;
  title: string;
  subtitle?: string;
  sheetName?: string;
  columns: ExcelColumnConfig[];
  rows: ExcelCellValue[][];
  summaryRow?: ExcelCellValue[];
}

export function exportStyledExcel({
  filename,
  title,
  subtitle,
  sheetName = 'Báo cáo',
  columns,
  rows,
  summaryRow,
}: ExcelExportDataOptions): void {
  const now = new Date();
  const exportTimeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const colSpan = columns.length;

  // Xây dựng các thẻ <col> trong <colgroup> chuẩn Microsoft Excel
  const colGroupHtml = columns
    .map((col) => {
      let px = 120;
      if (typeof col.width === 'number') {
        px = col.width;
      } else if (typeof col.width === 'string') {
        const parsed = parseInt(col.width, 10);
        if (!isNaN(parsed) && parsed > 0) px = parsed;
      }
      // 1 px xấp xỉ 0.75 pt trong Microsoft Excel
      const pt = Math.round(px * 0.75);
      return `    <col width="${px}" style="width: ${pt}pt; mso-width-source: users;"/>`;
    })
    .join('\n');

  let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${sheetName.replace(/[\\/?*\[\]]/g, '_')}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
    .excel-table { border-collapse: collapse; table-layout: fixed; }
    .title-cell { font-size: 16pt; font-weight: bold; color: #1e3a8a; text-align: center; height: 42px; vertical-align: middle; }
    .sub-cell { font-size: 10pt; color: #475569; text-align: center; height: 26px; font-style: italic; vertical-align: middle; }
    .header-cell {
      background-color: #1e40af;
      color: #ffffff;
      font-weight: bold;
      font-size: 10.5pt;
      text-align: center;
      padding: 10px 8px;
      border: 1px solid #1e3a8a;
      vertical-align: middle;
      height: 32px;
      white-space: nowrap;
    }
    .data-cell {
      font-size: 10pt;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
      mso-number-format: "\\@";
    }
    .summary-cell {
      background-color: #f1f5f9;
      font-weight: bold;
      font-size: 10.5pt;
      color: #0f172a;
      padding: 9px 10px;
      border: 1px solid #94a3b8;
      border-top: 2px solid #334155;
      vertical-align: middle;
      mso-number-format: "\\@";
    }
    .align-left { text-align: left; }
    .align-center { text-align: center; }
    .align-right { text-align: right; }
    .nowrap { white-space: nowrap; }
  </style>
</head>
<body>
  <table class="excel-table">
    <colgroup>
${colGroupHtml}
    </colgroup>

    <!-- Hàng tiêu đề báo cáo -->
    <tr>
      <td colspan="${colSpan}" class="title-cell">${title}</td>
    </tr>
    <tr>
      <td colspan="${colSpan}" class="sub-cell">
        ${subtitle ? subtitle + ' &bull; ' : ''}Thời gian xuất báo cáo: ${exportTimeStr}
      </td>
    </tr>
    <tr><td colspan="${colSpan}" style="height: 12px;"></td></tr>

    <!-- Hàng Header các cột -->
    <thead>
      <tr>
  `;

  // Render các cột Header
  columns.forEach((col) => {
    let styleStr = '';
    if (col.width) {
      styleStr = ` style="width: ${col.width}; min-width: ${col.width};"`;
    }
    html += `<th class="header-cell"${styleStr}>${col.header}</th>`;
  });

  html += `
      </tr>
    </thead>
    <tbody>
  `;

  // Render các dòng dữ liệu
  rows.forEach((row, rowIdx) => {
    const isEven = rowIdx % 2 === 1;
    const rowBg = isEven ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';

    html += `<tr style="${rowBg}">`;
    row.forEach((cell, colIdx) => {
      const colDef = columns[colIdx] || {};
      const defaultAlign = colDef.align || 'left';

      if (cell !== null && typeof cell === 'object') {
        const alignClass = `align-${cell.align || defaultAlign}`;
        const nowrapClass = cell.nowrap || colDef.nowrap ? ' nowrap' : '';
        const colSpanAttr = cell.colSpan ? ` colspan="${cell.colSpan}"` : '';

        let customStyle = '';
        if (cell.color) customStyle += `color: ${cell.color}; `;
        if (cell.bgColor) customStyle += `background-color: ${cell.bgColor}; `;
        if (cell.bold) customStyle += `font-weight: bold; `;
        if (cell.format === 'number') {
          customStyle += `mso-number-format: "#\\,##0"; `;
        } else {
          customStyle += `mso-number-format: "\\@"; `;
        }

        html += `<td class="data-cell ${alignClass}${nowrapClass}"${colSpanAttr} style="${customStyle}">${cell.value ?? ''}</td>`;
      } else {
        const isNumeric = typeof cell === 'number';
        const alignClass = `align-${defaultAlign}`;
        const formatStyle = isNumeric ? 'mso-number-format: "#\\,##0";' : 'mso-number-format: "\\@";';
        const nowrapClass = colDef.nowrap ? ' nowrap' : '';
        html += `<td class="data-cell ${alignClass}${nowrapClass}" style="${formatStyle}">${cell ?? ''}</td>`;
      }
    });
    html += `</tr>`;
  });

  // Render dòng Tổng cộng (Summary row) nếu có
  if (summaryRow && summaryRow.length > 0) {
    html += `<tr>`;
    let currentSummaryColIdx = 0;
    summaryRow.forEach((sumCell) => {
      const colDef = columns[currentSummaryColIdx] || {};
      if (sumCell !== null && typeof sumCell === 'object') {
        const alignClass = `align-${sumCell.align || colDef.align || 'right'}`;
        const colSpanAttr = sumCell.colSpan ? ` colspan="${sumCell.colSpan}"` : '';
        let customStyle = '';
        if (sumCell.color) customStyle += `color: ${sumCell.color}; `;
        if (sumCell.bgColor) customStyle += `background-color: ${sumCell.bgColor}; `;
        if (sumCell.bold !== false) customStyle += `font-weight: bold; `;
        if (sumCell.format === 'number') {
          customStyle += `mso-number-format: "#\\,##0"; `;
        } else {
          customStyle += `mso-number-format: "\\@"; `;
        }

        html += `<td class="summary-cell ${alignClass}"${colSpanAttr} style="${customStyle}">${sumCell.value ?? ''}</td>`;
        currentSummaryColIdx += sumCell.colSpan || 1;
      } else {
        const isNumeric = typeof sumCell === 'number';
        const alignClass = `align-${colDef.align || (currentSummaryColIdx === 0 ? 'left' : 'right')}`;
        const formatStyle = isNumeric ? 'mso-number-format: "#\\,##0";' : 'mso-number-format: "\\@";';
        html += `<td class="summary-cell ${alignClass}" style="${formatStyle}">${sumCell ?? ''}</td>`;
        currentSummaryColIdx += 1;
      }
    });
    html += `</tr>`;
  }

  html += `
    </tbody>
  </table>
</body>
</html>
  `;

  // Tạo Blob dạng Excel và trigger download
  const blob = new Blob(['\uFEFF', html], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}
