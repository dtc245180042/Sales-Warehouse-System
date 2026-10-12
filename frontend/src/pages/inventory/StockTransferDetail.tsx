import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Printer,
  Building2,
  Calendar,
  User,
  FileText,
  Boxes,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { QuantityStepper } from '../../components/common/QuantityStepper';
import { stockTransferService } from '../../services/stockTransferService';
import { StockTransfer, StockTransferItem } from '../../types/StockTransfer';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';
import {
  StockTransferPrintModal,
  StockTransferPrintDoc,
} from '../../components/inventory/StockTransferPrintModal';

const QUICK_DISCREPANCY_REASONS = [
  'Hàng bị vỡ / ướt hư hỏng trong lúc xe tải vận chuyển',
  'Nhà xe giao thiếu kiện theo biên bản giao nhận',
  'Kho xuất đóng gói đếm nhầm số lượng thực tế',
  'Hàng lỗi bao bì nhãn mác, lập biên bản gửi trả',
];

export const StockTransferDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [transfer, setTransfer] = useState<StockTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // State cho Modal Nhận Hàng (SCRUM-578)
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveItems, setReceiveItems] = useState<{ product_id: string; received_quantity: number; discrepancy_reason?: string }[]>([]);
  const [generalDiscrepancyReason, setGeneralDiscrepancyReason] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiveNote, setReceiveNote] = useState('');

  // State cho Modal Hủy phiếu
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // State cho Modal In phiếu chuyển kho
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const fetchTransferDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await stockTransferService.getTransferById(id);
      setTransfer(data);
      if (id.startsWith('TRF-') && data.code) {
        navigate(`/inventory/transfers/${data.code}`, { replace: true });
      }
    } catch (err: any) {
      showToast(err.message || 'Không tìm thấy phiếu chuyển kho', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransferDetail();
  }, [id]);

  // Khởi tạo form nhận hàng khi mở modal
  const handleOpenReceiveModal = () => {
    if (!transfer) return;
    setReceiveItems(
      transfer.items.map((i) => ({
        product_id: i.product_id,
        received_quantity: i.transfer_quantity, // Mặc định là nhận đủ
        discrepancy_reason: '',
      }))
    );
    setGeneralDiscrepancyReason('');
    setReceiverName('Thủ kho chi nhánh ' + transfer.destination_warehouse);
    setReceiveNote('');
    setIsReceiveModalOpen(true);
  };

  // Nút nhanh: Nhận đủ toàn bộ
  const handleFillAllReceived = () => {
    if (!transfer) return;
    setReceiveItems(
      transfer.items.map((i) => ({
        product_id: i.product_id,
        received_quantity: i.transfer_quantity,
        discrepancy_reason: '',
      }))
    );
    setGeneralDiscrepancyReason('');
  };

  // Cập nhật số lượng thực nhận từng dòng
  const handleUpdateReceiveQty = (index: number, val: number) => {
    const updated = [...receiveItems];
    updated[index].received_quantity = Math.max(0, val);
    setReceiveItems(updated);
  };

  // Tính chênh lệch real-time trong modal
  const modalDiscrepancies = React.useMemo(() => {
    if (!transfer) return { hasAny: false, details: [] };
    const details = receiveItems.map((r, idx) => {
      const originItem = transfer.items[idx];
      const diff = r.received_quantity - originItem.transfer_quantity;
      return {
        ...r,
        name: originItem.product_name,
        transfer_quantity: originItem.transfer_quantity,
        diff,
      };
    });
    const hasAny = details.some((d) => d.diff !== 0);
    return { hasAny, details };
  }, [receiveItems, transfer]);

  // Kiểm tra tính hợp lệ khi submit nhận hàng (bắt buộc lý do nếu lệch)
  const isReceiveSubmitValid = React.useMemo(() => {
    if (!modalDiscrepancies.hasAny) return true;
    // Nếu có lệch, phải có lý do chung hoặc lý do từng dòng
    return generalDiscrepancyReason.trim().length > 0 || receiveItems.some((r) => (r.discrepancy_reason || '').trim().length > 0);
  }, [modalDiscrepancies, generalDiscrepancyReason, receiveItems]);

  // Xác nhận xuất kho (Ship)
  const handleShipTransfer = async () => {
    if (!transfer) return;
    setActionLoading(true);
    try {
      await stockTransferService.shipTransfer(transfer.id, {
        shipped_by: transfer.created_by || 'Thủ kho xuất',
        note: 'Đã xuất kho bàn giao vận chuyển',
      });
      showToast('Đã xác nhận xuất kho thành công! Hàng đang trên đường vận chuyển.', 'success');
      await fetchTransferDetail();
    } catch (err: any) {
      showToast('Lỗi xuất kho: ' + (err.message || ''), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Xác nhận nhận hàng (Receive)
  const handleConfirmReceive = async () => {
    if (!transfer || !isReceiveSubmitValid) return;
    setActionLoading(true);
    try {
      const formattedItems = receiveItems.map((r) => ({
        product_id: r.product_id,
        received_quantity: r.received_quantity,
        discrepancy_reason: (r.discrepancy_reason || generalDiscrepancyReason.trim()) || undefined,
      }));

      await stockTransferService.receiveTransfer(transfer.id, {
        items: formattedItems,
        discrepancy_reason: generalDiscrepancyReason.trim() || undefined,
        received_by: receiverName.trim() || undefined,
        note: receiveNote.trim() || undefined,
      });
      showToast('Đã xác nhận nhập kho thành công! Tồn kho kho đến đã được cộng và phiếu đã khóa.', 'success');
      setIsReceiveModalOpen(false);
      await fetchTransferDetail();
    } catch (err: any) {
      showToast('Lỗi nhận hàng: ' + (err.message || ''), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Hủy phiếu chuyển kho (Cancel)
  const handleConfirmCancel = async () => {
    if (!transfer) return;
    setActionLoading(true);
    try {
      await stockTransferService.cancelTransfer(transfer.id, {
        cancel_reason: cancelReason.trim() || 'Người dùng hủy phiếu',
      });
      showToast('Đã hủy phiếu chuyển kho thành công.', 'success');
      setIsCancelModalOpen(false);
      await fetchTransferDetail();
    } catch (err: any) {
      showToast('Lỗi hủy phiếu: ' + (err.message || ''), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="Chi tiết phiếu chuyển kho">
        <div className="py-20 text-center text-slate-400">
          <Clock className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
          <p>Đang tải thông tin phiếu chuyển kho...</p>
        </div>
      </PageContainer>
    );
  }

  if (!transfer) {
    return (
      <PageContainer title="Không tìm thấy phiếu">
        <div className="py-16 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Không tìm thấy phiếu chuyển kho</h3>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/inventory/transfers')}>
            Quay lại danh sách
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Phiếu Chuyển Kho"
      subtitle={`Mã phiếu: ${transfer.code} • Lộ trình điều chuyển từ ${transfer.source_warehouse} đến ${transfer.destination_warehouse}`}
      actions={
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => navigate('/inventory/transfers')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Quay lại danh sách
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            className="flex items-center gap-1.5 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-950/40 transition-colors"
          >
            <Printer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            In phiếu
          </Button>

          {/* Nút hành động theo trạng thái */}
          {transfer.status === 'draft' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                disabled={actionLoading}
                className="text-rose-600 hover:bg-rose-50 border-rose-200"
              >
                Hủy phiếu
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleShipTransfer}
                disabled={actionLoading}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
              >
                <Truck className="w-4 h-4" />
                Xác nhận xuất kho
              </Button>
            </>
          )}

          {transfer.status === 'in_transit' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                disabled={actionLoading}
                className="text-rose-600 hover:bg-rose-50 border-rose-200"
              >
                Hủy & Thu hồi hàng về
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleOpenReceiveModal}
                disabled={actionLoading}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 animate-pulse"
              >
                <CheckCircle2 className="w-4 h-4" />
                Xác nhận nhận hàng tại kho đến
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* Banner thông báo trạng thái */}
      {transfer.has_discrepancy && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              Phiếu có chênh lệch số lượng kiểm nhận thực tế
            </h4>
            <p className="text-xs text-amber-800/90 dark:text-amber-300">
              Lý do giải trình: <strong className="font-semibold">{transfer.discrepancy_reason || 'Chưa ghi chú'}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Tiến trình điều chuyển (Timeline Stepper) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6 shadow-sm mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-6">
          Tiến trình thực hiện điều chuyển
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Bước 1: Lập phiếu */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">1. Lập phiếu chuyển kho</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Người lập: {transfer.created_by || 'Thủ kho'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(transfer.created_at)}</p>
            </div>
          </div>

          {/* Bước 2: Xuất kho chuyển đi */}
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                transfer.status === 'in_transit' || transfer.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                  : transfer.status === 'cancelled'
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">2. Xuất kho chuyển đi</p>
              {transfer.shipped_at ? (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Người xuất: {transfer.shipped_by || 'Thủ kho xuất'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(transfer.shipped_at)}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-600">Đã trừ tồn kho đi</span>
                </>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">Chưa xuất kho</p>
              )}
            </div>
          </div>

          {/* Bước 3: Nhập kho đến */}
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                transfer.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                  : transfer.status === 'cancelled'
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">3. Nhập kho đến & Chốt khóa</p>
              {transfer.received_at ? (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Người nhận: {transfer.received_by || 'Thủ kho nhận'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(transfer.received_at)}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-600">Đã cộng tồn kho đến</span>
                </>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">
                  {transfer.status === 'in_transit' ? 'Đang chờ nhận tại kho đến...' : 'Chưa đến giai đoạn nhận'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cột trái: Bảng danh sách mặt hàng */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" />
                Danh sách mặt hàng điều chuyển ({transfer.items.length} món)
              </h3>
            </div>

            <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Sản phẩm</th>
                    <th className="py-3 px-4 text-center">ĐVT</th>
                    <th className="py-3 px-4 text-center">SL Chuyển</th>
                    <th className="py-3 px-4 text-center">Thực nhận</th>
                    <th className="py-3 px-4 text-center">Chênh lệch</th>
                    <th className="py-3 px-4 text-right">Đơn giá vốn</th>
                    <th className="py-3 px-4 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transfer.items.map((item) => {
                    const subtotal = item.transfer_quantity * (item.cost_price || 0);
                    return (
                      <tr key={item.id || item.product_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{item.product_name}</p>
                          <p className="text-xs font-mono text-slate-400">SKU: {item.sku || 'N/A'}</p>
                          {item.discrepancy_reason && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 italic">
                              Lý do: {item.discrepancy_reason}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center text-xs font-medium text-slate-500">
                          {item.unit}
                        </td>

                        <td className="py-3 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                          {formatNumber(item.transfer_quantity)}
                        </td>

                        <td className="py-3 px-4 text-center font-bold">
                          {item.received_quantity !== null && item.received_quantity !== undefined ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {formatNumber(item.received_quantity)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Chưa nhận</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center font-bold">
                          {item.discrepancy_quantity !== 0 && item.discrepancy_quantity !== undefined ? (
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                item.discrepancy_quantity < 0
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              }`}
                            >
                              {item.discrepancy_quantity > 0 ? '+' : ''}
                              {item.discrepancy_quantity}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">0</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                          {formatCurrency(item.cost_price || 0)}
                        </td>

                        <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-800 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={2} className="py-3 px-4 text-center text-xs uppercase tracking-wider">
                      Tổng cộng
                    </td>
                    <td className="py-3 px-4 text-center">
                      {formatNumber(transfer.total_items)}
                    </td>
                    <td className="py-3 px-4 text-center text-emerald-600 dark:text-emerald-400">
                      {transfer.status === 'completed' ? formatNumber(transfer.total_received_items) : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {transfer.status === 'completed' && transfer.has_discrepancy
                        ? `${(transfer.total_received_items - transfer.total_items) > 0 ? '+' : ''}${transfer.total_received_items - transfer.total_items}`
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-400">
                      Tổng giá trị
                    </td>
                    <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400 font-mono">
                      {formatCurrency(
                        transfer.items.reduce(
                          (sum, itm) => sum + itm.transfer_quantity * (itm.cost_price || 0),
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Cột phải: Thông tin chi tiết */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-100 dark:border-slate-800">
              Thông tin phiếu
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Mã phiếu:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{transfer.code}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Kho xuất (Đi):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{transfer.source_warehouse}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Kho nhập (Đến):</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{transfer.destination_warehouse}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tổng SL gửi:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{formatNumber(transfer.total_items)} món</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tổng SL thực nhận:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatNumber(transfer.total_received_items)} món
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Tổng giá trị vốn:</span>
                <span className="font-mono font-bold text-base text-blue-600 dark:text-blue-400">
                  {formatCurrency(
                    transfer.items.reduce(
                      (sum, itm) => sum + itm.transfer_quantity * (itm.cost_price || 0),
                      0
                    )
                  )}
                </span>
              </div>

              {transfer.note && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block mb-1">Ghi chú phiếu:</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg">
                    {transfer.note}
                  </p>
                </div>
              )}

              {transfer.cancel_reason && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-rose-500 block mb-1 font-semibold">Lý do hủy:</span>
                  <p className="text-xs text-rose-700 dark:text-rose-400 italic bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg">
                    {transfer.cancel_reason}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL XÁC NHẬN NHẬN HÀNG VÀ XỬ LÝ CHÊNH LỆCH (SCRUM-578 & SCRUM-573)       */}
      {/* ========================================================================= */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Xác nhận nhận hàng tại {transfer.destination_warehouse}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kiểm đếm số lượng thực tế nhận được và nhập lý do nếu có chênh lệch
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleFillAllReceived}
                className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                Nhận đủ toàn bộ
              </Button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* Bảng nhập số lượng thực nhận */}
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Sản phẩm</th>
                      <th className="py-2.5 px-3 text-center">SL Gửi</th>
                      <th className="py-2.5 px-3 text-center w-36">Thực nhận</th>
                      <th className="py-2.5 px-3 text-center">Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transfer.items.map((itm, idx) => {
                      const rItem = receiveItems[idx] || { received_quantity: itm.transfer_quantity };
                      const diff = rItem.received_quantity - itm.transfer_quantity;
                      return (
                        <tr key={itm.product_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{itm.product_name}</p>
                            <p className="text-xs text-slate-400 font-mono">{itm.sku}</p>
                          </td>

                          <td className="py-2.5 px-3 text-center font-bold text-slate-800 dark:text-slate-200">
                            {itm.transfer_quantity} {itm.unit}
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <QuantityStepper
                              value={rItem.received_quantity}
                              min={0}
                              size="sm"
                              onChange={(val) => handleUpdateReceiveQty(idx, val)}
                            />
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            {diff !== 0 ? (
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded ${
                                  diff < 0
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                }`}
                              >
                                {diff > 0 ? '+' : ''}
                                {diff}
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-600 font-semibold">Đủ</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Vùng bắt buộc nhập lý do nếu phát hiện chênh lệch (SCRUM-578 & SCRUM-573) */}
              {modalDiscrepancies.hasAny && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold">
                      Phát hiện chênh lệch số lượng! Bắt buộc phải nhập lý do giải trình
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Lý do chênh lệch <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={generalDiscrepancyReason}
                      onChange={(e) => setGeneralDiscrepancyReason(e.target.value)}
                      placeholder="Nhập lý do chi tiết (ví dụ: vỡ hỏng trong lúc xe vận chuyển, giao thiếu kiện...)"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUICK_DISCREPANCY_REASONS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setGeneralDiscrepancyReason(preset)}
                        className="text-[11px] px-2 py-1 rounded bg-white hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-amber-200 dark:border-amber-800/50 transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Thông tin người nhận và ghi chú */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Người xác nhận nhận hàng
                  </label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Ghi chú biên bản nhận
                  </label>
                  <input
                    type="text"
                    value={receiveNote}
                    onChange={(e) => setReceiveNote(e.target.value)}
                    placeholder="Tình trạng thùng hàng, niêm phong..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" size="md" onClick={() => setIsReceiveModalOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!isReceiveSubmitValid || actionLoading}
                onClick={handleConfirmReceive}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Xác nhận nhập kho & Chốt khóa
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Hủy phiếu */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-bold text-rose-600 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Xác nhận hủy phiếu chuyển kho
            </h3>
            <p className="text-xs text-slate-500">
              {transfer.status === 'in_transit'
                ? 'Phiếu đang vận chuyển. Khi hủy, hệ thống sẽ tự động hoàn trả lại tồn kho cho kho xuất và giảm số lượng in-transit tại kho nhập.'
                : 'Phiếu bản nháp sẽ được chuyển sang trạng thái đã hủy.'}
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Lý do hủy <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy phiếu..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsCancelModalOpen(false)}>
                Hủy bỏ
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!cancelReason.trim() || actionLoading}
                onClick={handleConfirmCancel}
              >
                Xác nhận hủy
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Vùng in ngầm sẵn sàng cho lệnh in trực tiếp từ trình duyệt (Ctrl+P) */}
      <div id="printable-transfer" className="hidden print:block">
        <StockTransferPrintDoc transfer={transfer} />
      </div>

      {/* Modal In phiếu chuyển kho (Mẫu 03-XKNB Bộ Tài chính) */}
      <StockTransferPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        transfer={transfer}
      />
    </PageContainer>
  );
};
