import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RotateCcw,
  Search,
  Filter,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  FileCheck2,
  Package,
  FileText,
  DollarSign,
  ArrowRight,
  Warehouse,
  ShieldCheck,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { returnService } from '../../services/returnService';
import { creditNoteService } from '../../services/creditNoteService';
import {
  ReturnOrder,
  ReturnStatus,
  ReturnReason,
  ItemCondition,
  ReturnOrderCreateRequest,
} from '../../types/ReturnOrder';

const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DEFECTIVE_PRODUCT: 'Lỗi kỹ thuật / Bao bì',
  DAMAGED_IN_TRANSIT: 'Hỏng vỡ khi vận chuyển',
  WRONG_DELIVERY: 'Giao sai sản phẩm / Quy cách',
  EXPIRY_NEAR: 'Cận date / Hết hạn',
  CUSTOMER_RETURN: 'Thỏa thuận thương mại',
  OTHER: 'Lý do khác',
};

export const ReturnListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [returns, setReturns] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal states
  const [selectedReturn, setSelectedReturn] = useState<ReturnOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false);

  // Form inputs
  const [confirmNotes, setConfirmNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [createInvoiceId, setCreateInvoiceId] = useState('HD-2026-0000001');
  const [createReason, setCreateReason] = useState<ReturnReason>('DEFECTIVE_PRODUCT');
  const [createNotes, setCreateNotes] = useState('');
  const [createItems, setCreateItems] = useState<
    {
      invoice_item_id: number;
      product_name: string;
      sku: string;
      lot_id: number | null;
      lot_number: string;
      quantity: number;
      condition: ItemCondition;
      unit_price: number;
      subtotal: number;
    }[]
  >([
    {
      invoice_item_id: 101,
      product_name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
      sku: 'IP15PM-256-TI',
      lot_id: 10,
      lot_number: 'LOT-2026-IP15P-01',
      quantity: 1,
      condition: 'GOOD',
      unit_price: 26990000,
      subtotal: 26990000,
    },
    {
      invoice_item_id: 102,
      product_name: 'Tai nghe Chống Ồn Sony WH-1000XM5 Đen',
      sku: 'SNY-WH1000XM5',
      lot_id: null,
      lot_number: 'N/A',
      quantity: 1,
      condition: 'DAMAGED',
      unit_price: 7990000,
      subtotal: 7990000,
    },
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await returnService.getReturns();
      setReturns(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách phiếu trả hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered returns
  const filteredReturns = useMemo(() => {
    return returns.filter((item) => {
      const matchSearch =
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.invoice_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.customer_name && item.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.customer_id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [returns, searchQuery, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = returns.length;
    const requested = returns.filter((r) => r.status === 'REQUESTED').length;
    const confirmed = returns.filter((r) => r.status === 'CONFIRMED').length;
    const cancelled = returns.filter((r) => r.status === 'CANCELLED').length;
    const totalValue = returns
      .filter((r) => r.status === 'CONFIRMED')
      .reduce((sum, r) => sum + r.total_returned_value, 0);
    return { total, requested, confirmed, cancelled, totalValue };
  }, [returns]);

  // Handle Confirm Receipt (WH Manager)
  const handleConfirmReceipt = async () => {
    if (!selectedReturn) return;
    try {
      setIsSubmitting(true);
      await returnService.confirmReturn(selectedReturn.id, confirmNotes);
      showToast(`Đã xác nhận nhập kho thành công cho phiếu ${selectedReturn.id}!`, 'success');
      setIsConfirmModalOpen(false);
      setConfirmNotes('');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Cancel Return
  const handleCancelReturn = async () => {
    if (!selectedReturn) return;
    if (!cancelReason.trim()) {
      showToast('Vui lòng nhập lý do hủy phiếu', 'warning');
      return;
    }
    try {
      setIsSubmitting(true);
      await returnService.cancelReturn(selectedReturn.id, cancelReason);
      showToast(`Đã hủy phiếu ${selectedReturn.id}`, 'info');
      setIsCancelModalOpen(false);
      setCancelReason('');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Create Return
  const handleCreateReturn = async () => {
    if (!createInvoiceId.trim()) {
      showToast('Vui lòng nhập mã hóa đơn gốc', 'warning');
      return;
    }
    if (createItems.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 dòng sản phẩm trả', 'warning');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: ReturnOrderCreateRequest = {
        client_request_id: `REQ-RET-${Date.now()}`,
        invoice_id: createInvoiceId,
        return_reason: createReason,
        notes: createNotes || undefined,
        items: createItems.map((item) => ({
          invoice_item_id: item.invoice_item_id,
          lot_id: item.lot_id,
          quantity: item.quantity,
          condition: item.condition,
        })),
      };

      const res = await returnService.createReturnRequest(payload);
      showToast(`Tạo phiếu trả hàng ${res.id} thành công! Trạng thái: Chờ kiểm đếm.`, 'success');
      setIsCreateModalOpen(false);
      setCreateNotes('');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Fast Create Credit Note from Confirmed Return
  const handleFastCreateCreditNote = async () => {
    if (!selectedReturn) return;
    try {
      setIsSubmitting(true);
      const res = await creditNoteService.createCreditNote({
        client_request_id: `REQ-CN-${Date.now()}`,
        return_order_id: selectedReturn.id,
        notes: `Tự động giảm nợ từ phiếu trả hàng ${selectedReturn.id}`,
      });
      showToast(
        `Đã lập thành công chứng từ giảm nợ ${res.id} cho hóa đơn ${res.invoice_id}!`,
        'success'
      );
      setIsCreditNoteModalOpen(false);
      navigate('/credit-notes');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isWarehouseRole =
    role === 'WarehouseManager' || role === 'WH Manager' || role === 'Admin' || role === 'admin';

  return (
    <PageContainer
      title="Phiếu Trả Hàng & Nhập Kho"
      subtitle="Tiếp nhận hàng trả, kiểm đếm phân loại hàng tốt về kho gốc và hàng hỏng vào kho lỗi (WH-99)"
      actions={
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Lập yêu cầu trả hàng
        </Button>
      }
    >
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng phiếu yêu cầu</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chờ kho kiểm đếm</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.requested}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã nhập kho thực tế</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.confirmed}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Giá trị hàng đã nhận</p>
            <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
              {formatCurrency(stats.totalValue)}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã phiếu, mã HĐ, tên đại lý..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'ALL', label: 'Tất cả trạng thái' },
            { id: 'REQUESTED', label: 'Chờ kiểm đếm' },
            { id: 'CONFIRMED', label: 'Đã nhận kho' },
            { id: 'CANCELLED', label: 'Đã hủy' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Table of Returns */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
              <tr>
                <th className="py-3.5 px-4">Mã phiếu trả</th>
                <th className="py-3.5 px-4">Hóa đơn gốc</th>
                <th className="py-3.5 px-4">Đại lý / Khách hàng</th>
                <th className="py-3.5 px-4">Lý do trả</th>
                <th className="py-3.5 px-4 text-right">Tổng tiền hàng</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Thời gian</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Đang tải danh sách phiếu trả hàng...
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Không tìm thấy phiếu trả hàng nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredReturns.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-indigo-600 dark:text-indigo-400">
                      {item.id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {item.invoice_id}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                      {item.customer_name || item.customer_id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                        {RETURN_REASON_LABELS[item.return_reason] || item.return_reason}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(item.total_returned_value)}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.status === 'CONFIRMED' && (
                        <Badge variant="success" dot>
                          Đã nhận kho
                        </Badge>
                      )}
                      {item.status === 'REQUESTED' && (
                        <Badge variant="warning" dot>
                          Chờ kiểm đếm
                        </Badge>
                      )}
                      {item.status === 'CANCELLED' && (
                        <Badge variant="danger" dot>
                          Đã hủy
                        </Badge>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(item.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          title="Xem chi tiết"
                          onClick={() => {
                            setSelectedReturn(item);
                            setIsDetailOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Nút hành động cho Quản lý kho */}
                        {item.status === 'REQUESTED' && (
                          <>
                            <button
                              title="Kiểm đếm & Nhận hàng vào kho"
                              onClick={() => {
                                setSelectedReturn(item);
                                setIsConfirmModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Nhập kho
                            </button>
                            <button
                              title="Hủy yêu cầu"
                              onClick={() => {
                                setSelectedReturn(item);
                                setIsCancelModalOpen(true);
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {/* Nút sinh chứng từ giảm nợ nếu đã nhận kho */}
                        {item.status === 'CONFIRMED' && (
                          <button
                            title="Lập chứng từ giảm nợ"
                            onClick={() => {
                              setSelectedReturn(item);
                              setIsCreditNoteModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            Giảm nợ
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

      {/* ========================================================================= */}
      {/* 4. MODAL CHI TIẾT PHIẾU TRẢ HÀNG                                          */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Chi tiết phiếu trả hàng: ${selectedReturn?.id}`}
        subtitle={`Liên kết hóa đơn gốc: ${selectedReturn?.invoice_id}`}
        maxWidth="2xl"
      >
        {selectedReturn && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl text-xs">
              <div>
                <p className="text-slate-500">Khách hàng:</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {selectedReturn.customer_name || selectedReturn.customer_id}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Trạng thái:</p>
                <div className="mt-0.5">
                  <Badge
                    variant={
                      selectedReturn.status === 'CONFIRMED'
                        ? 'success'
                        : selectedReturn.status === 'REQUESTED'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {selectedReturn.status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-slate-500">Kho xuất gốc:</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  Kho số {selectedReturn.origin_warehouse_id}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tổng giá trị trả:</p>
                <p className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {formatCurrency(selectedReturn.total_returned_value)}
                </p>
              </div>
            </div>

            {selectedReturn.notes && (
              <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Ghi chú yêu cầu:</p>
                  <p>{selectedReturn.notes}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Danh sách sản phẩm hoàn trả ({selectedReturn.items.length})
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Sản phẩm</th>
                      <th className="py-2.5 px-3">Lô hàng</th>
                      <th className="py-2.5 px-3 text-center">Phân loại</th>
                      <th className="py-2.5 px-3 text-right">Số lượng</th>
                      <th className="py-2.5 px-3 text-right">Đơn giá gốc</th>
                      <th className="py-2.5 px-3 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedReturn.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {it.product_name || it.sku}
                          </p>
                          <p className="text-[10px] text-slate-400">SKU: {it.sku}</p>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {it.lot_number || 'Không quản lý lô'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {it.condition === 'GOOD' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                              Hàng tốt $\rightarrow$ Kho gốc
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-semibold">
                              Hàng lỗi $\rightarrow$ Kho 99
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          {it.quantity} {it.unit || 'cái'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {formatCurrency(it.unit_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                          {formatCurrency(it.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 5. MODAL XÁC NHẬN NHẬP KHO THỰC TẾ (WH MANAGER)                          */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Xác nhận kiểm đếm & Nhập kho hàng trả"
        subtitle={`Phiếu trả hàng: ${selectedReturn?.id} - Đại lý: ${selectedReturn?.customer_name}`}
        maxWidth="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsConfirmModalOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmReceipt}
              isLoading={isSubmitting}
              icon={<CheckCircle className="w-4 h-4" />}
            >
              Xác nhận nhập kho
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
            <p className="font-semibold mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Quy tắc nhập kho tự động:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-emerald-800 dark:text-emerald-300">
              <li>Hàng tốt (GOOD) sẽ tự động cộng tồn vào đúng kho gốc #{selectedReturn?.origin_warehouse_id}.</li>
              <li>Hàng hỏng (DAMAGED) sẽ nhập vào Kho hàng lỗi #99 (tuyệt đối không tăng tồn bán khả dụng).</li>
              <li>Ghi nhận thẻ kho biến động loại <code>IN_RETURN</code>.</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú biên bản kiểm đếm của Thủ kho:
            </label>
            <textarea
              rows={3}
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              placeholder="VD: Đã kiểm đếm thực tế đủ thiết bị, nguyên tem bảo hành..."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. MODAL HỦY YÊU CẦU TRẢ HÀNG                                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Hủy yêu cầu trả hàng"
        subtitle={`Phiếu trả: ${selectedReturn?.id}`}
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCancelModalOpen(false)}>
              Quay lại
            </Button>
            <Button
              variant="danger"
              onClick={handleCancelReturn}
              isLoading={isSubmitting}
            >
              Xác nhận hủy
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            Khi hủy yêu cầu, hạn mức hàng được trả trên hóa đơn gốc sẽ được giải phóng hoàn toàn.
          </p>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Lý do hủy yêu cầu (bắt buộc):
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="VD: Đại lý đồng ý giữ lại bán tiếp sau khi chiết khấu thêm..."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. MODAL LẬP YÊU CẦU TRẢ HÀNG MỚI (SALES / CUSTOMER)                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Lập phiếu yêu cầu trả hàng từ đại lý"
        subtitle="Chọn hóa đơn bán hàng gốc, dòng hàng và nhập lý do trả"
        maxWidth="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateReturn}
              isLoading={isSubmitting}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Gửi yêu cầu trả hàng
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Mã hóa đơn gốc:
              </label>
              <input
                type="text"
                value={createInvoiceId}
                onChange={(e) => setCreateInvoiceId(e.target.value)}
                placeholder="VD: HD-2026-0000001"
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Lý do trả hàng:
              </label>
              <select
                value={createReason}
                onChange={(e) => setCreateReason(e.target.value as ReturnReason)}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {Object.entries(RETURN_REASON_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú chi tiết lý do trả:
            </label>
            <input
              type="text"
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
              placeholder="VD: Vỏ hộp móp méo do đè nén trong thùng xe tải..."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Dòng sản phẩm trả lại theo hóa đơn gốc:
            </p>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Sản phẩm</th>
                    <th className="py-2 px-3">Lô hàng</th>
                    <th className="py-2 px-3">Tình trạng</th>
                    <th className="py-2 px-3 text-right">Số lượng</th>
                    <th className="py-2 px-3 text-right">Đơn giá gốc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {createItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3">
                        <p className="font-medium text-slate-900 dark:text-white">{item.product_name}</p>
                        <p className="text-[10px] text-slate-400">SKU: {item.sku}</p>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                        {item.lot_number}
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={item.condition}
                          onChange={(e) => {
                            const val = e.target.value as ItemCondition;
                            setCreateItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, condition: val } : it))
                            );
                          }}
                          className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        >
                          <option value="GOOD">Hàng tốt (Nhập kho gốc)</option>
                          <option value="DAMAGED">Hàng lỗi (Nhập kho 99)</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const q = parseInt(e.target.value) || 1;
                            setCreateItems((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, quantity: q, subtotal: q * 99000 } : it
                              )
                            );
                          }}
                          className="w-16 p-1 text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                        {formatCurrency(item.unit_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. MODAL LẬP CHỨNG TỪ GIẢM NỢ NHANH                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreditNoteModalOpen}
        onClose={() => setIsCreditNoteModalOpen(false)}
        title="Lập chứng từ điều chỉnh giảm nợ"
        subtitle={`Căn cứ phiếu trả: ${selectedReturn?.id} - Hóa đơn gốc: ${selectedReturn?.invoice_id}`}
        maxWidth="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCreditNoteModalOpen(false)}>
              Để sau
            </Button>
            <Button
              variant="primary"
              onClick={handleFastCreateCreditNote}
              isLoading={isSubmitting}
              icon={<FileCheck2 className="w-4 h-4" />}
            >
              Phát hành Credit Note
            </Button>
          </div>
        }
      >
        {selectedReturn && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-indigo-50/70 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-200">
              <p className="font-semibold flex items-center gap-1 mb-1">
                <FileCheck2 className="w-4 h-4 text-indigo-600" />
                Đối trừ công nợ tự động (AC-3):
              </p>
              <p>
                Số tiền giảm nợ: <strong>{formatCurrency(selectedReturn.total_returned_value)}</strong>
              </p>
              <p className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-300">
                Chứng từ Credit Note sẽ tự động trừ thẳng vào nợ còn lại của hóa đơn{' '}
                <code>{selectedReturn.invoice_id}</code> và chuyển trạng thái hóa đơn sang{' '}
                <code>PARTIALLY_PAID</code> hoặc <code>PAID</code>.
              </p>
            </div>

            <p className="text-slate-600 dark:text-slate-400">
              Bạn có chắc chắn muốn phát hành chứng từ giảm trừ công nợ ngay bây giờ không?
            </p>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};
