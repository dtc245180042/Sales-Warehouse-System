import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Building2,
  Calendar,
  ChevronRight,
  Filter,
  Package,
  MapPin,
  Phone,
} from 'lucide-react';
import { DeliveryTrip, DeliveryStatus } from '../../types/Delivery';
import { initialDeliveryTrips } from '../../mock/deliveryTrips';

// -------------------------------------------------------------
// Sub-components declared OUTSIDE main component (AGENTS.md rule)
// -------------------------------------------------------------

interface OverdueWarningBadgeProps {
  overdueDuration: number;
}

const OverdueWarningBadge: React.FC<OverdueWarningBadgeProps> = ({ overdueDuration }) => {
  const isSevere = overdueDuration >= 60;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
        isSevere
          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800 animate-pulse'
          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800'
      }`}
    >
      <AlertTriangle className="w-3.5 h-3.5" />
      Quá {overdueDuration} phút
    </span>
  );
};

interface DeliveryStatusBadgeProps {
  status: DeliveryStatus;
  isOverdue: boolean;
  overdueDuration?: number;
}

const DeliveryStatusBadge: React.FC<DeliveryStatusBadgeProps> = ({
  status,
  isOverdue,
  overdueDuration = 0,
}) => {
  if (isOverdue && status === 'in_progress') {
    return <OverdueWarningBadge overdueDuration={overdueDuration} />;
  }

  switch (status) {
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800">
          <Truck className="w-3.5 h-3.5" />
          Đang giao hàng
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Đã hoàn thành
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          <Clock className="w-3.5 h-3.5" />
          Chờ khởi hành
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800">
          Đã hủy
        </span>
      );
    default:
      return null;
  }
};

interface DeliveryProgressBarProps {
  delivered: number;
  total: number;
  label: string;
}

const DeliveryProgressBar: React.FC<DeliveryProgressBarProps> = ({ delivered, total, label }) => {
  const percentage = total > 0 ? Math.round((delivered / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between items-center text-xs mb-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {delivered}/{total} ({percentage}%)
        </span>
      </div>
      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            percentage === 100 ? 'bg-emerald-500' : 'bg-primary-600'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

interface DeliveryTripCardProps {
  trip: DeliveryTrip;
  onViewDetail: (id: string) => void;
}

const DeliveryTripCard: React.FC<DeliveryTripCardProps> = ({ trip, onViewDetail }) => {
  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      onClick={() => onViewDetail(trip.id)}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-primary-500 dark:hover:border-primary-500 transition-all shadow-sm hover:shadow-md cursor-pointer group flex flex-col justify-between"
    >
      <div>
        {/* Header card */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                {trip.code}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                {trip.vehiclePlate}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>{trip.warehouseName}</span>
            </div>
          </div>
          <div>
            <DeliveryStatusBadge
              status={trip.status}
              isOverdue={trip.isOverdue}
              overdueDuration={trip.overdueDuration}
            />
          </div>
        </div>

        {/* Driver info */}
        <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 dark:border-slate-800/80 my-3 text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">Tài xế phụ trách:</span>
            <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <span>{trip.driverName}</span>
            </div>
            <div className="text-slate-500 flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3" />
              <span>{trip.driverPhone}</span>
            </div>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">Thời gian thực tế:</span>
            <div className="text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTime(trip.startTime)} - Dự kiến {formatTime(trip.estimatedEndTime)}</span>
            </div>
          </div>
        </div>

        {/* Progress bars */}
        <div className="space-y-2.5 my-3">
          <DeliveryProgressBar
            delivered={trip.deliveredPoints}
            total={trip.totalPoints}
            label="Tiến độ điểm giao"
          />
          <DeliveryProgressBar
            delivered={trip.deliveredItems}
            total={trip.totalItems}
            label="Số kiện hàng"
          />
        </div>
      </div>

      {/* Footer / action */}
      <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-primary-500" />
            Còn lại <strong>{trip.remainingPoints}</strong> điểm
          </span>
          <span className="flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-amber-500" />
            Còn <strong>{trip.remainingItems}</strong> kiện
          </span>
        </div>
        <button
          type="button"
          className="text-primary-600 dark:text-primary-400 font-medium inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
        >
          Chi tiết <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Main DeliveryListPage Component
// -------------------------------------------------------------

export const DeliveryListPage: React.FC = () => {
  const navigate = useNavigate();
  const [trips] = useState<DeliveryTrip[]>(initialDeliveryTrips);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');

  // Overview stats calculation
  const stats = useMemo(() => {
    const total = trips.length;
    const inProgress = trips.filter((t) => t.status === 'in_progress').length;
    const overdue = trips.filter((t) => t.isOverdue && t.status === 'in_progress').length;
    const completed = trips.filter((t) => t.status === 'completed').length;
    return { total, inProgress, overdue, completed };
  }, [trips]);

  // Unique warehouses for filter
  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    trips.forEach((t) => {
      map.set(t.warehouseId, t.warehouseName);
    });
    return Array.from(map.entries());
  }, [trips]);

  // Filtered trips
  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchSearch =
        trip.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase());

      const matchWarehouse =
        warehouseFilter === 'all' || trip.warehouseId === warehouseFilter;

      let matchStatus = true;
      if (statusFilter === 'in_progress') {
        matchStatus = trip.status === 'in_progress';
      } else if (statusFilter === 'overdue') {
        matchStatus = trip.isOverdue && trip.status === 'in_progress';
      } else if (statusFilter === 'completed') {
        matchStatus = trip.status === 'completed';
      } else if (statusFilter === 'pending') {
        matchStatus = trip.status === 'pending';
      }

      return matchSearch && matchWarehouse && matchStatus;
    });
  }, [trips, searchTerm, statusFilter, warehouseFilter]);

  const handleViewDetail = (id: string) => {
    navigate(`/delivery/${id}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Truck className="w-7 h-7 text-primary-600" />
            Theo Dõi Chuyến Giao Đang Chạy
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Giám sát thời gian thực tiến độ giao nhận theo từng điểm và cảnh báo quá giờ
          </p>
        </div>
      </div>

      {/* KPI Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tổng số chuyến
            </span>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats.total}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Đang di chuyển giao
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            {stats.inProgress}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 shadow-sm bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">
              Cảnh báo quá giờ
            </span>
            <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {stats.overdue}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Đã hoàn thành
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {stats.completed}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã chuyến, tài xế, biển số..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="in_progress">Đang giao hàng</option>
              <option value="overdue">⚠️ Quá giờ dự kiến</option>
              <option value="pending">Chờ khởi hành</option>
              <option value="completed">Đã hoàn thành</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              <option value="all">Tất cả kho xuất phát</option>
              {warehouses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid of Trip Cards */}
      {filteredTrips.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
          <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Không tìm thấy chuyến giao nào
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Hãy thử thay đổi điều kiện tìm kiếm hoặc bộ lọc trạng thái.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTrips.map((trip) => (
            <DeliveryTripCard
              key={trip.id}
              trip={trip}
              onViewDetail={handleViewDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
};
