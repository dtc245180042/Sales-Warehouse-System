import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  Calendar,
  MapPin,
  Clock,
  Printer,
  RefreshCw,
  Edit3,
  FileText,
  Building,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { DeliveryTimeline } from '../../components/delivery/DeliveryTimeline';
import { DeliveryTrackingCard } from '../../components/delivery/DeliveryTrackingCard';
import { UpdateMilestoneModal } from '../../components/delivery/UpdateMilestoneModal';
import { OrderDeliveryItemsTable } from '../../components/delivery/OrderDeliveryItemsTable';
import { UpdateItemDeliveryQuantityModal } from '../../components/delivery/UpdateItemDeliveryQuantityModal';
import { deliveryTrackingService, MILESTONE_ORDER } from '../../services/deliveryTrackingService';
import { orderService } from '../../services/orderService';
import { DeliveryMilestoneKey, DeliveryTrackingDetails } from '../../types/DeliveryTracking';
import { Order } from '../../types/Order';
import { useToast } from '../../contexts/ToastContext';

export const OrderDeliveryTrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(id || 'ORD-001');
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<DeliveryTrackingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isEditQuantityModalOpen, setIsEditQuantityModalOpen] = useState(false);
  const [isSelectOrderModalOpen, setIsSelectOrderModalOpen] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  useEffect(() => {
    orderService.getAll().then((orders) => {
      setAllOrders(orders);
      if (!id && orders.length > 0) {
        setSelectedOrderId(orders[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (id) {
      setSelectedOrderId(id);
    }
  }, [id]);

  const loadData = async (targetId?: string) => {
    const currentId = targetId || selectedOrderId || id || 'ORD-001';
    try {
      setLoading(true);
      const [orderData, trackingData] = await Promise.all([
        orderService.getById(currentId),
        deliveryTrackingService.getByOrderId(currentId),
      ]);
      if (orderData) setOrder(orderData);
      if (trackingData) setTracking(trackingData);
    } catch {
      showToast('Lỗi khi tải dữ liệu tiến trình giao hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedOrderId);
  }, [selectedOrderId]);

  const handleAdvanceMilestone = async (targetMilestone: DeliveryMilestoneKey) => {
    const currentId = order?.id || selectedOrderId;
    if (!currentId) return;
    try {
      const updated = await deliveryTrackingService.updateMilestone(currentId, targetMilestone);
      setTracking(updated);
      showToast(`Đã chuyển mốc giao hàng sang "${targetMilestone}"`, 'success');
      // Tải lại order để đồng bộ status nếu có
      const refreshedOrder = await orderService.getById(currentId);
      if (refreshedOrder) setOrder(refreshedOrder);
    } catch {
      showToast('Lỗi khi chuyển mốc giao hàng', 'error');
    }
  };

  const handleModalConfirm = async (
    targetMilestone: DeliveryMilestoneKey,
    note: string,
    performer: string,
    location: string
  ) => {
    const currentId = order?.id || selectedOrderId;
    if (!currentId) return;
    const updated = await deliveryTrackingService.updateMilestone(
      currentId,
      targetMilestone,
      note,
      performer,
      location
    );
    setTracking(updated);
    showToast('Cập nhật mốc giao hàng thành công', 'success');
    const refreshedOrder = await orderService.getById(currentId);
    if (refreshedOrder) setOrder(refreshedOrder);
  };

  const handleSaveItemDeliveryQuantities = async (
    updates: { productId: string; deliveredQuantity: number; shortageReason?: string }[],
    resolutionNote: string
  ) => {
    if (!order) return;
    try {
      const updated = await orderService.updateItemDeliveryQuantities(
        order.id,
        updates,
        resolutionNote
      );
      setOrder(updated);
      showToast('Đã lưu số lượng thực giao theo dòng hàng thành công', 'success');
    } catch {
      showToast('Lỗi cập nhật số lượng thực giao', 'error');
    }
  };

  if (loading) return <Loading text="Đang tải dữ liệu theo dõi giao hàng..." />;

  if (!tracking || !order) {
    return (
      <EmptyState
        title="Không tìm thấy thông tin giao hàng"
        description="Đơn hàng hoặc mã vận đơn không tồn tại trong hệ thống điều phối."
        actionText="Quay lại danh sách đơn hàng"
        onAction={() => navigate('/orders')}
      />
    );
  }

  // Tính phần trăm tiến độ
  const currentIdx = MILESTONE_ORDER.indexOf(tracking.currentMilestone);
  const progressPercent = tracking.currentMilestone === 'delivered'
    ? 100
    : Math.round(((currentIdx + 0.5) / MILESTONE_ORDER.length) * 100);

  return (
    <PageContainer
      title={`Theo Dõi Giao Hàng: ${tracking.orderCode}`}
      subtitle={`Mã vận đơn: ${tracking.trackingNumber} | Đơn vị: ${tracking.carrier}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/sales/orders/${order.id}`}>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Chi tiết đơn hàng
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(selectedOrderId)}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            In phiếu giao nhận
          </Button>
        </div>
      }
    >
      {/* Thanh chọn đơn hàng & Cập nhật mốc giao hàng nổi bật */}
      <div className="p-4 bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 rounded-2xl flex flex-wrap items-center justify-between gap-4 mb-6 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
              Đang xem tiến trình của đơn hàng:
            </span>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <select
                value={order.id}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedOrderId(newId);
                  navigate(`/sales/orders/${newId}/delivery`);
                }}
                className="text-base font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
              >
                {allOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} - {o.customerName || 'Khách hàng'} ({(o.total ?? 0).toLocaleString('vi-VN')} đ)
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="md"
                onClick={() => setIsSelectOrderModalOpen(true)}
                leftIcon={<Search className="w-4 h-4 text-indigo-600" />}
                className="border-2 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 font-bold text-indigo-700 dark:text-indigo-300"
              >
                Nút chọn đơn hàng khác
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsUpdateModalOpen(true)}
            leftIcon={<Edit3 className="w-5 h-5" />}
            className="shadow-lg shadow-indigo-500/30 font-bold px-5 py-2.5 text-sm"
          >
            Cập nhật tiến trình mốc giao hàng
          </Button>
        </div>
      </div>

      {/* 1. Overview Progress Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl mb-6 relative overflow-hidden border border-indigo-900/50">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Truck className="w-64 h-64 text-indigo-400" />
        </div>

        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              SCRUM-695 / SCRUM-696: Tracking Tiến Độ Đại Lý
            </span>
            <Badge
              variant={
                tracking.currentMilestone === 'delivered'
                  ? 'success'
                  : tracking.currentMilestone === 'shipping'
                  ? 'info'
                  : 'warning'
              }
              size="md"
            >
              Mốc hiện tại:{' '}
              {tracking.milestones.find((m) => m.key === tracking.currentMilestone)?.label}
            </Badge>
            {order.hasShortage && (
              <Badge variant="warning" size="md">
                Đơn có mặt hàng giao thiếu
              </Badge>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-2">
            Tiến Độ Giao Hàng: {progressPercent}% Hoàn Tất
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mb-5">
            Đơn hàng xuất từ <strong className="text-white">{tracking.sourceWarehouse}</strong> đang được vận chuyển tới Đại lý{' '}
            <strong className="text-white">{tracking.recipientName}</strong>.
          </p>

          {/* Progress bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-slate-700/60 mb-3">
            <div
              className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 h-2.5 rounded-full transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-mono">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Cập nhật gần nhất: {tracking.lastUpdated}
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <Calendar className="w-3.5 h-3.5" />
              Dự kiến giao: {tracking.estimatedDeliveryDate}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Timeline: 5 Mốc Giao Hàng (Đã duyệt, Đang soạn, Đã xuất, Đang giao, Đã giao) */}
      <div className="mb-6">
        <DeliveryTimeline
          milestones={tracking.milestones}
          currentMilestone={tracking.currentMilestone}
          isCancelled={tracking.isCancelled}
          cancelledReason={tracking.cancelledReason}
          variant="both"
          canManage={true}
          onAdvanceMilestone={handleAdvanceMilestone}
        />
      </div>

      {/* 3. Grid: Left: Chi tiết kiện hàng & số lượng thực giao - Right: Thông tin vận chuyển & Đại lý */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Chi tiết dòng hàng & Số lượng thực giao (SCRUM-696) */}
        <div className="lg:col-span-2 space-y-6">
          <OrderDeliveryItemsTable
            items={order.items}
            orderTotal={order.total}
            hasShortage={order.hasShortage}
            shortageResolution={order.shortageResolution}
            canEdit={order.status !== 'cancelled'}
            onOpenEditModal={() => setIsEditQuantityModalOpen(true)}
          />

          {/* Ghi chú giao nhận cho đại lý */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              Lưu Ý Giao Nhận & Đối Soát Số Lượng Thực Giao Dành Cho Đại Lý
            </h4>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p>• Đại lý đối soát số lượng thực tế trong thùng hàng so với cột <strong>SL Thực Giao</strong> trên biên bản giao nhận.</p>
              <p>• Trường hợp giao thiếu (do kho tạm hết hoặc tách đợt), hệ thống đã ghi nhận lý do cụ thể và phương án xuất bù đợt 2 không tính thêm phí vận chuyển.</p>
              <p>• Hotline hỗ trợ điều phối vận chuyển OMS: <strong>1900 6868</strong> (Nhánh 2).</p>
            </div>
          </div>
        </div>

        {/* Right (1 col): Thông tin vận chuyển & Tài xế */}
        <div className="space-y-6">
          <DeliveryTrackingCard tracking={tracking} showViewTrackingLink={false} />

          {/* Thông tin người nhận hàng */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-500" />
              Thông Tin Đại Lý Nhận Hàng
            </h3>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {tracking.recipientName}
              </p>
              <div className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">SĐT nhận:</span>
                  <span>{tracking.recipientPhone}</span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{tracking.destinationAddress}</span>
                </p>
                {order.note && (
                  <p className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 mt-2">
                    <strong>Ghi chú đơn:</strong> {order.note}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Cập nhật mốc */}
      <UpdateMilestoneModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        tracking={tracking}
        onConfirm={handleModalConfirm}
      />

      {/* Modal Cập nhật số lượng thực giao (SCRUM-696) */}
      <UpdateItemDeliveryQuantityModal
        isOpen={isEditQuantityModalOpen}
        onClose={() => setIsEditQuantityModalOpen(false)}
        items={order.items}
        currentResolution={order.shortageResolution}
        onSave={handleSaveItemDeliveryQuantities}
      />

      {/* Modal Chọn Đơn Hàng Theo Dõi */}
      <Modal
        isOpen={isSelectOrderModalOpen}
        onClose={() => setIsSelectOrderModalOpen(false)}
        title="Danh Sách Chọn Đơn Hàng Theo Dõi Giao Hàng"
        size="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={orderSearchQuery}
              onChange={(e) => setOrderSearchQuery(e.target.value)}
              placeholder="Tìm theo mã đơn hoặc tên đại lý/khách hàng..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
            {allOrders
              .filter(
                (o) =>
                  !orderSearchQuery ||
                  o.id.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                  o.customerName.toLowerCase().includes(orderSearchQuery.toLowerCase())
              )
              .map((o) => {
                const isCurrent = o.id === order.id;
                return (
                  <div
                    key={o.id}
                    className={`p-3.5 flex items-center justify-between gap-4 transition-colors ${
                      isCurrent
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {o.id}
                        </span>
                        {isCurrent && (
                          <Badge variant="success" size="sm">
                            Đang xem
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">
                          {o.createdAt}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                        {o.customerName}
                      </p>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                        {(o.total ?? 0).toLocaleString('vi-VN')} đ
                      </p>
                    </div>

                    <Button
                      variant={isCurrent ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => {
                        setSelectedOrderId(o.id);
                        navigate(`/sales/orders/${o.id}/delivery`);
                        setIsSelectOrderModalOpen(false);
                      }}
                      leftIcon={isCurrent ? <CheckCircle2 className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    >
                      {isCurrent ? 'Đang chọn' : 'Chọn đơn này'}
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
