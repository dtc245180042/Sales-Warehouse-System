import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Printer,
  Send,
  Eye,
  X,
  Building2,
  Check,
  FileCheck,
  Calendar,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  DebtReconciliation,
  ReconciliationStatus,
  ReconciliationOrderItem,
} from '../../types/DebtReconciliation';
import { initialDebtReconciliations } from '../../mock/reconciliations';
import { initialCustomers } from '../../mock/customers';
import { formatCurrency } from '../../utils/formatters';
import '../../styles/reconciliation-print.css';

// -------------------------------------------------------------
// Sub-components declared OUTSIDE main component (AGENTS.md rule)
// -------------------------------------------------------------

interface ReconciliationStatusBadgeProps {
  status: ReconciliationStatus;
}

const ReconciliationStatusBadge: React.FC<ReconciliationStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'draft':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          <Clock className="w-3 h-3" />
          Bản nháp
        </span>
      );
    case 'sent':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
          <Send className="w-3 h-3" />
          Đã gửi cho đại lý
        </span>
      );
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Đại lý đã xác nhận
        </span>
      );
    case 'disputed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Phản hồi lệch
        </span>
      );
    case 'resolved':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
          <FileCheck className="w-3 h-3" />
          Đã giải quyết lệch
        </span>
      );
    default:
      return null;
  }
};

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<DebtReconciliation>) => void;
}

const CreateReconciliationModal: React.FC<CreateModalProps> = ({ open, onClose, onSubmit }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomers[0]?.id || '');
  const [periodMonth, setPeriodMonth] = useState('10');
  const [periodYear, setPeriodYear] = useState('2026');
  const [openingBalance, setOpeningBalance] = useState<number>(10000000);
  const [sampleOrdersCount, setSampleOrdersCount] = useState<number>(2);

  if (!open) return null;

  const currentCustomer = initialCustomers.find((c) => c.id === selectedCustomerId) || initialCustomers[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Generate sample order items for the period
    const orders: ReconciliationOrderItem[] = [];
    let totalOrderAmount = 0;
    let totalPaidAmount = 0;

    for (let i = 1; i <= sampleOrdersCount; i++) {
      const amount = (i * 12000000);
      const paid = i === 1 ? amount : Math.floor(amount * 0.6);
      const debt = amount - paid;
      totalOrderAmount += amount;
      totalPaidAmount += paid;

      orders.push({
        orderId: `ORD-GEN-${i}`,
        orderCode: `DH-2026${periodMonth.padStart(2, '0')}${String(i * 5).padStart(2, '0')}-0${i}`,
        orderDate: `2026-${periodMonth.padStart(2, '0')}-${String(i * 5).padStart(2, '0')}`,
        amount,
        paidAmount: paid,
        debtAmount: debt,
      });
    }

    const closingBalance = openingBalance + totalOrderAmount - totalPaidAmount;
    const period = `Tháng ${periodMonth}/${periodYear}`;

    onSubmit({
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      customerPhone: currentCustomer.phone,
      customerAddress: currentCustomer.address,
      period,
      periodFrom: `${periodYear}-${periodMonth.padStart(2, '0')}-01`,
      periodTo: `${periodYear}-${periodMonth.padStart(2, '0')}-30`,
      openingBalance,
      totalOrderAmount,
      totalPaidAmount,
      closingBalance,
      orders,
      status: 'draft',
      createdBy: 'Ngô Kế Toán (Accountant)',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary-600" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Lập Biên Bản Đối Chiếu Công Nợ Mới
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chọn Khách hàng / Đại lý đối chiếu <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              {initialCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kỳ đối chiếu (Tháng)
              </label>
              <select
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Năm đối chiếu
              </label>
              <select
                value={periodYear}
                onChange={(e) => setPeriodYear(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Dư nợ đầu kỳ (VNĐ) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              step={100000}
              value={openingBalance}
              onChange={(e) => setOpeningBalance(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white font-mono font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Số đơn hàng phát sinh trong kỳ (tự động tổng hợp)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={sampleOrdersCount}
              onChange={(e) => setSampleOrdersCount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Thông tin đại lý đối chiếu:
            </span>
            <div className="text-slate-500">{currentCustomer.name} - {currentCustomer.phone}</div>
            <div className="text-slate-500">{currentCustomer.address}</div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Tạo bản nháp
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PreviewModalProps {
  open: boolean;
  item?: DebtReconciliation;
  onClose: () => void;
  onPrint: () => void;
  onSend: (id: string) => void;
  onResolveDispute?: (id: string, note: string) => void;
}

const ReconciliationPreviewModal: React.FC<PreviewModalProps> = ({
  open,
  item,
  onClose,
  onPrint,
  onSend,
  onResolveDispute,
}) => {
  const [resolveNote, setResolveNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top actions */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between no-print bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Biên Bản Đối Chiếu: {item.code}
            </h3>
            <ReconciliationStatusBadge status={item.status} />
          </div>

          <div className="flex items-center gap-2">
            {/* Print / Export PDF button */}
            <button
              type="button"
              onClick={onPrint}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Xuất PDF / In
            </button>

            {/* Send to agent button if draft */}
            {item.status === 'draft' && (
              <button
                type="button"
                onClick={() => onSend(item.id)}
                className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Gửi cho đại lý
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Area (also used for print) */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" id="reconciliation-print-area">
          {/* Dispute Warning Box if disputed */}
          {item.status === 'disputed' && (
            <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 no-print space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                ĐẠI LÝ PHẢN HỒI LỆCH SỐ LIỆU CÔNG NỢ
              </div>
              <div className="text-xs space-y-1">
                <div>
                  <strong>Số dư nợ theo Đại lý:</strong>{' '}
                  <span className="font-mono font-bold text-rose-700 dark:text-rose-300">
                    {formatCurrency(item.agentDisputedAmount || 0)}
                  </span>{' '}
                  (Chênh lệch:{' '}
                  {formatCurrency((item.agentDisputedAmount || 0) - item.closingBalance)})
                </div>
                <div>
                  <strong>Lý do phản hồi:</strong> {item.agentNote}
                </div>
              </div>

              {onResolveDispute && (
                <div className="pt-2 border-t border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    placeholder="Nhập nội dung xử lý/điều chỉnh chênh lệch..."
                    className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!resolveNote.trim()) {
                        alert('Vui lòng nhập phương án xử lý lệch');
                        return;
                      }
                      onResolveDispute(item.id, resolveNote.trim());
                      setResolveNote('');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shrink-0 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Đã giải quyết lệch
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Resolved Note Box */}
          {item.status === 'resolved' && item.resolvedNote && (
            <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 text-xs no-print">
              <strong>Đã giải quyết bởi {item.resolvedBy}:</strong> {item.resolvedNote}
            </div>
          )}

          {/* Document Header */}
          <div className="text-center space-y-1 border-b border-slate-200 dark:border-slate-800 pb-5">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight uppercase text-slate-900 dark:text-white">
              BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              Mã biên bản: <strong>{item.code}</strong> &bull; Kỳ đối chiếu: <strong>{item.period}</strong>
            </p>
            <p className="text-xs text-slate-400 italic">
              (Từ ngày {item.periodFrom} đến ngày {item.periodTo})
            </p>
          </div>

          {/* Two parties information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1.5 border border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider block text-xs">
                BÊN A (BÊN BÁN): CÔNG TY CỔ PHẦN PHÂN PHỐI OMS PRO
              </span>
              <div>Địa chỉ: Tòa nhà OMS Pro, KCN Tân Bình, Tây Thạnh, Tân Phú, TP. HCM</div>
              <div>Điện thoại: 1900 6868 - Email: ketoan@omspro.vn</div>
              <div>Đại diện: Ban Kế toán Tài chính</div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1.5 border border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider block text-xs">
                BÊN B (ĐẠI LÝ): {item.customerName}
              </span>
              <div>Địa chỉ: {item.customerAddress}</div>
              <div>Điện thoại liên hệ: {item.customerPhone}</div>
              <div>Mã khách hàng: {item.customerId}</div>
            </div>
          </div>

          {/* Summary Balance Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              I. BẢNG TỔNG HỢP SỐ LIỆU CÔNG NỢ
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <span className="text-[11px] text-slate-400 block">1. Dư nợ đầu kỳ:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                  {formatCurrency(item.openingBalance)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <span className="text-[11px] text-slate-400 block">2. Phát sinh mua trong kỳ:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                  +{formatCurrency(item.totalOrderAmount)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <span className="text-[11px] text-slate-400 block">3. Đã thanh toán trong kỳ:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  -{formatCurrency(item.totalPaidAmount)}
                </span>
              </div>
              <div className="p-3 rounded-xl border-2 border-primary-500/60 bg-primary-50/30 dark:bg-primary-950/30">
                <span className="text-[11px] text-primary-700 dark:text-primary-300 font-bold block">
                  4. Dư nợ cuối kỳ:
                </span>
                <span className="font-mono font-extrabold text-primary-700 dark:text-primary-300 text-base">
                  {formatCurrency(item.closingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Order Details Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              II. CHI TIẾT CÁC ĐƠN HÀNG PHÁT SINH TRONG KỲ
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">STT</th>
                    <th className="py-2.5 px-3">Mã đơn hàng</th>
                    <th className="py-2.5 px-3">Ngày lập đơn</th>
                    <th className="py-2.5 px-3 text-right">Tổng tiền hàng</th>
                    <th className="py-2.5 px-3 text-right">Đã thanh toán</th>
                    <th className="py-2.5 px-3 text-right">Còn nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {item.orders.map((o, idx) => (
                    <tr key={o.orderId}>
                      <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white font-mono">
                        {o.orderCode}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{o.orderDate}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatCurrency(o.amount)}</td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-600">
                        {formatCurrency(o.paidAmount)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(o.debtAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
            <div className="space-y-16">
              <div>
                <p className="font-bold text-slate-900 dark:text-white uppercase">ĐẠI DIỆN BÊN A</p>
                <p className="text-slate-400 italic">(Ký, ghi rõ họ tên và đóng dấu)</p>
              </div>
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {item.createdBy}
              </div>
            </div>

            <div className="space-y-16">
              <div>
                <p className="font-bold text-slate-900 dark:text-white uppercase">ĐẠI DIỆN BÊN B (ĐẠI LÝ)</p>
                <p className="text-slate-400 italic">(Ký, ghi rõ họ tên và đóng dấu)</p>
              </div>
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {item.agentRespondedAt ? (
                  <span className="text-emerald-600">Đã xác nhận điện tử ({item.agentRespondedAt.slice(0, 10)})</span>
                ) : (
                  <span className="text-slate-400 italic">[Chờ đại lý ký duyệt]</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end no-print">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Main DebtReconciliationPage Component (SCRUM-747 + 749)
// -------------------------------------------------------------

export const DebtReconciliationPage: React.FC = () => {
  const [reconciliations, setReconciliations] = useState<DebtReconciliation[]>(initialDebtReconciliations);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<DebtReconciliation | null>(null);

  // Counts
  const stats = useMemo(() => {
    return {
      total: reconciliations.length,
      draft: reconciliations.filter((r) => r.status === 'draft').length,
      sent: reconciliations.filter((r) => r.status === 'sent').length,
      confirmed: reconciliations.filter((r) => r.status === 'confirmed').length,
      disputed: reconciliations.filter((r) => r.status === 'disputed').length,
      resolved: reconciliations.filter((r) => r.status === 'resolved').length,
    };
  }, [reconciliations]);

  // Filtered
  const filteredList = useMemo(() => {
    return reconciliations.filter((r) => {
      const matchSearch =
        r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerPhone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.period.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' || r.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [reconciliations, searchTerm, statusFilter]);

  // Handler: Create new
  const handleCreate = (newData: Partial<DebtReconciliation>) => {
    const code = `BB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${(
      reconciliations.length + 1
    )
      .toString()
      .padStart(3, '0')}`;

    const newRec: DebtReconciliation = {
      id: `REC-${Date.now()}`,
      code,
      customerId: newData.customerId || '',
      customerName: newData.customerName || '',
      customerPhone: newData.customerPhone || '',
      customerAddress: newData.customerAddress || '',
      period: newData.period || 'Tháng 10/2026',
      periodFrom: newData.periodFrom || '2026-10-01',
      periodTo: newData.periodTo || '2026-10-31',
      openingBalance: newData.openingBalance || 0,
      totalOrderAmount: newData.totalOrderAmount || 0,
      totalPaidAmount: newData.totalPaidAmount || 0,
      closingBalance: newData.closingBalance || 0,
      orders: newData.orders || [],
      status: 'draft',
      createdBy: newData.createdBy || 'Kế toán viên',
      createdAt: new Date().toISOString(),
    };

    setReconciliations([newRec, ...reconciliations]);
  };

  // Handler: Send to agent (SCRUM-749)
  const handleSendToAgent = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn gửi biên bản đối chiếu này cho đại lý?')) {
      const now = new Date().toISOString();
      setReconciliations((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: 'sent',
                sentAt: now,
                sentBy: 'Ngô Kế Toán (Accountant)',
              }
            : r
        )
      );

      // Update previewItem if currently opened
      if (previewItem && previewItem.id === id) {
        setPreviewItem({
          ...previewItem,
          status: 'sent',
          sentAt: now,
          sentBy: 'Ngô Kế Toán (Accountant)',
        });
      }

      alert('Đã gửi biên bản đối chiếu công nợ thành công cho đại lý qua cổng Portal!');
    }
  };

  // Handler: Print / Export PDF (SCRUM-749)
  const handlePrint = (item: DebtReconciliation) => {
    setPreviewItem(item);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  // Handler: Resolve dispute
  const handleResolveDispute = (id: string, note: string) => {
    const now = new Date().toISOString();
    setReconciliations((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'resolved',
              resolvedBy: 'Nguyễn Văn Giám Đốc (Director)',
              resolvedAt: now,
              resolvedNote: note,
            }
            : r
      )
    );

    if (previewItem && previewItem.id === id) {
      setPreviewItem({
        ...previewItem,
        status: 'resolved',
        resolvedBy: 'Nguyễn Văn Giám Đốc (Director)',
        resolvedAt: now,
        resolvedNote: note,
      });
    }

    alert('Đã cập nhật giải quyết phản hồi lệch biên bản công nợ!');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-primary-600" />
            Biên Bản Đối Chiếu Công Nợ Đại Lý
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Lập, xem trước, xuất PDF in ấn và gửi biên bản đối chiếu số dư công nợ định kỳ cho đại lý
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-sm transition-all shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Lập biên bản mới
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-xs text-slate-400 block">Tổng biên bản</span>
          <span className="text-xl font-bold text-slate-900 dark:text-white block mt-1">
            {stats.total}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-xs text-slate-400 block">Bản nháp (draft)</span>
          <span className="text-xl font-bold text-slate-600 dark:text-slate-300 block mt-1">
            {stats.draft}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-xs text-slate-400 block">Đang chờ đại lý duyệt</span>
          <span className="text-xl font-bold text-amber-600 block mt-1">
            {stats.sent}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-xs text-slate-400 block">Đại lý đã xác nhận</span>
          <span className="text-xl font-bold text-emerald-600 block mt-1">
            {stats.confirmed}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3.5 shadow-sm bg-rose-50/30">
          <span className="text-xs text-rose-700 dark:text-rose-400 font-semibold block">
            Phản hồi lệch số liệu
          </span>
          <span className="text-xl font-bold text-rose-600 block mt-1">
            {stats.disputed}
          </span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã biên bản, tên đại lý, số điện thoại, kỳ..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="draft">Bản nháp</option>
              <option value="sent">Đã gửi cho đại lý</option>
              <option value="confirmed">Đại lý đã xác nhận</option>
              <option value="disputed">Phản hồi lệch</option>
              <option value="resolved">Đã giải quyết</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Mã biên bản</th>
                <th className="py-3 px-4">Đại lý đối chiếu</th>
                <th className="py-3 px-4">Kỳ đối chiếu</th>
                <th className="py-3 px-4 text-right">Dư đầu kỳ</th>
                <th className="py-3 px-4 text-right">Phát sinh nợ</th>
                <th className="py-3 px-4 text-right">Đã thanh toán</th>
                <th className="py-3 px-4 text-right">Dư cuối kỳ</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Không tìm thấy biên bản đối chiếu nào
                  </td>
                </tr>
              ) : (
                filteredList.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white text-xs">
                      {r.code}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {r.customerName}
                      </span>
                      <span className="text-xs text-slate-500">{r.customerPhone}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium">
                      {r.period}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs">
                      {formatCurrency(r.openingBalance)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-blue-600">
                      {formatCurrency(r.totalOrderAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-emerald-600">
                      {formatCurrency(r.totalPaidAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(r.closingBalance)}
                    </td>
                    <td className="py-3.5 px-4">
                      <ReconciliationStatusBadge status={r.status} />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* View Preview */}
                        <button
                          type="button"
                          onClick={() => setPreviewItem(r)}
                          className="p-1.5 text-slate-600 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Xem trước biên bản"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Print / Export PDF */}
                        <button
                          type="button"
                          onClick={() => handlePrint(r)}
                          className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Xuất PDF / In ấn"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Send button if draft */}
                        {r.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleSendToAgent(r.id)}
                            className="p-1.5 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 rounded-lg transition-colors"
                            title="Gửi cho đại lý"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create */}
      <CreateReconciliationModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
      />

      {/* Modal Preview & Print */}
      <ReconciliationPreviewModal
        open={!!previewItem}
        item={previewItem || undefined}
        onClose={() => setPreviewItem(null)}
        onPrint={() => previewItem && handlePrint(previewItem)}
        onSend={handleSendToAgent}
        onResolveDispute={handleResolveDispute}
      />
    </div>
  );
};
