import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import {
  FileText,
  Download,
  Eye,
  Search,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ExternalLink,
  Code2,
  CreditCard,
  Building,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { InvoiceDetailModal } from '../../components/debts/InvoiceDetailModal';
import { AgentDebtSummaryHeader } from '../../components/debts/AgentDebtSummaryHeader';
import { debtInvoiceService } from '../../services/debtInvoiceService';
import { agentService } from '../../services/agentService';
import { DebtInvoice, DebtStatus } from '../../types/DebtInvoice';
import { Agent } from '../../types/Agent';
import { formatCurrency } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { useToast } from '../../contexts/ToastContext';

// Mức hạn mức công nợ mặc định theo phân hạng nếu chưa cài đặt riêng
const DEFAULT_LIMIT_BY_GROUP: Record<string, number> = {
  platinum: 500000000,
  gold: 300000000,
  silver: 150000000,
  standard: 50000000,
};

export const AgentDebtManagementPage: React.FC = () => {
  const { id: routeAgentId } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('q') || '';
  const urlStatus = (searchParams.get('status') as DebtStatus | 'all') || 'all';
  const urlAgent = routeAgentId || searchParams.get('agentId') || 'all';

  const [invoices, setInvoices] = useState<DebtInvoice[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<DebtStatus | 'all'>(urlStatus);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(urlAgent);
  const [selectedInvoice, setSelectedInvoice] = useState<DebtInvoice | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invoiceList, agentList] = await Promise.all([
        debtInvoiceService.getAll(),
        agentService.getAll(),
      ]);
      setInvoices(invoiceList);
      setAgents(agentList);

      // Nếu urlAgent là all hoặc chưa chọn, ưu tiên chọn đại lý Thành Long (AGT-002) hoặc đại lý đầu tiên để hiển thị tổng hợp công nợ
      if (selectedAgentId === 'all' && agentList.length > 0) {
        const defaultAgent = agentList.find((a) => a.id === 'AGT-002') || agentList[0];
        setSelectedAgentId(defaultAgent.id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Cập nhật khi route thay đổi
  useEffect(() => {
    if (routeAgentId) {
      setSelectedAgentId(routeAgentId);
    }
  }, [routeAgentId]);

  // Đại lý đang được chọn để xem tổng hợp công nợ
  const currentAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId) || agents[0] || null;
  }, [agents, selectedAgentId]);

  // Hoá đơn của đại lý hiện tại
  const currentAgentInvoices = useMemo(() => {
    if (!currentAgent) return [];
    return invoices.filter((inv) => inv.agentId === currentAgent.id);
  }, [invoices, currentAgent]);

  // Danh sách hoá đơn sau khi lọc
  const filteredInvoices = useMemo(() => {
    let list = currentAgentInvoices;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.orderCode.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      list = list.filter((inv) => inv.status === statusFilter);
    }

    return list;
  }, [currentAgentInvoices, search, statusFilter]);

  // Thống kê công nợ đại lý hiện tại (SCRUM-757)
  const agentDebtSummary = useMemo(() => {
    if (!currentAgent) {
      return { totalDebt: 0, creditLimit: 0, inDue: 0, overdue: 0, overdueCount: 0 };
    }

    const totalDebt = currentAgentInvoices.reduce((sum, inv) => sum + inv.remainingDebt, 0);
    const creditLimit = currentAgent.creditLimit || DEFAULT_LIMIT_BY_GROUP[currentAgent.customerGroup] || 300000000;
    const overdueInvoices = currentAgentInvoices.filter((inv) => inv.status === 'overdue');
    const overdue = overdueInvoices.reduce((sum, inv) => sum + inv.remainingDebt, 0);
    const inDue = totalDebt - overdue;

    return {
      totalDebt,
      creditLimit,
      inDue,
      overdue,
      overdueCount: overdueInvoices.length,
    };
  }, [currentAgent, currentAgentInvoices]);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    const params = new URLSearchParams(searchParams);
    params.set('agentId', agentId);
    setSearchParams(params, { replace: true });
  };

  const handleOpenDetail = (inv: DebtInvoice) => {
    setSelectedInvoice(inv);
    setIsDetailModalOpen(true);
  };

  const handleDownloadInvoice = (inv: DebtInvoice) => {
    debtInvoiceService.downloadInvoicePdf(inv);
    showToast(`Đã tải lại hoá đơn số ${inv.invoiceNumber} thành công!`, 'success');
  };

  const handleDownloadXml = (inv: DebtInvoice) => {
    debtInvoiceService.downloadInvoiceXml(inv);
    showToast(`Đã tải tệp XML hoá đơn gốc số ${inv.invoiceNumber}!`, 'success');
  };

  const handleExportCSV = () => {
    if (!currentAgent) return;
    exportToCSV({
      filename: `cong_no_hoa_don_${currentAgent.code}_${Date.now()}`,
      headers: [
        'Số hoá đơn',
        'Ký hiệu',
        'Mã đơn hàng',
        'Ngày phát hành',
        'Hạn thanh toán',
        'Tổng tiền hoá đơn',
        'Đã thanh toán',
        'Còn nợ',
        'Trạng thái',
      ],
      rows: filteredInvoices.map((i) => [
        i.invoiceNumber,
        i.invoiceSeries,
        i.orderCode,
        i.issueDate,
        i.dueDate,
        i.grandTotal,
        i.paidAmount,
        i.remainingDebt,
        i.status,
      ]),
    });
    showToast(`Đã xuất ${filteredInvoices.length} hoá đơn công nợ sang Excel/CSV!`, 'success');
  };

  const getStatusBadge = (inv: DebtInvoice) => {
    switch (inv.status) {
      case 'paid':
        return <Badge variant="success" size="sm">Đã thanh toán</Badge>;
      case 'partially_paid':
        return <Badge variant="info" size="sm">Trả một phần</Badge>;
      case 'overdue':
        return <Badge variant="danger" size="sm">Quá hạn ({inv.overdueDays || 0} ngày)</Badge>;
      case 'unpaid':
      default:
        return <Badge variant="warning" size="sm">Còn nợ trong hạn</Badge>;
    }
  };

  return (
    <PageContainer
      title="Xem Công Nợ & Hoá Đơn Đại Lý"
      subtitle="Theo dõi tổng còn nợ, hạn mức còn lại và danh sách hoá đơn đã phát hành (SCRUM-757 / SCRUM-268)"
      actions={
        <div className="flex items-center gap-2">
          <Link to="/agents">
            <Button variant="secondary" size="sm">
              Danh sách đại lý
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {/* 1. KHU VỰC ĐẦU MÀN HÌNH: TỔNG HỢP CÔNG NỢ, TỔNG CÒN NỢ & HẠN MỨC CÒN LẠI (SCRUM-757) */}
      {currentAgent && (
        <AgentDebtSummaryHeader
          agent={currentAgent}
          totalRemainingDebt={agentDebtSummary.totalDebt}
          creditLimit={agentDebtSummary.creditLimit}
          overdueDebt={agentDebtSummary.overdue}
          inDueDebt={agentDebtSummary.inDue}
          overdueCount={agentDebtSummary.overdueCount}
          availableAgents={agents}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {/* 2. THANH TÌM KIẾM & LỌC DANH SÁCH HOÁ ĐƠN */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo số hoá đơn, mã đơn hàng..."
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
            >
              <option value="all">Tất cả trạng thái nợ</option>
              <option value="unpaid">Còn nợ trong hạn</option>
              <option value="partially_paid">Thanh toán một phần</option>
              <option value="overdue">Quá hạn thanh toán</option>
              <option value="paid">Đã thanh toán đủ</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. BẢNG DANH SÁCH HOÁ ĐƠN, SỐ TIỀN, HẠN THANH TOÁN, TRẠNG THÁI (SCRUM-757) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              Danh Sách Hoá Đơn Công Nợ Của Đại Lý
            </h3>
            <span className="text-xs text-slate-400">
              Có {filteredInvoices.length} hoá đơn phát hành cho {currentAgent?.name}
            </span>
          </div>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            SCRUM-757: Chi Tiết Hoá Đơn & Hạn Thanh Toán
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/40">
                <th className="py-3.5 px-4">Số Hoá Đơn</th>
                <th className="py-3.5 px-4">Mã Đơn Hàng</th>
                <th className="py-3.5 px-4 text-center">Ngày Phát Hành</th>
                <th className="py-3.5 px-4 text-right">Số Tiền Hoá Đơn</th>
                <th className="py-3.5 px-4 text-right">Đã Thanh Toán</th>
                <th className="py-3.5 px-4 text-right">Số Tiền Còn Nợ</th>
                <th className="py-3.5 px-4 text-center">Hạn Thanh Toán</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Không tìm thấy hoá đơn nào của đại lý theo điều kiện lọc.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Số hoá đơn */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-mono font-bold text-slate-900 dark:text-white block">
                            {inv.invoiceNumber}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Ký hiệu: {inv.invoiceSeries}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Mã đơn hàng liên kết */}
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/orders/${inv.orderId}`}
                        className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                      >
                        {inv.orderCode}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>

                    {/* Ngày phát hành */}
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-500">
                      {inv.issueDate}
                    </td>

                    {/* Số tiền hoá đơn */}
                    <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">
                      {formatCurrency(inv.grandTotal)}
                    </td>

                    {/* Đã thanh toán */}
                    <td className="py-3.5 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(inv.paidAmount)}
                    </td>

                    {/* Số tiền còn nợ */}
                    <td className="py-3.5 px-4 text-right font-black">
                      <span
                        className={
                          inv.remainingDebt > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                        }
                      >
                        {formatCurrency(inv.remainingDebt)}
                      </span>
                    </td>

                    {/* Hạn thanh toán (SCRUM-757) */}
                    <td className="py-3.5 px-4 text-center font-mono text-xs">
                      <span
                        className={
                          inv.status === 'overdue'
                            ? 'font-bold text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {inv.dueDate}
                      </span>
                    </td>

                    {/* Trạng thái */}
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(inv)}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(inv)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Xem chi tiết hoá đơn VAT"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoice(inv)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                          title="Tải lại hoá đơn PDF/HTML"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadXml(inv)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
                          title="Tải XML hoá đơn gốc"
                        >
                          <Code2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Xem chi tiết hoá đơn */}
      <InvoiceDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        invoice={selectedInvoice}
      />
    </PageContainer>
  );
};
