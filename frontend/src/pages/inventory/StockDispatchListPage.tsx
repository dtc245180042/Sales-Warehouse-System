import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Search,
  CheckCircle,
  Clock,
  Eye,
  AlertTriangle,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { dispatchService } from '../../services/dispatchService';
import { StockDispatch } from '../../types/StockDispatch';
import { useToast } from '../../contexts/ToastContext';

export const StockDispatchListPage: React.FC = () => {
  const { showToast } = useToast();
  const [dispatches, setDispatches] = useState<StockDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedDispatch, setSelectedDispatch] = useState<StockDispatch | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await dispatchService.getDispatches();
      setDispatches(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách phiếu xuất kho', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const q = searchQuery.toLowerCase();
      return (
        d.id.toLowerCase().includes(q) ||
        d.order_id.toLowerCase().includes(q) ||
        (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
        d.customer_id.toLowerCase().includes(q)
      );
    });
  }, [dispatches, searchQuery]);

  const stats = useMemo(() => {
    const total = dispatches.length;
    const confirmed = dispatches.filter((d) => d.status === 'CONFIRMED').length;
    const draft = dispatches.filter((d) => d.status === 'DRAFT').length;
    const hasShortfall = dispatches.filter((d) =>
      d.items.some((it) => it.shortfall_quantity > 0)
    ).length;
    return { total, confirmed, draft, hasShortfall };
  }, [dispatches]);

  const handleConfirm = async () => {
    if (!selectedDispatch) return;
    try {
      setIsSubmitting(true);
      await dispatchService.confirmDispatch(selectedDispatch.id, confirmNotes);
      showToast(
        `Xác nhận xuất kho ${selectedDispatch.id} thành công! Tồn giữ chỗ đã chuyển thành xuất thực.`,
        'success'
      );
      setIsConfirmOpen(false);
      setConfirmNotes('');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Phiếu Xuất Kho Hàng Hóa"
      subtitle="Chuyển tồn giữ chỗ thành xuất kho thực tế, ghi nhận giao thiếu và nợ hàng (Backorder)"
    >
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng phiếu xuất kho</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã xuất kho thực tế</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.confirmed}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đang giữ chỗ / Soạn</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.draft}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phiếu có nợ hàng</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              {stats.hasShortfall}
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
            placeholder="Tìm theo mã phiếu PXK, mã đơn ORD, đại lý..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 3. Table of Dispatches */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
              <tr>
                <th className="py-3.5 px-4">Mã phiếu xuất</th>
                <th className="py-3.5 px-4">Đơn hàng gốc</th>
                <th className="py-3.5 px-4">Đại lý / Khách hàng</th>
                <th className="py-3.5 px-4">Kho xuất</th>
                <th className="py-3.5 px-4">Tình trạng xuất</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Đang tải danh sách phiếu xuất...
                  </td>
                </tr>
              ) : filteredDispatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Không tìm thấy phiếu xuất kho nào
                  </td>
                </tr>
              ) : (
                filteredDispatches.map((item) => {
                  const hasShortfall = item.items.some((it) => it.shortfall_quantity > 0);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {item.id}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {item.order_id}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                        {item.customer_name || item.customer_id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {item.warehouse_name || `Kho #${item.warehouse_id}`}
                      </td>
                      <td className="py-3.5 px-4">
                        {hasShortfall ? (
                          <span className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded-md">
                            Xuất thiếu (Có nợ hàng)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-md">
                            Xuất đủ 100%
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {item.status === 'CONFIRMED' && (
                          <Badge variant="success" dot>
                            Đã xuất kho
                          </Badge>
                        )}
                        {item.status === 'DRAFT' && (
                          <Badge variant="warning" dot>
                            Đang soạn / Giữ chỗ
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title="Xem chi tiết"
                            onClick={() => {
                              setSelectedDispatch(item);
                              setIsDetailOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {item.status === 'DRAFT' && (
                            <button
                              onClick={() => {
                                setSelectedDispatch(item);
                                setIsConfirmOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Xác nhận
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL CHI TIẾT PHIẾU XUẤT */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Chi tiết phiếu xuất kho: ${selectedDispatch?.id}`}
        subtitle={`Đơn hàng gốc: ${selectedDispatch?.order_id} - Khách hàng: ${selectedDispatch?.customer_name}`}
        maxWidth="lg"
      >
        {selectedDispatch && (
          <div className="space-y-4 text-xs">
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Sản phẩm</th>
                    <th className="py-2.5 px-3 text-right">Đặt hàng</th>
                    <th className="py-2.5 px-3 text-right">Thực xuất</th>
                    <th className="py-2.5 px-3 text-right">Thiếu (Nợ hàng)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedDispatch.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-medium">
                        {it.product_name || it.sku}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {it.ordered_quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        {it.dispatched_quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                        {it.shortfall_quantity > 0 ? `-${it.shortfall_quantity}` : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedDispatch.notes && (
              <p className="text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg">
                <strong>Ghi chú:</strong> {selectedDispatch.notes}
              </p>
            )}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};
