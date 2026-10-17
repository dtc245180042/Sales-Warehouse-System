import React from 'react';
import {
  FileText,
  Download,
  Printer,
  Copy,
  CheckCircle2,
  Clock,
  Building,
  User,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  Code2,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { DebtInvoice } from '../../types/DebtInvoice';
import { formatCurrency } from '../../utils/formatters';
import { debtInvoiceService } from '../../services/debtInvoiceService';
import { useToast } from '../../contexts/ToastContext';
import { Link } from 'react-router-dom';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: DebtInvoice | null;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const { showToast } = useToast();

  if (!invoice) return null;

  const handleDownloadPdf = () => {
    debtInvoiceService.downloadInvoicePdf(invoice);
    showToast(`Đã tải lại hoá đơn điện tử ${invoice.invoiceNumber} thành công!`, 'success');
  };

  const handleDownloadXml = () => {
    debtInvoiceService.downloadInvoiceXml(invoice);
    showToast(`Đã tải tệp XML hoá đơn gốc ${invoice.invoiceNumber} thành công!`, 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  const statusConfig = {
    paid: { label: 'Đã thanh toán', variant: 'success' },
    unpaid: { label: 'Chưa thanh toán (Công nợ)', variant: 'warning' },
    partially_paid: { label: 'Thanh toán một phần', variant: 'info' },
    overdue: { label: `Quá hạn ${invoice.overdueDays || 0} ngày`, variant: 'danger' },
  }[invoice.status];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Hóa Đơn Điện Tử Đã Phát Hành: ${invoice.invoiceSeries} - Số ${invoice.invoiceNumber}`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Thanh công cụ thao tác nhanh */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig.variant as any} size="md">
              {statusConfig.label}
            </Badge>
            <span className="text-xs text-slate-500 font-mono">
              Mã đơn: {invoice.orderCode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadXml}
              leftIcon={<Code2 className="w-3.5 h-3.5 text-indigo-500" />}
            >
              Tải XML
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadPdf}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Tải lại hoá đơn
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              In
            </Button>
          </div>
        </div>

        {/* MẪU HÓA ĐƠN ĐIỆN TỬ CHUẨN */}
        <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 font-sans">
          {/* Header hoá đơn */}
          <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam
            </div>
            <div className="text-[10px] text-slate-400 mb-2">Độc lập - Tự do - Hạnh phúc</div>
            <h2 className="text-xl sm:text-2xl font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-tight">
              HÓA ĐƠN GIÁ TRỊ GIA TĂNG
            </h2>
            <div className="text-xs text-slate-500 mt-1">
              (Hóa đơn điện tử theo Thông tư 78/2021/TT-BTC)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
              <span>Mẫu số: {invoice.templateCode}</span>
              <span>•</span>
              <span>Ký hiệu: {invoice.invoiceSeries}</span>
              <span>•</span>
              <span className="text-indigo-600 dark:text-indigo-400">
                Số: {invoice.invoiceNumber}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              Ngày phát hành: {invoice.issueDate}
            </p>
          </div>

          {/* Thông tin 2 bên (Bên bán & Đại lý) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 dark:text-slate-300">
            {/* Bên bán */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Đơn Vị Phát Hành (Bên Bán)
              </span>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {invoice.sellerName}
              </p>
              <p>Mã số thuế: <strong className="text-slate-800 dark:text-slate-200 font-mono">{invoice.sellerTaxCode}</strong></p>
              <p>Địa chỉ: {invoice.sellerAddress}</p>
              <p>Tài khoản: {invoice.sellerBankAccount} - {invoice.sellerBankName}</p>
            </div>

            {/* Đại lý mua hàng */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Khách Hàng / Đại Lý (Bên Mua)
              </span>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {invoice.agentName}
              </p>
              <p>Mã số thuế: <strong className="text-slate-800 dark:text-slate-200 font-mono">{invoice.agentTaxCode || '—'}</strong></p>
              <p>Địa chỉ: {invoice.agentAddress || '—'}</p>
              <p>Mã đơn hàng liên kết:{' '}
                <Link
                  to={`/orders/${invoice.orderId}`}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  {invoice.orderCode}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </p>
            </div>
          </div>

          {/* Bảng danh sách hàng hóa dịch vụ */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold bg-slate-50 dark:bg-slate-800/60">
                  <th className="py-2.5 px-3 text-center w-10">STT</th>
                  <th className="py-2.5 px-3">Tên hàng hóa, dịch vụ</th>
                  <th className="py-2.5 px-3 text-center w-16">ĐVT</th>
                  <th className="py-2.5 px-3 text-center w-20">Số lượng</th>
                  <th className="py-2.5 px-3 text-right w-28">Đơn giá</th>
                  <th className="py-2.5 px-3 text-center w-16">Thuế %</th>
                  <th className="py-2.5 px-3 text-right w-32">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoice.items.map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td className="py-3 px-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900 dark:text-white">{it.name}</p>
                      <span className="text-[10px] text-slate-400 font-mono">SKU: {it.sku}</span>
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500">{it.unit}</td>
                    <td className="py-3 px-3 text-center font-bold">{it.quantity}</td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                      {formatCurrency(it.unitPrice)}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500">{it.vatRate}%</td>
                    <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                      {formatCurrency(it.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tổng tiền & Công nợ */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="w-full sm:max-w-xs space-y-2">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">
                Thông tin thanh toán công nợ:
              </span>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-[11px] space-y-1">
                <p>Hạn thanh toán: <strong className="text-slate-900 dark:text-white font-mono">{invoice.dueDate}</strong></p>
                <p>Nội dung CK: <strong className="text-indigo-600 font-mono">THANHTOAN {invoice.invoiceNumber}</strong></p>
              </div>
            </div>

            <div className="w-full sm:w-80 space-y-2">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Cộng tiền hàng (chưa thuế):</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(invoice.subtotalAmount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tiền thuế GTGT ({invoice.vatRateAverage}%):</span>
                <span>+{formatCurrency(invoice.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                <span>TỔNG CỘNG THANH TOÁN:</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(invoice.grandTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 pt-1">
                <span>Số tiền đã thanh toán:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(invoice.paidAmount)}
                </span>
              </div>
              <div className="flex justify-between text-xs font-bold pt-1 text-rose-600 dark:text-rose-400">
                <span>Dư nợ công nợ còn lại:</span>
                <span className="text-sm font-black">
                  {formatCurrency(invoice.remainingDebt)}
                </span>
              </div>
            </div>
          </div>

          {/* Chữ ký số điện tử */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
              <span>Hóa đơn điện tử có giá trị pháp lý theo Nghị định 123/2020/NĐ-CP</span>
            </div>

            <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-center text-[11px] font-sans">
              <div className="font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                <span>ĐÃ KÝ ĐIỆN TỬ HỢP LỆ</span>
              </div>
              <p className="mt-0.5">{invoice.digitalSignature.signer}</p>
              <p className="text-[10px] text-slate-400 font-mono">{invoice.digitalSignature.signedAt}</p>
            </div>
          </div>
        </div>

        {/* Footer nút đóng */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-400">
            Hỗ trợ hóa đơn: 1900 6868 (Phòng Tài chính - Kế toán)
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
};
