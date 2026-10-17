import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Plus,
  Eye,
  Printer,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCcw,
  Building,
  User,
  CreditCard,
  Layers,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { invoiceService } from '../../services/invoiceService';
import { paymentService } from '../../services/paymentService';
import { Invoice, InvoiceCreateRequest } from '../../types/Invoice';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency } from '../../utils/formatters';

export const InvoiceListPage: React.FC = () => {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'>('ALL');

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);

  // Quick Pay State
  const [quickPayAmount, setQuickPayAmount] = useState<number>(0);
  const [quickPayMethod, setQuickPayMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'DEBT_OFFSET'>('BANK_TRANSFER');
  const [quickPayNotes, setQuickPayNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Form State
  const [newCustomerName, setNewCustomerName] = useState('Đại lý Nguyễn Thị Thu Hà');
  const [newCustomerId, setNewCustomerId] = useState('CUS-003');
  const [newTaxCode, setNewTaxCode] = useState('0109988776');
  const [newAddress, setNewAddress] = useState('Tòa nhà FPT, Khu Công nghệ cao, TP. Thủ Đức, TP. HCM');
  const [newNotes, setNewNotes] = useState('Lập hóa đơn xuất bán thiết bị điện tử chính hãng cho đại lý');
  const [newProductName, setNewProductName] = useState('MacBook Air 13 inch M3 16GB/512GB Midnight');
  const [newSku, setNewSku] = useState('MBA-M3-16-512');
  const [newQuantity, setNewQuantity] = useState(5);
  const [newUnitPrice, setNewUnitPrice] = useState(32490000);
  const [newVatRate, setNewVatRate] = useState(10); // 10%

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await invoiceService.getInvoices();
      setInvoices(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách hóa đơn', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        inv.id.toLowerCase().includes(q) ||
        (inv.customer_name && inv.customer_name.toLowerCase().includes(q)) ||
        inv.customer_id.toLowerCase().includes(q) ||
        (inv.customer_tax_code && inv.customer_tax_code.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'ALL' || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const totalCount = invoices.length;
    const totalAmount = invoices.reduce((sum, i) => sum + i.total_amount, 0);
    const totalPaid = invoices.reduce((sum, i) => sum + i.paid_amount, 0);
    const totalRemaining = invoices.reduce((sum, i) => sum + i.remaining_amount, 0);
    return { totalCount, totalAmount, totalPaid, totalRemaining };
  }, [invoices]);

  const handleOpenDetail = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsDetailOpen(true);
  };

  const handleOpenPrint = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsPrintOpen(true);
  };

  const handleOpenQuickPay = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setQuickPayAmount(inv.remaining_amount);
    setQuickPayNotes(`Thu tiền thanh toán hóa đơn ${inv.id}`);
    setIsQuickPayOpen(true);
  };

  const handleConfirmQuickPay = async () => {
    if (!selectedInvoice) return;
    if (quickPayAmount <= 0 || quickPayAmount > selectedInvoice.remaining_amount) {
      showToast('Số tiền thu phải lớn hơn 0 và không vượt quá số nợ còn lại', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await paymentService.createPayment({
        customer_id: selectedInvoice.customer_id,
        amount: quickPayAmount,
        payment_method: quickPayMethod,
        notes: quickPayNotes,
        allocations: [
          {
            invoice_id: selectedInvoice.id,
            allocated_amount: quickPayAmount,
          },
        ],
      });

      // Update invoice locally
      const newPaid = selectedInvoice.paid_amount + quickPayAmount;
      const newRem = selectedInvoice.total_amount - newPaid;
      const newStatus = newRem <= 0 ? 'PAID' : 'PARTIALLY_PAID';

      setInvoices((prev) =>
        prev.map((i) =>
          i.id === selectedInvoice.id
            ? { ...i, paid_amount: newPaid, remaining_amount: newRem, status: newStatus }
            : i
        )
      );

      showToast(`Đã ghi nhận thanh toán ${formatCurrency(quickPayAmount)} cho hóa đơn ${selectedInvoice.id}`, 'success');
      setIsQuickPayOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi ghi nhận thanh toán', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateInvoice = async () => {
    try {
      setIsSubmitting(true);
      const subtotal = newQuantity * newUnitPrice;
      const vatAmount = Math.round((subtotal * newVatRate) / 100);
      const total = subtotal + vatAmount;

      const payload: InvoiceCreateRequest = {
        customer_id: newCustomerId,
        customer_name: newCustomerName,
        customer_address: newAddress,
        customer_tax_code: newTaxCode,
        notes: newNotes,
        items: [
          {
            product_id: 'PROD-NEW',
            sku: newSku,
            product_name: newProductName,
            unit: 'Chiếc',
            quantity: newQuantity,
            unit_price: newUnitPrice,
            discount_amount: 0,
            vat_amount: vatAmount,
            subtotal: total,
          },
        ],
      };

      const created = await invoiceService.createInvoice(payload);
      setInvoices((prev) => [created, ...prev]);
      showToast(`Đã phát hành hóa đơn bán hàng ${created.id} thành công!`, 'success');
      setIsCreateOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lập hóa đơn', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Hóa Đơn Bán Hàng"
      subtitle="Quản lý phát hành hóa đơn tài chính VAT từ phiếu xuất kho và theo dõi tiến độ thanh toán nợ"
      breadcrumbs={[
        { label: 'Tài chính - Kế toán', path: '/invoices' },
        { label: 'Hóa đơn bán hàng' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} isLoading={loading}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Làm mới
          </Button>
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Lập Hóa Đơn Mới
          </Button>
        </div>
      }
    >
      {/* 1. THỐNG KÊ DOANH THU & CÔNG NỢ HÓA ĐƠN */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng hóa đơn</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalCount}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng doanh thu</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrency(stats.totalAmount)}</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đã thanh toán</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(stats.totalPaid)}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nợ cần thu</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(stats.totalRemaining)}</p>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-bold">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. BỘ LỌC VÀ TÌM KIẾM */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo số hóa đơn, tên đại lý, mã số thuế..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Trạng thái:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="UNPAID">Chưa thanh toán</option>
            <option value="PARTIALLY_PAID">Thanh toán một phần</option>
            <option value="PAID">Đã thanh toán đủ</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>
      </div>

      {/* 3. BẢNG DANH SÁCH HÓA ĐƠN */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Số Hóa Đơn</th>
                <th className="px-6 py-4">Đại Lý / Khách Hàng</th>
                <th className="px-6 py-4">Ngày Phát Hành & Hạn Trả</th>
                <th className="px-6 py-4 text-right">Tổng Tiền VAT</th>
                <th className="px-6 py-4 text-right">Đã Thu</th>
                <th className="px-6 py-4 text-right">Còn Nợ</th>
                <th className="px-6 py-4 text-center">Trạng Thái</th>
                <th className="px-6 py-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p>Đang tải danh sách hóa đơn...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium text-slate-800">Không tìm thấy hóa đơn nào</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-primary-600 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-primary-500" />
                        {inv.id}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Số dòng: {inv.items.length} mặt hàng</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{inv.customer_name}</div>
                      {inv.customer_tax_code && (
                        <div className="text-xs font-mono text-slate-500 mt-0.5">MST: {inv.customer_tax_code}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800">{new Date(inv.issued_at).toLocaleDateString('vi-VN')}</div>
                      {inv.due_date && (
                        <div className="text-xs text-rose-500 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Hạn: {new Date(inv.due_date).toLocaleDateString('vi-VN')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-emerald-600">
                      {formatCurrency(inv.paid_amount)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-rose-600">
                      {formatCurrency(inv.remaining_amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {inv.status === 'UNPAID' && <Badge variant="warning">Chưa thanh toán</Badge>}
                      {inv.status === 'PARTIALLY_PAID' && <Badge variant="info">Trả một phần</Badge>}
                      {inv.status === 'PAID' && <Badge variant="success">Đã thanh toán đủ</Badge>}
                      {inv.status === 'CANCELLED' && <Badge variant="danger">Đã hủy</Badge>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetail(inv)}
                          title="Xem chi tiết"
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenPrint(inv)}
                          title="In hóa đơn VAT"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {inv.remaining_amount > 0 && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenQuickPay(inv)}
                          >
                            <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                            Thu tiền
                          </Button>
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

      {/* 4. MODAL CHI TIẾT HÓA ĐƠN */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Chi Tiết Hóa Đơn: ${selectedInvoice?.id}`}
        size="lg"
      >
        {selectedInvoice && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Khách Hàng / Đại Lý</p>
                <p className="font-bold text-slate-900 mt-1">{selectedInvoice.customer_name}</p>
                <p className="text-xs text-slate-600 mt-1">MST: {selectedInvoice.customer_tax_code || 'Chưa cung cấp'}</p>
                <p className="text-xs text-slate-600">{selectedInvoice.customer_address || 'Địa chỉ mặc định'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Thông Tin Thanh Toán</p>
                <p className="text-sm mt-1">
                  Tổng tiền: <strong className="text-slate-900">{formatCurrency(selectedInvoice.total_amount)}</strong>
                </p>
                <p className="text-sm">
                  Đã trả: <strong className="text-emerald-600">{formatCurrency(selectedInvoice.paid_amount)}</strong>
                </p>
                <p className="text-sm">
                  Còn nợ: <strong className="text-rose-600">{formatCurrency(selectedInvoice.remaining_amount)}</strong>
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 text-sm mb-3">Danh sách mặt hàng trên hóa đơn:</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3">STT</th>
                      <th className="px-4 py-3">Mặt Hàng</th>
                      <th className="px-4 py-3 text-center">ĐVT</th>
                      <th className="px-4 py-3 text-center">Số Lượng</th>
                      <th className="px-4 py-3 text-right">Đơn Giá</th>
                      <th className="px-4 py-3 text-right">Thuế VAT</th>
                      <th className="px-4 py-3 text-right">Thành Tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedInvoice.items.map((it, idx) => (
                      <tr key={it.id}>
                        <td className="px-4 py-2.5 font-medium">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{it.product_name}</div>
                          <div className="font-mono text-slate-500 text-[10px]">SKU: {it.sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center">{it.unit}</td>
                        <td className="px-4 py-2.5 text-center font-bold">{it.quantity}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(it.unit_price)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(it.vat_amount)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 5. MODAL XEM & IN HÓA ĐƠN VAT */}
      <Modal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        title="Bản Xem Trước Hóa Đơn Điện Tử VAT"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsPrintOpen(false)}>
              Đóng
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              In Bản Giấy (PDF)
            </Button>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="p-6 bg-white border border-slate-300 rounded-lg shadow-inner font-sans text-slate-800 space-y-6">
            {/* Header hóa đơn */}
            <div className="border-b-2 border-slate-800 pb-4 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-950">HỆ THỐNG KHO VẬN & PHÂN PHỐI B2B</h2>
                <p className="text-xs text-slate-600 mt-1">Địa chỉ: Tòa nhà Discovery Complex, Cầu Giấy, Hà Nội</p>
                <p className="text-xs text-slate-600">MST: 0102030405 | Hotline: 1900 6868</p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono font-bold">
                  MẪU SỐ: 01GTKT0/001
                </span>
                <p className="text-lg font-black text-primary-700 mt-2">HÓA ĐƠN BÁN HÀNG</p>
                <p className="text-xs font-mono text-slate-600">Số: <strong>{selectedInvoice.id}</strong></p>
                <p className="text-xs text-slate-500">Ngày: {new Date(selectedInvoice.issued_at).toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            {/* Thông tin người mua */}
            <div className="text-xs space-y-1 bg-slate-50 p-3 rounded border border-slate-200">
              <p>Đơn vị mua hàng: <strong className="text-slate-950 text-sm">{selectedInvoice.customer_name}</strong></p>
              <p>Mã số thuế: <strong className="font-mono">{selectedInvoice.customer_tax_code || 'Không có'}</strong></p>
              <p>Địa chỉ: {selectedInvoice.customer_address || 'Địa chỉ đăng ký doanh nghiệp'}</p>
              <p>Hình thức thanh toán: <strong>Chuyển khoản / Tiền mặt</strong></p>
            </div>

            {/* Bảng hàng hóa */}
            <table className="w-full text-xs border-collapse border border-slate-300">
              <thead className="bg-slate-200 text-slate-900 font-bold">
                <tr>
                  <th className="border border-slate-300 px-3 py-2 text-center w-12">STT</th>
                  <th className="border border-slate-300 px-3 py-2 text-left">Tên Hàng Hóa, Dịch Vụ</th>
                  <th className="border border-slate-300 px-3 py-2 text-center w-16">ĐVT</th>
                  <th className="border border-slate-300 px-3 py-2 text-center w-20">Số Lượng</th>
                  <th className="border border-slate-300 px-3 py-2 text-right w-24">Đơn Giá</th>
                  <th className="border border-slate-300 px-3 py-2 text-right w-28">Thành Tiền</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="border border-slate-300 px-3 py-2 text-center">{idx + 1}</td>
                    <td className="border border-slate-300 px-3 py-2 font-medium">
                      {it.product_name}
                      <span className="block text-[10px] text-slate-500 font-mono">Mã SKU: {it.sku}</span>
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">{it.unit}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-bold">{it.quantity}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(it.unit_price)}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-bold">{formatCurrency(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tổng cộng */}
            <div className="flex justify-end text-xs space-y-1">
              <div className="w-64 space-y-1.5 border-t border-slate-300 pt-2">
                <div className="flex justify-between">
                  <span>Cộng tiền hàng:</span>
                  <span className="font-semibold">{formatCurrency(selectedInvoice.subtotal_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tiền thuế GTGT (VAT):</span>
                  <span className="font-semibold">{formatCurrency(selectedInvoice.vat_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-950 border-t border-slate-300 pt-1">
                  <span>Tổng tiền thanh toán:</span>
                  <span className="text-primary-700">{formatCurrency(selectedInvoice.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Ký tên */}
            <div className="grid grid-cols-2 pt-8 text-center text-xs">
              <div>
                <p className="font-bold">NGƯỜI MUA HÀNG</p>
                <p className="text-slate-400 italic text-[11px] mt-1">(Ký, ghi rõ họ tên)</p>
              </div>
              <div>
                <p className="font-bold">NGƯỜI BÁN HÀNG</p>
                <p className="text-slate-400 italic text-[11px] mt-1">(Ký số điện tử an toàn)</p>
                <div className="mt-8 text-emerald-600 font-semibold border border-dashed border-emerald-400 p-2 inline-block rounded">
                  ✓ ĐÃ KÝ ĐIỆN TỬ BỞI CÔNG TY PHÂN PHỐI
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 6. MODAL THU TIỀN NHANH */}
      <Modal
        isOpen={isQuickPayOpen}
        onClose={() => setIsQuickPayOpen(false)}
        title="Lập Phiếu Thu Tiền Cho Hóa Đơn"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsQuickPayOpen(false)}>
              Hủy bỏ
            </Button>
            <Button variant="primary" onClick={handleConfirmQuickPay} isLoading={isSubmitting}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Xác Nhận Thu Tiền
            </Button>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
              <p className="font-semibold">Hóa đơn: {selectedInvoice.id}</p>
              <p className="text-xs text-blue-700 mt-1">Đại lý: {selectedInvoice.customer_name}</p>
              <p className="text-xs text-rose-600 font-bold mt-1">
                Số nợ hiện tại: {formatCurrency(selectedInvoice.remaining_amount)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Số tiền thu (VNĐ) *
              </label>
              <CurrencyInput
                value={quickPayAmount}
                onChange={(val) => setQuickPayAmount(val)}
                suffix="VNĐ"
                placeholder="VD: 10.000.000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Hình thức thanh toán *
              </label>
              <select
                value={quickPayMethod}
                onChange={(e) => setQuickPayMethod(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="BANK_TRANSFER">Chuyển khoản ngân hàng (Ủy nhiệm chi)</option>
                <option value="CASH">Tiền mặt tại quỹ</option>
                <option value="DEBT_OFFSET">Bù trừ công nợ đại lý</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Ghi chú phiếu thu
              </label>
              <textarea
                rows={2}
                value={quickPayNotes}
                onChange={(e) => setQuickPayNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Nhập ghi chú hoặc mã giao dịch ngân hàng..."
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 7. MODAL LẬP HÓA ĐƠN MỚI */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Lập Hóa Đơn Bán Hàng Mới"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreateInvoice} isLoading={isSubmitting}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Phát Hành Hóa Đơn
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Tên Khách Hàng / Đại Lý *
              </label>
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Mã Số Thuế (MST)
              </label>
              <input
                type="text"
                value={newTaxCode}
                onChange={(e) => setNewTaxCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Địa Chỉ Giao Hóa Đơn
            </label>
            <input
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <p className="text-xs font-bold text-slate-800 uppercase">Thông tin mặt hàng xuất bán:</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-600 mb-1">Tên sản phẩm *</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Mã SKU</label>
                <input
                  type="text"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Số lượng *</label>
                <input
                  type="number"
                  min={1}
                  value={newQuantity === 0 ? '' : newQuantity}
                  placeholder="1"
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewQuantity(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                  }}
                  onBlur={() => {
                    if (!newQuantity || newQuantity < 1) setNewQuantity(1);
                  }}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Đơn giá (VNĐ) *</label>
                <CurrencyInput
                  value={newUnitPrice}
                  onChange={(val) => setNewUnitPrice(val)}
                  placeholder="VD: 32.490.000"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Thuế suất VAT (%)</label>
                <select
                  value={newVatRate}
                  onChange={(e) => setNewVatRate(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
                >
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={8}>8%</option>
                  <option value={10}>10%</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
              <span className="text-slate-600">Tổng thanh toán dự kiến:</span>
              <strong className="text-base text-primary-600">
                {formatCurrency(newQuantity * newUnitPrice * (1 + newVatRate / 100))}
              </strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Ghi Chú Hóa Đơn
            </label>
            <textarea
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
