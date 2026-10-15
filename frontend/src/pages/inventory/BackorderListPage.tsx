import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Search,
  CheckCircle,
  AlertTriangle,
  Package,
  Layers,
  ArrowRight,
  Truck,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { dispatchService } from '../../services/dispatchService';
import { BackorderItem } from '../../types/StockDispatch';
import { useToast } from '../../contexts/ToastContext';

export const BackorderListPage: React.FC = () => {
  const { showToast } = useToast();
  const [backorders, setBackorders] = useState<BackorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_RESTOCK' | 'SCHEDULED' | 'FULFILLED'>('ALL');

  // Modal Điều phối giao bù
  const [selectedBackorder, setSelectedBackorder] = useState<BackorderItem | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await dispatchService.getBackorders();
      setBackorders(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách nợ hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    return backorders.filter((b) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        b.order_id.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.product_name.toLowerCase().includes(q) ||
        b.sku.toLowerCase().includes(q) ||
        b.dispatch_id.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [backorders, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const totalItems = backorders.length;
    const totalShortfall = backorders.reduce((sum, b) => sum + b.shortfall_quantity, 0);
    const pendingCount = backorders.filter((b) => b.status === 'PENDING_RESTOCK').length;
    const scheduledCount = backorders.filter((b) => b.status === 'SCHEDULED').length;
    return { totalItems, totalShortfall, pendingCount, scheduledCount };
  }, [backorders]);

  const handleOpenSchedule = (item: BackorderItem) => {
    setSelectedBackorder(item);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduledDate(tomorrow.toISOString().split('T')[0]);
    setScheduleNotes(`Lên lịch giao bù cho đơn hàng ${item.order_id} khi có lô hàng mới`);
    setIsScheduleOpen(true);
  };

  const handleConfirmSchedule = async () => {
    if (!selectedBackorder) return;
    try {
      setIsSubmitting(true);
      // Simulate API call and update local state
      await new Promise((r) => setTimeout(r, 600));
      setBackorders((prev) =>
        prev.map((b) =>
          b.id === selectedBackorder.id
            ? { ...b, status: 'SCHEDULED' }
            : b
        )
      );
      showToast(`Đã lên lịch giao bù ${selectedBackorder.shortfall_quantity} ${selectedBackorder.unit} thành công`, 'success');
      setIsScheduleOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi lên lịch giao bù', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Theo Dõi Nợ Hàng & Giao Bù"
      subtitle="Quản lý các mặt hàng xuất thiếu (Backorder) do thiếu tồn kho và điều phối giao bù khi hàng về"
      breadcrumbs={[
        { label: 'Quản lý kho', path: '/inventory' },
        { label: 'Nợ hàng & Giao bù' },
      ]}
      actions={
        <Button variant="outline" onClick={loadData} isLoading={loading}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Làm mới
        </Button>
      }
    >
      {/* 1. THẺ THỐNG KÊ TỔNG QUAN */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mặt hàng nợ kho</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalItems}</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng SL nợ khách</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{stats.totalShortfall.toLocaleString('vi-VN')}</p>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chờ nhập bổ sung</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingCount}</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đã lên lịch giao bù</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.scheduledCount}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
            <Truck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. THANH BỘ LỌC VÀ TÌM KIẾM */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn hàng, phiếu xuất, khách hàng, tên hoặc SKU sản phẩm..."
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
            <option value="PENDING_RESTOCK">Chờ nhập bổ sung</option>
            <option value="SCHEDULED">Đã lên lịch giao bù</option>
            <option value="FULFILLED">Đã hoàn thành giao bù</option>
          </select>
        </div>
      </div>

      {/* 3. BẢNG DANH SÁCH NỢ HÀNG */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Đơn Hàng & Phiếu Xuất</th>
                <th className="px-6 py-4">Đại Lý / Khách Hàng</th>
                <th className="px-6 py-4">Sản Phẩm & SKU</th>
                <th className="px-6 py-4 text-center">Yêu Cầu</th>
                <th className="px-6 py-4 text-center">Đã Xuất</th>
                <th className="px-6 py-4 text-center">Thiếu (Nợ)</th>
                <th className="px-6 py-4">Kho Phụ Trách</th>
                <th className="px-6 py-4 text-center">Trạng Thái</th>
                <th className="px-6 py-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p>Đang tải danh sách nợ hàng...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="font-medium text-slate-800">Không có bản ghi nợ hàng nào!</p>
                    <p className="text-xs text-slate-500 mt-1">Tất cả các phiếu xuất kho đều đáp ứng đủ 100% số lượng.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-primary-600">{item.order_id}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Từ PXK: {item.dispatch_id}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{new Date(item.created_at).toLocaleDateString('vi-VN')}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{item.customer_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{item.product_name}</div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">Mã SKU: {item.sku}</div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-slate-700">
                      {item.requested_quantity} {item.unit}
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-emerald-600">
                      {item.dispatched_quantity} {item.unit}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                        -{item.shortfall_quantity} {item.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {item.warehouse_name}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.status === 'PENDING_RESTOCK' && (
                        <Badge variant="warning">Chờ nhập bổ sung</Badge>
                      )}
                      {item.status === 'SCHEDULED' && (
                        <Badge variant="info">Đã lên lịch giao</Badge>
                      )}
                      {item.status === 'FULFILLED' && (
                        <Badge variant="success">Đã hoàn thành</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.status === 'PENDING_RESTOCK' ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleOpenSchedule(item)}
                        >
                          <Truck className="w-3.5 h-3.5 mr-1" />
                          Lên lịch giao
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Đã tiếp nhận</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL ĐIỀU PHỐI GIAO BÙ */}
      <Modal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Lên Lịch Giao Bù Nợ Hàng"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsScheduleOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmSchedule}
              isLoading={isSubmitting}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Xác Nhận Lên Lịch
            </Button>
          </div>
        }
      >
        {selectedBackorder && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p className="font-semibold">Mặt hàng xuất thiếu:</p>
              <p className="mt-1">
                <strong>{selectedBackorder.product_name}</strong> (SKU: {selectedBackorder.sku})
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Số lượng thiếu: <strong>{selectedBackorder.shortfall_quantity} {selectedBackorder.unit}</strong> (Đơn hàng {selectedBackorder.order_id})
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Khách hàng nhận bù
              </label>
              <input
                type="text"
                disabled
                value={selectedBackorder.customer_name}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Ngày dự kiến giao bù *
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Ghi chú điều phối
              </label>
              <textarea
                rows={3}
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Nhập ghi chú cho bộ phận kho và vận chuyển..."
              />
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};
