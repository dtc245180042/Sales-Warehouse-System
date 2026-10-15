import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Plus,
  Eye,
  FileCheck2,
  DollarSign,
  Calendar,
  Building,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  Layers,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { creditNoteService } from '../../services/creditNoteService';
import { returnService } from '../../services/returnService';
import { CreditNote, CreditNoteCreateRequest } from '../../types/CreditNote';
import { ReturnOrder } from '../../types/ReturnOrder';

export const CreditNoteListPage: React.FC = () => {
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [confirmedReturns, setConfirmedReturns] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedNote, setSelectedNote] = useState<CreditNote | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [selectedReturnId, setSelectedReturnId] = useState('');
  const [createNotes, setCreateNotes] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [cnData, retData] = await Promise.all([
        creditNoteService.getCreditNotes(),
        returnService.getReturns({ status: 'CONFIRMED' }),
      ]);
      setCreditNotes(cnData);
      setConfirmedReturns(retData);
      if (retData.length > 0) {
        setSelectedReturnId(retData[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách chứng từ giảm nợ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered
  const filteredNotes = useMemo(() => {
    return creditNotes.filter((item) => {
      const q = searchQuery.toLowerCase();
      return (
        item.id.toLowerCase().includes(q) ||
        item.invoice_id.toLowerCase().includes(q) ||
        item.return_order_id.toLowerCase().includes(q) ||
        (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
        item.customer_id.toLowerCase().includes(q)
      );
    });
  }, [creditNotes, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = creditNotes.length;
    const totalAdjusted = creditNotes.reduce((sum, n) => sum + n.adjustment_amount, 0);
    const uniqueInvoices = new Set(creditNotes.map((n) => n.invoice_id)).size;
    return { total, totalAdjusted, uniqueInvoices };
  }, [creditNotes]);

  // Selected return order in modal for preview
  const previewReturn = useMemo(() => {
    return confirmedReturns.find((r) => r.id === selectedReturnId);
  }, [confirmedReturns, selectedReturnId]);

  // Handle Create Credit Note
  const handleCreate = async () => {
    if (!selectedReturnId) {
      showToast('Vui lòng chọn phiếu trả hàng đã xác nhận', 'warning');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: CreditNoteCreateRequest = {
        client_request_id: `REQ-CN-${Date.now()}`,
        return_order_id: selectedReturnId,
        notes: createNotes || undefined,
      };

      const res = await creditNoteService.createCreditNote(payload);
      showToast(
        `Phát hành thành công chứng từ giảm nợ ${res.id}! Hóa đơn ${res.invoice_id} đã được khấu trừ nợ.`,
        'success'
      );
      setIsCreateOpen(false);
      setCreateNotes('');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAccountantOrAdmin =
    role === 'Accountant' || role === 'Admin' || role === 'admin' || role === 'Manager';

  return (
    <PageContainer
      title="Chứng Từ Giảm Nợ Khi Trả Hàng (Story S8-02)"
      subtitle="Quản lý và phát hành chứng từ Credit Note điều chỉnh giảm trừ công nợ theo giá bán gốc của hóa đơn"
      actions={
        isAccountantOrAdmin && (
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateOpen(true)}
          >
            Lập chứng từ giảm nợ
          </Button>
        )
      }
    >
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng chứng từ đã lập
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng công nợ đã giảm trừ
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {formatCurrency(stats.totalAdjusted)}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Hóa đơn được khấu trừ
            </p>
            <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
              {stats.uniqueInvoices}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã chứng từ CN, mã phiếu trả, mã HĐ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 3. Table of Credit Notes */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
              <tr>
                <th className="py-3.5 px-4">Số chứng từ (Credit Note)</th>
                <th className="py-3.5 px-4">Phiếu trả hàng gốc</th>
                <th className="py-3.5 px-4">Hóa đơn gốc</th>
                <th className="py-3.5 px-4">Đại lý / Khách hàng</th>
                <th className="py-3.5 px-4 text-right">Số tiền giảm trừ</th>
                <th className="py-3.5 px-4">Ngày phát hành</th>
                <th className="py-3.5 px-4">Người lập</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Đang tải danh sách chứng từ giảm nợ...
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Không tìm thấy chứng từ giảm nợ nào
                  </td>
                </tr>
              ) : (
                filteredNotes.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                      {item.id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                      {item.return_order_id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {item.invoice_id}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                      {item.customer_name || item.customer_id}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                      -{formatCurrency(item.adjustment_amount)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(item.adjustment_date).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {item.created_by_name || `Kế toán #${item.created_by}`}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        title="Xem đối chiếu dòng hàng"
                        onClick={() => {
                          setSelectedNote(item);
                          setIsDetailOpen(true);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Đối chiếu
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL CHI TIẾT ĐỐI CHIẾU DÒNG HÀNG (SCRUM-785)                         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Chứng từ giảm nợ: ${selectedNote?.id}`}
        subtitle={`Đối chiếu với Hóa đơn: ${selectedNote?.invoice_id} & Phiếu trả: ${selectedNote?.return_order_id}`}
        maxWidth="2xl"
      >
        {selectedNote && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl">
              <div>
                <p className="text-slate-500">Đại lý thụ hưởng:</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {selectedNote.customer_name || selectedNote.customer_id}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Ngày lập chứng từ:</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {new Date(selectedNote.adjustment_date).toLocaleString('vi-VN')}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Kế toán phê duyệt:</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {selectedNote.created_by_name || `#${selectedNote.created_by}`}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tổng giảm trừ nợ:</p>
                <p className="font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                  -{formatCurrency(selectedNote.adjustment_amount)}
                </p>
              </div>
            </div>

            {selectedNote.notes && (
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Ghi chú kế toán: </span>
                <span className="text-slate-800 dark:text-slate-200">{selectedNote.notes}</span>
              </div>
            )}

            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider text-[11px]">
                Chi tiết dòng sản phẩm giảm trừ theo giá bán gốc ({selectedNote.items.length})
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Sản phẩm</th>
                      <th className="py-2.5 px-3 text-right">Số lượng</th>
                      <th className="py-2.5 px-3 text-right">Đơn giá gốc</th>
                      <th className="py-2.5 px-3 text-right">Chiết khấu phân bổ</th>
                      <th className="py-2.5 px-3 text-right">VAT phân bổ</th>
                      <th className="py-2.5 px-3 text-right">Thành tiền giảm trừ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedNote.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {it.product_name || it.sku}
                          </p>
                          <p className="text-[10px] text-slate-400">SKU: {it.sku}</p>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          {it.quantity} {it.unit || 'cái'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                          {formatCurrency(it.unit_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          -{formatCurrency(it.discount_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          +{formatCurrency(it.vat_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                          -{formatCurrency(it.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>
                Chứng từ kế toán bất biến: Nghiệp vụ đã đối trừ nợ trực tiếp vào hóa đơn gốc và khóa sửa/xóa (HTTP 405).
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 5. MODAL LẬP CHỨNG TỪ GIẢM NỢ TỪ PHIẾU TRẢ HÀNG (SCRUM-786)               */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Phát hành chứng từ điều chỉnh giảm công nợ"
        subtitle="Chọn phiếu trả hàng đã được Quản lý kho xác nhận (CONFIRMED)"
        maxWidth="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isSubmitting}
              icon={<FileCheck2 className="w-4 h-4" />}
            >
              Xác nhận giảm trừ công nợ
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Chọn phiếu trả hàng căn cứ:
            </label>
            <select
              value={selectedReturnId}
              onChange={(e) => setSelectedReturnId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
            >
              {confirmedReturns.length === 0 ? (
                <option value="">Không có phiếu trả hàng nào đã CONFIRMED</option>
              ) : (
                confirmedReturns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} - Đại lý: {r.customer_name || r.customer_id} (HĐ: {r.invoice_id} | Hoàn:{' '}
                    {formatCurrency(r.total_returned_value)})
                  </option>
                ))
              )}
            </select>
          </div>

          {previewReturn && (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Thông tin đối chiếu trước khi lập giảm nợ (AC-1, AC-2):
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Hóa đơn gốc: </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {previewReturn.invoice_id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Số tiền giảm trừ: </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    -{formatCurrency(previewReturn.total_returned_value)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Kho hàng xuất gốc: </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Kho #{previewReturn.origin_warehouse_id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Số dòng hàng trả: </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {previewReturn.items.length} mặt hàng
                  </span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú kế toán cho chứng từ:
            </label>
            <textarea
              rows={3}
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
              placeholder="VD: Điều chỉnh giảm trừ nợ theo biên bản nghiệm thu hàng trả..."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
