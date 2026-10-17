import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  Phone,
  Package,
  Calendar,
  User,
  Check,
  AlertCircle,
} from 'lucide-react';
import { DeliveryTrip, DeliveryPoint, DeliveryPointStatus } from '../../types/Delivery';
import { initialDeliveryTrips } from '../../mock/deliveryTrips';

// -------------------------------------------------------------
// Sub-components declared OUTSIDE main component (AGENTS.md rule)
// -------------------------------------------------------------

interface PointStatusBadgeProps {
  status: DeliveryPointStatus;
}

const PointStatusBadge: React.FC<PointStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'delivered':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Đã giao xong
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800">
          <XCircle className="w-3.5 h-3.5" />
          Giao thất bại
        </span>
      );
    case 'not_delivered':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Chưa giao
        </span>
      );
  }
};

interface OverdueBannerProps {
  overdueDuration: number;
  estimatedEndTime: string;
}

const OverdueBanner: React.FC<OverdueBannerProps> = ({ overdueDuration, estimatedEndTime }) => {
  const isSevere = overdueDuration >= 60;
  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
        isSevere
          ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div
        className={`p-2 rounded-lg shrink-0 ${
          isSevere
            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 animate-bounce'
            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
        }`}
      >
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="flex-1 text-sm">
        <h4 className="font-bold text-base flex items-center gap-2">
          CẢNH BÁO: CHUYẾN GIAO QUÁ THỜI GIAN DỰ KIẾN
          <span className="px-2 py-0.5 rounded text-xs bg-red-600 text-white font-mono">
            +{overdueDuration} phút
          </span>
        </h4>
        <p className="mt-1 opacity-90">
          Chuyến giao hàng đã vượt quá thời gian dự kiến kết thúc ({formatTime(estimatedEndTime)}).
          Vui lòng kiểm tra liên lạc với tài xế hoặc hỗ trợ xử lý sự cố lộ trình giao hàng.
        </p>
      </div>
    </div>
  );
};

interface DeliveryPointItemProps {
  point: DeliveryPoint;
  onUpdateStatus?: (pointId: string, status: DeliveryPointStatus) => void;
}

const DeliveryPointItem: React.FC<DeliveryPointItemProps> = ({ point, onUpdateStatus }) => {
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Left: Sequence + Customer Info */}
        <div className="flex items-start gap-3.5">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
              point.status === 'delivered'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : point.status === 'failed'
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
            }`}
          >
            #{point.sequence}
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white text-base">
                {point.customerName}
              </h4>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                {point.orderCode}
              </span>
              <PointStatusBadge status={point.status} />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>{point.customerPhone}</span>
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1">
              <MapPin className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
              <span>{point.address}</span>
            </div>

            {point.note && (
              <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Ghi chú:</strong> {point.note}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quantity and Status Actions */}
        <div className="sm:text-right flex flex-col justify-between shrink-0 pl-12 sm:pl-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-xs text-slate-400 block mb-0.5">Số lượng kiện:</span>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {point.deliveredItems}/{point.totalItems} kiện
            </div>
            {point.remainingItems > 0 && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                (Còn {point.remainingItems} kiện)
              </span>
            )}
            {point.deliveredAt && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex sm:justify-end items-center gap-1">
                <Clock className="w-3 h-3" />
                Giao lúc {formatTime(point.deliveredAt)}
              </div>
            )}
          </div>

          {/* Quick status update button if still not delivered */}
          {onUpdateStatus && point.status === 'not_delivered' && (
            <div className="flex items-center sm:justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => onUpdateStatus(point.id, 'delivered')}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 transition-colors"
              >
                <Check className="w-3 h-3" />
                Xác nhận đã giao
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus(point.id, 'failed')}
                className="px-2 py-1 text-xs font-medium rounded bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 transition-colors"
              >
                Báo thất bại
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Main DeliveryDetailPage Component
// -------------------------------------------------------------

export const DeliveryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Find trip from mock data
  const [trips, setTrips] = useState<DeliveryTrip[]>(initialDeliveryTrips);

  const trip = useMemo(() => {
    return trips.find((t) => t.id === id) || trips[0];
  }, [trips, id]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--/--/----';
    return new Date(isoString).toLocaleDateString('vi-VN');
  };

  // Quick update point status simulation
  const handleUpdatePointStatus = (pointId: string, newStatus: DeliveryPointStatus) => {
    setTrips((prevTrips) =>
      prevTrips.map((t) => {
        if (t.id !== trip.id) return t;

        const updatedPoints = t.points.map((p) => {
          if (p.id !== pointId) return p;
          const isDelivered = newStatus === 'delivered';
          return {
            ...p,
            status: newStatus,
            deliveredItems: isDelivered ? p.totalItems : 0,
            remainingItems: isDelivered ? 0 : p.totalItems,
            deliveredAt: isDelivered ? new Date().toISOString() : undefined,
          };
        });

        const deliveredPointsCount = updatedPoints.filter(
          (p) => p.status === 'delivered'
        ).length;
        const totalPointsCount = updatedPoints.length;
        const totalDeliveredItems = updatedPoints.reduce(
          (sum, p) => sum + p.deliveredItems,
          0
        );
        const allCompleted = deliveredPointsCount === totalPointsCount;

        return {
          ...t,
          points: updatedPoints,
          deliveredPoints: deliveredPointsCount,
          remainingPoints: totalPointsCount - deliveredPointsCount,
          deliveredItems: totalDeliveredItems,
          remainingItems: t.totalItems - totalDeliveredItems,
          status: allCompleted ? 'completed' : t.status,
        };
      })
    );
  };

  if (!trip) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Không tìm thấy thông tin chuyến giao hàng</h2>
        <button
          onClick={() => navigate('/delivery')}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm"
        >
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const pointPercentage =
    trip.totalPoints > 0
      ? Math.round((trip.deliveredPoints / trip.totalPoints) * 100)
      : 0;

  const itemPercentage =
    trip.totalItems > 0
      ? Math.round((trip.deliveredItems / trip.totalItems) * 100)
      : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Back button and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/delivery')}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Chuyến giao: {trip.code}
              </h1>
              <span className="text-xs px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold">
                {trip.vehiclePlate}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Khởi hành ngày {formatDate(trip.startTime)} từ {trip.warehouseName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {trip.status === 'completed' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              Đã hoàn thành toàn bộ
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              <Truck className="w-4 h-4" />
              Đang giao hàng
            </span>
          )}
        </div>
      </div>

      {/* SCRUM-685: Overdue Warning Banner */}
      {trip.isOverdue && trip.status === 'in_progress' && (
        <OverdueBanner
          overdueDuration={trip.overdueDuration || 0}
          estimatedEndTime={trip.estimatedEndTime}
        />
      )}

      {/* Trip Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Driver info */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <User className="w-4 h-4 text-primary-500" />
            Tài xế & Phương tiện
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white text-base">
              {trip.driverName}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
              <Phone className="w-3.5 h-3.5" />
              <span>{trip.driverPhone}</span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mt-1">
              <Truck className="w-3.5 h-3.5 text-slate-400" />
              <span>Biển số xe: <strong>{trip.vehiclePlate}</strong></span>
            </div>
          </div>
        </div>

        {/* Schedule & Timing */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Clock className="w-4 h-4 text-primary-500" />
            Lộ trình thời gian
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Bắt đầu:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatTime(trip.startTime)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Dự kiến xong:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatTime(trip.estimatedEndTime)}
              </span>
            </div>
            {trip.actualEndTime && (
              <div className="flex justify-between">
                <span className="text-slate-500">Thực tế kết thúc:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatTime(trip.actualEndTime)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Kho xuất phát:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {trip.warehouseName}
              </span>
            </div>
          </div>
        </div>

        {/* Progress summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Package className="w-4 h-4 text-primary-500" />
            Tiến độ tổng thể
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Điểm giao:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {trip.deliveredPoints}/{trip.totalPoints} ({pointPercentage}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all duration-500"
                  style={{ width: `${pointPercentage}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Kiện hàng:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {trip.deliveredItems}/{trip.totalItems} ({itemPercentage}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${itemPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* List of Delivery Points */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary-600" />
            Lộ trình các điểm giao hàng ({trip.points.length} điểm)
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Thứ tự sắp xếp tối ưu theo tuyến đường
          </span>
        </div>

        <div className="space-y-3">
          {trip.points.map((point) => (
            <DeliveryPointItem
              key={point.id}
              point={point}
              onUpdateStatus={handleUpdatePointStatus}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
