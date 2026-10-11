import React, { useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '../common/Button';
import { StockTransfer } from '../../types/StockTransfer';
import { formatCurrency, formatNumber, formatDate, parseSafeDate } from '../../utils/formatters';

interface StockTransferPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: StockTransfer | null;
}

/**
 * Component hiển thị mẫu phiếu in chuyển kho chuẩn khổ A4
 * Mẫu 03 - XKNB ban hành theo Thông tư số 200/2014/TT-BTC
 */
export const StockTransferPrintDoc: React.FC<{ transfer: StockTransfer }> = ({ transfer }) => {
  const totalTransferQty = transfer.items.reduce((sum, i) => sum + (i.transfer_quantity || 0), 0);
  const totalReceivedQty = transfer.items.reduce(
    (sum, i) => sum + (i.received_quantity ?? i.transfer_quantity ?? 0),
    0
  );
  const totalValue = transfer.items.reduce(
    (sum, i) => sum + (i.transfer_quantity || 0) * (i.cost_price || 0),
    0
  );

  const transferDateObj = parseSafeDate(transfer.created_at) || new Date();
  const day = String(transferDateObj.getDate()).padStart(2, '0');
  const month = String(transferDateObj.getMonth() + 1).padStart(2, '0');
  const year = transferDateObj.getFullYear();

  return (
    <div
      className="bg-white text-black p-8 sm:p-12 shadow-md w-full max-w-[210mm] min-h-[297mm] box-border mx-auto"
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
      {/* Header Chứng Từ */}
      <div className="flex justify-between items-start border-b border-black pb-3 mb-4 text-xs">
        <div className="space-y-0.5">
          <p className="font-bold uppercase text-[13px]">HỆ THỐNG QUẢN LÝ BÁN HÀNG & KHO VẬN</p>
          <p>
            Kho xuất hàng: <strong>{transfer.source_warehouse}</strong>
          </p>
          <p>
            Kho nhận hàng: <strong>{transfer.destination_warehouse}</strong>
          </p>
        </div>

        <div className="text-right space-y-0.5">
          <p className="font-bold">Mẫu số: 03 - XKNB</p>
          <p className="italic text-[11px]">(Ban hành theo TT số 200/2014/TT-BTC)</p>
          <p>
            Mã chứng từ: <strong className="font-bold text-[13px]">{transfer.code}</strong>
          </p>
        </div>
      </div>

      {/* Tiêu đề phiếu */}
      <div className="text-center my-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide mb-1">
          PHIẾU XUẤT KHO KIÊM ĐIỀU CHUYỂN NỘI BỘ
        </h1>
        <p className="italic text-sm">
          Ngày {day} tháng {month} năm {year}
        </p>
        <p className="font-bold text-sm mt-0.5">Số: {transfer.code}</p>
      </div>

      {/* Thông tin lệnh điều chuyển */}
      <div className="text-sm space-y-1.5 mb-6 text-black">
        <p>
          - Căn cứ lệnh điều chuyển số: <strong className="font-semibold">{transfer.code}</strong> ngày{' '}
          {formatDate(transfer.created_at)} của Ban Quản Lý Kho.
        </p>
        <p>
          - Người vận chuyển / bàn giao:{' '}
          <strong>{transfer.shipped_by || transfer.created_by || 'Nhân viên kho vận'}</strong>
        </p>
        <div className="grid grid-cols-2 gap-4">
          <p>
            - Xuất tại kho: <strong>{transfer.source_warehouse}</strong>
          </p>
          <p>
            - Nhập tại kho: <strong>{transfer.destination_warehouse}</strong>
          </p>
        </div>
        <p>
          - Lý do điều chuyển:{' '}
          <em>{transfer.note || 'Điều chuyển hàng hóa cân đối tồn kho chi nhánh'}</em>
        </p>
        <p>
          - Trạng thái phiếu:{' '}
          <strong>
            {transfer.status === 'completed'
              ? 'Đã nhập kho đến hoàn tất'
              : transfer.status === 'in_transit'
              ? 'Đang trên đường vận chuyển'
              : transfer.status === 'draft'
              ? 'Bản nháp'
              : 'Đã hủy'}
          </strong>
        </p>
      </div>

      {/* Bảng kê hàng hóa */}
      <table className="w-full border-collapse border border-black my-4 text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-black p-2 text-center w-10 font-bold">STT</th>
            <th className="border border-black p-2 text-left font-bold">
              Tên mặt hàng, nhãn hiệu, quy cách
            </th>
            <th className="border border-black p-2 text-center w-28 font-bold">Mã SKU</th>
            <th className="border border-black p-2 text-center w-14 font-bold">ĐVT</th>
            <th className="border border-black p-2 text-center w-20 font-bold">SL xuất</th>
            <th className="border border-black p-2 text-center w-20 font-bold">Thực nhận</th>
            <th className="border border-black p-2 text-right w-24 font-bold">Đơn giá vốn</th>
            <th className="border border-black p-2 text-right w-28 font-bold">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {transfer.items.map((item, idx) => {
            const subtotal = item.transfer_quantity * (item.cost_price || 0);
            const isDiff = item.discrepancy_quantity !== 0 && item.discrepancy_quantity !== undefined;

            return (
              <tr key={item.id || item.product_id}>
                <td className="border border-black p-2 text-center">{idx + 1}</td>
                <td className="border border-black p-2 font-semibold">
                  {item.product_name}
                  {item.discrepancy_reason && (
                    <span className="block text-[11px] font-normal italic text-red-700">
                      * Lệch: {item.discrepancy_quantity} ({item.discrepancy_reason})
                    </span>
                  )}
                </td>
                <td className="border border-black p-2 text-center font-mono">{item.sku || '-'}</td>
                <td className="border border-black p-2 text-center">{item.unit || 'cái'}</td>
                <td className="border border-black p-2 text-center font-bold">
                  {formatNumber(item.transfer_quantity)}
                </td>
                <td className="border border-black p-2 text-center font-bold">
                  {item.received_quantity !== null && item.received_quantity !== undefined ? (
                    <span className={isDiff ? 'text-red-700' : ''}>
                      {formatNumber(item.received_quantity)}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="border border-black p-2 text-right">
                  {formatCurrency(item.cost_price || 0)}
                </td>
                <td className="border border-black p-2 text-right font-semibold">
                  {formatCurrency(subtotal)}
                </td>
              </tr>
            );
          })}

          {/* Hàng Tổng cộng */}
          <tr className="font-bold bg-slate-50">
            <td colSpan={4} className="border border-black p-2 text-center uppercase">
              Cộng tổng số
            </td>
            <td className="border border-black p-2 text-center font-bold">
              {formatNumber(totalTransferQty)}
            </td>
            <td className="border border-black p-2 text-center font-bold">
              {transfer.status === 'completed' ? formatNumber(totalReceivedQty) : '-'}
            </td>
            <td className="border border-black p-2 text-right">-</td>
            <td className="border border-black p-2 text-right font-bold text-sm">
              {formatCurrency(totalValue)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Chú thích chênh lệch nếu có */}
      {transfer.has_discrepancy && (
        <div className="border border-black p-2.5 my-3 text-xs bg-slate-50">
          <p className="font-bold text-black">* BIÊN BẢN GHI NHẬN CHÊNH LỆCH KHI NHẬP KHO:</p>
          <p className="italic text-black mt-0.5">
            Lý do: {transfer.discrepancy_reason || 'Chưa ghi chú cụ thể'}
          </p>
        </div>
      )}

      <div className="text-xs italic mt-2 text-black">
        (Tổng số mặt hàng: {transfer.items.length} mặt hàng. Tổng số lượng gửi:{' '}
        {formatNumber(totalTransferQty)} sản phẩm.)
      </div>

      {/* Khu vực 5 chữ ký */}
      <div className="grid grid-cols-5 gap-2 text-center mt-12 text-xs text-black">
        <div>
          <p className="font-bold uppercase">Người lập phiếu</p>
          <p className="italic text-[11px]">(Ký, họ tên)</p>
          <div className="h-16"></div>
          <p className="font-bold">{transfer.created_by || 'Thủ kho lập'}</p>
        </div>

        <div>
          <p className="font-bold uppercase">Người vận chuyển</p>
          <p className="italic text-[11px]">(Ký, họ tên)</p>
          <div className="h-16"></div>
          <p className="font-bold">{transfer.shipped_by || 'Lái xe / Giao vận'}</p>
        </div>

        <div>
          <p className="font-bold uppercase">Thủ kho xuất</p>
          <p className="italic text-[11px]">(Ký, họ tên)</p>
          <div className="h-16"></div>
          <p className="font-bold">{transfer.shipped_by || 'Thủ kho xuất'}</p>
        </div>

        <div>
          <p className="font-bold uppercase">Thủ kho nhận</p>
          <p className="italic text-[11px]">(Ký, họ tên)</p>
          <div className="h-16"></div>
          <p className="font-bold">{transfer.received_by || 'Thủ kho nhận'}</p>
        </div>

        <div>
          <p className="font-bold uppercase">Thủ trưởng đơn vị</p>
          <p className="italic text-[11px]">(Ký, đóng dấu)</p>
          <div className="h-16"></div>
          <p className="font-bold">Ban Giám Đốc</p>
        </div>
      </div>
    </div>
  );
};

export const StockTransferPrintModal: React.FC<StockTransferPrintModalProps> = ({
  isOpen,
  onClose,
  transfer,
}) => {
  const printContentRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !transfer) return null;

  // Hàm in ấn trực tiếp qua iframe cách ly tuyệt đối, không bao giờ bị trắng trang
  const handlePrint = () => {
    if (!printContentRef.current) return;

    const contentHtml = printContentRef.current.innerHTML;
    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'fixed';
    printWindow.style.left = '-9999px';
    printWindow.style.top = '-9999px';
    printWindow.style.width = '1000px';
    printWindow.style.height = '1400px';
    printWindow.style.border = '0';

    document.body.appendChild(printWindow);

    const doc = printWindow.contentDocument || printWindow.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Phiếu Chuyển Kho - ${transfer.code}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 11pt;
              line-height: 1.35;
              color: #000000 !important;
              background: #ffffff !important;
              margin: 0;
              padding: 0;
            }
            .flex { display: flex !important; }
            .justify-between { justify-content: space-between !important; }
            .items-start { align-items: flex-start !important; }
            .items-center { align-items: center !important; }
            .grid { display: grid !important; }
            .grid-cols-2 { display: flex !important; justify-content: space-between !important; }
            .grid-cols-5 { display: flex !important; justify-content: space-between !important; }
            .grid-cols-5 > div { width: 19% !important; text-align: center !important; }
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .text-left { text-align: left !important; }
            .font-bold { font-weight: bold !important; }
            .font-semibold { font-weight: 600 !important; }
            .italic { font-style: italic !important; }
            .uppercase { text-transform: uppercase !important; }
            .text-2xl { font-size: 16pt !important; }
            .text-sm { font-size: 11pt !important; }
            .text-xs { font-size: 10pt !important; }
            .h-16 { height: 60px !important; }
            table { width: 100% !important; border-collapse: collapse !important; margin: 12px 0 !important; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            th, td { border: 1px solid #000000 !important; padding: 5px 6px !important; color: #000000 !important; }
            th { background-color: #f1f5f9 !important; font-weight: bold !important; text-align: center !important; }
          </style>
        </head>
        <body>
          ${contentHtml}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        printWindow.contentWindow?.focus();
        printWindow.contentWindow?.print();
      } catch (e) {
        console.error('Lỗi in phiếu:', e);
      } finally {
        setTimeout(() => {
          if (document.body.contains(printWindow)) {
            document.body.removeChild(printWindow);
          }
        }, 1500);
      }
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col my-4">
        {/* Header Modal */}
        <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                In Phiếu Chuyển Kho: {transfer.code}
              </h3>
              <p className="text-xs text-slate-500">Mẫu in khổ giấy A4 chuẩn chứng từ kế toán kho vận</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
            >
              <Printer className="w-4 h-4" />
              In phiếu ngay
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Vùng xem trước bản in (Paper Preview) */}
        <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
          <div ref={printContentRef}>
            <StockTransferPrintDoc transfer={transfer} />
          </div>
        </div>

        {/* Footer Modal */}
        <div className="p-3.5 px-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
          <p>Mẹo: Bạn có thể chọn máy in hoặc lưu dưới dạng file PDF (Save as PDF) trong hộp thoại in.</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Printer className="w-4 h-4" />
              In phiếu ngay
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
