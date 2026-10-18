import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  Eye,
  DollarSign,
  CheckCircle,
  Building,
  User,
  RotateCcw,
  Calendar,
  Layers,
  ArrowRight,
  Printer,
  Receipt,
  ChevronDown,
  Check,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { PaymentPrintModal } from '../../components/payments/PaymentPrintModal';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { paymentService } from '../../services/paymentService';
import { invoiceService } from '../../services/invoiceService';
import { customerService } from '../../services/customerService';
import { Payment, PaymentCreateRequest } from '../../types/Payment';
import { Invoice } from '../../types/Invoice';
import { Customer } from '../../types/Customer';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency } from '../../utils/formatters';
import { initialCustomers } from '../../mock/customers';

export const PaymentListPage: React.FC = () => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(() => customerService.getCached());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'BANK_TRANSFER' | 'CASH' | 'DEBT_OFFSET'>('ALL');

  // Modals
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printPaymentId, setPrintPaymentId] = useState<string | null>(null);

  const handleOpenPrint = (pId: string) => {
    setPrintPaymentId(pId);
    setIsPrintOpen(true);
  };

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('CUS-001');
  const [selectedCustomerName, setSelectedCustomerName] = useState('Đại lý Dương Quang Trung');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState<number>(50000000);
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'DEBT_OFFSET'>('BANK_TRANSFER');
  const [refCode, setRefCode] = useState('VCB-987654');
  const [notes, setNotes] = useState('Thu nợ tiền mua thiết bị điện tử đợt 2 theo hợp đồng');

  const loadData = async () => {
    try {
      setLoading(true);
      const [payList, invList, custList] = await Promise.all([
        paymentService.getPayments(),
        invoiceService.getInvoices(),
        customerService.getAll().catch(() => []),
      ]);
      setPayments(payList);
      setInvoices(invList);
      if (Array.isArray(custList) && custList.length > 0) {
        setCustomers(custList);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách phiếu thu', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableAgents = useMemo(() => {
    const source = customers.length > 0 ? customers : initialCustomers;
    return source.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code || c.id,
      phone: c.phone,
    }));
  }, [customers]);

  const filteredAgents = useMemo(() => {
    if (!customerSearch.trim()) return availableAgents;
    const q = customerSearch.toLowerCase().trim();
    return availableAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.phone && a.phone.includes(q))
    );
  }, [availableAgents, customerSearch]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        p.id.toLowerCase().includes(q) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
        p.customer_id.toLowerCase().includes(q) ||
        (p.reference_code && p.reference_code.toLowerCase().includes(q));

      const matchMethod = methodFilter === 'ALL' || p.payment_method === methodFilter;
      return matchSearch && matchMethod;
    });
  }, [payments, searchQuery, methodFilter]);

  const stats = useMemo(() => {
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
    const bankTotal = payments
      .filter((p) => p.payment_method === 'BANK_TRANSFER')
      .reduce((sum, p) => sum + p.amount, 0);
    const cashTotal = payments
      .filter((p) => p.payment_method === 'CASH')
      .reduce((sum, p) => sum + p.amount, 0);
    const offsetTotal = payments
      .filter((p) => p.payment_method === 'DEBT_OFFSET')
      .reduce((sum, p) => sum + p.amount, 0);
    return { totalCollected, bankTotal, cashTotal, offsetTotal };
  }, [payments]);

  // Pending invoices for selected customer in Create Form
  const customerUnpaidInvoices = useMemo(() => {
    return invoices.filter(
      (inv) => inv.customer_id === selectedCustomerId && inv.remaining_amount > 0
    );
  }, [invoices, selectedCustomerId]);

  const handleOpenDetail = (p: Payment) => {
    setSelectedPayment(p);
    setIsDetailOpen(true);
  };

  const handleCreatePayment = async () => {
    if (amount <= 0) {
      showToast('Số tiền thu phải lớn hơn 0', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      // Auto-allocate FIFO to customer's open invoices
      let remainingToAllocate = amount;
      const allocations: { invoice_id: string; allocated_amount: number }[] = [];

      for (const inv of customerUnpaidInvoices) {
        if (remainingToAllocate <= 0) break;
        const alloc = Math.min(remainingToAllocate, inv.remaining_amount);
        allocations.push({
          invoice_id: inv.id,
          allocated_amount: alloc,
        });
        remainingToAllocate -= alloc;
      }

      const payload: PaymentCreateRequest = {
        customer_id: selectedCustomerId,
        amount,
        payment_method: paymentMethod,
        reference_code: refCode,
        notes,
        allocations,
      };

      const created = await paymentService.createPayment(payload);
      setPayments((prev) => [created, ...prev]);

      // Refresh invoice debt locally
      await loadData();

      showToast(`Đã lập phiếu thu ${created.id} thành công!`, 'success');
      setIsCreateOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi lập phiếu thu', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Phiếu Thu & Đối Trừ Công Nợ"
      subtitle="Quản lý các đợt thanh toán từ đại lý và phân bổ gạch nợ tự động theo từng hóa đơn bán hàng"
      breadcrumbs={[
        { label: 'Tài chính - Kế toán', path: '/payments' },
        { label: 'Phiếu thu & Đối trừ' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} isLoading={loading}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Làm mới
          </Button>
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Lập Phiếu Thu Tiền
          </Button>
        </div>
      }
    >
      {/* 1. THỐNG KÊ DOANH THU THU TIỀN */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng tiền đã thu</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(stats.totalCollected)}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chuyển khoản (Bank)</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(stats.bankTotal)}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tiền mặt tại quỹ</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(stats.cashTotal)}</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bù trừ công nợ</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(stats.offsetTotal)}</p>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. THANH TÌM KIẾM VÀ BỘ LỌC */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã phiếu thu, tên khách hàng, mã giao dịch tham chiếu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Hình thức:</span>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="ALL">Tất cả hình thức</option>
            <option value="BANK_TRANSFER">Chuyển khoản</option>
            <option value="CASH">Tiền mặt</option>
            <option value="DEBT_OFFSET">Bù trừ công nợ</option>
          </select>
        </div>
      </div>

      {/* 3. BẢNG PHIẾU THU */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Mã Phiếu Thu</th>
                <th className="px-6 py-4">Đại Lý Nộp Tiền</th>
                <th className="px-6 py-4">Ngày Thu Tiền</th>
                <th className="px-6 py-4 text-center">Hình Thức</th>
                <th className="px-6 py-4 text-right">Số Tiền Thu</th>
                <th className="px-6 py-4">Người Thu / Giao Dịch</th>
                <th className="px-6 py-4 text-center">Phân Bổ Hóa Đơn</th>
                <th className="px-6 py-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p>Đang tải danh sách phiếu thu...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium text-slate-800">Không có phiếu thu nào</p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-primary-600 flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-primary-500" />
                        {p.id}
                      </div>
                      {p.reference_code && (
                        <div className="text-xs font-mono text-slate-400 mt-0.5">Số GD: {p.reference_code}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{p.customer_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{p.customer_id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800">{new Date(p.payment_date).toLocaleDateString('vi-VN')}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {new Date(p.payment_date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {p.payment_method === 'BANK_TRANSFER' && <Badge variant="info">Chuyển khoản</Badge>}
                      {p.payment_method === 'CASH' && <Badge variant="warning">Tiền mặt</Badge>}
                      {p.payment_method === 'DEBT_OFFSET' && <Badge variant="neutral">Bù trừ nợ</Badge>}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600 text-base">
                      +{formatCurrency(p.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800 font-medium">{p.collector_name || 'Kế toán viên'}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{p.notes || 'Không có ghi chú'}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {p.allocations.length} hóa đơn
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => handleOpenDetail(p)}>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Chi tiết
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleOpenPrint(p.id)}
                          className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                        >
                          <Printer className="w-3.5 h-3.5 mr-1" />
                          In phiếu
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL CHI TIẾT PHIẾU THU & PHÂN BỔ CÔNG NỢ */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Chi Tiết Phiếu Thu: ${selectedPayment?.id}`}
        size="md"
      >
        {selectedPayment && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Khách hàng / Đại lý:</span>
                <span className="font-bold text-slate-900">{selectedPayment.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số tiền đã thu:</span>
                <span className="font-bold text-emerald-600 text-base">{formatCurrency(selectedPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hình thức thanh toán:</span>
                <span className="font-semibold text-slate-800">{selectedPayment.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mã giao dịch / UNC:</span>
                <span className="font-mono text-slate-700">{selectedPayment.reference_code || 'Không có'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Người thực hiện thu:</span>
                <span className="text-slate-800">{selectedPayment.collector_name || 'Kế toán viên'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ghi chú:</span>
                <span className="text-slate-700">{selectedPayment.notes || 'Không có'}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 text-sm mb-2">Các hóa đơn được đối trừ:</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Số Hóa Đơn</th>
                      <th className="px-4 py-2.5 text-right">Số Tiền Gạch Nợ</th>
                      <th className="px-4 py-2.5 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedPayment.allocations.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2.5 font-semibold text-primary-600">{a.invoice_id}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                          {formatCurrency(a.allocated_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant="success">Đã đối trừ</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        footer={
          <div className="flex justify-between items-center w-full">
            <Button
              variant="secondary"
              onClick={() => {
                if (selectedPayment) {
                  setIsDetailOpen(false);
                  handleOpenPrint(selectedPayment.id);
                }
              }}
              className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              In Phiếu Thu
            </Button>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Đóng
            </Button>
          </div>
        }
      </Modal>

      {/* MODAL IN PHIẾU THU TIỀN A4/PDF (SCRUM-270 / S7-09) */}
      <PaymentPrintModal
        isOpen={isPrintOpen}
        onClose={() => {
          setIsPrintOpen(false);
          setPrintPaymentId(null);
        }}
        paymentId={printPaymentId}
      />

      {/* 5. MODAL LẬP PHIẾU THU TIỀN MỚI */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Lập Phiếu Thu Tiền & Đối Trừ Nợ"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreatePayment} isLoading={isSubmitting}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Lưu & Gạch Nợ
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div ref={customerDropdownRef} className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Chọn Đại Lý Nộp Tiền *
            </label>
            <button
              type="button"
              onClick={() => setIsCustomerDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-left"
            >
              <div className="flex items-center gap-2 truncate">
                <Building className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="font-medium text-slate-800 truncate">
                  {selectedCustomerName} ({selectedCustomerId})
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isCustomerDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isCustomerDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {/* Ô tìm kiếm trong thẻ */}
                <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Tìm kiếm theo tên hoặc mã đại lý..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Danh sách đại lý */}
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredAgents.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Không tìm thấy đại lý nào phù hợp
                    </div>
                  ) : (
                    filteredAgents.map((agent) => {
                      const isSelected = agent.id === selectedCustomerId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(agent.id);
                            setSelectedCustomerName(agent.name);
                            setIsCustomerDropdownOpen(false);
                            setCustomerSearch('');
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs transition ${
                            isSelected
                              ? 'bg-primary-50 text-primary-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div>
                            <p className="font-medium text-slate-900">{agent.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {agent.id} {agent.phone ? `• ${agent.phone}` : ''}
                            </p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Số tiền thu thực tế (VNĐ) *
            </label>
            <CurrencyInput
              value={amount}
              onChange={(val) => setAmount(val)}
              suffix="VNĐ"
              placeholder="VD: 50.000.000"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Phương thức *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="BANK_TRANSFER">Chuyển khoản</option>
                <option value="CASH">Tiền mặt</option>
                <option value="DEBT_OFFSET">Bù trừ công nợ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Mã giao dịch / UNC
              </label>
              <input
                type="text"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Danh sách hóa đơn mở để xem trước phân bổ */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs font-bold text-slate-700 uppercase mb-2">
              Các hóa đơn đang nợ của đại lý này ({customerUnpaidInvoices.length}):
            </p>
            {customerUnpaidInvoices.length === 0 ? (
              <p className="text-xs text-slate-500">Đại lý hiện không có hóa đơn quá hạn hoặc chưa thanh toán.</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
                {customerUnpaidInvoices.map((inv) => (
                  <div key={inv.id} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200">
                    <span className="font-semibold text-primary-600">{inv.id}</span>
                    <span className="text-slate-500">{new Date(inv.issued_at).toLocaleDateString('vi-VN')}</span>
                    <span className="font-bold text-rose-600">Nợ: {formatCurrency(inv.remaining_amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2 italic">
              * Hệ thống sẽ tự động phân bổ giảm nợ theo nguyên tắc FIFO (hóa đơn cũ gạch nợ trước).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Ghi Chú Phiếu Thu
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
