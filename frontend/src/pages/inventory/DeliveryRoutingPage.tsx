import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  MapPin,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  Plus,
  RefreshCw,
  Send,
  AlertCircle,
  XCircle,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  Phone,
  User,
  Shield,
  ArrowRight,
  Package,
  Building,
  Check,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../contexts/ToastContext';
import {
  deliveryTripService,
} from '../../services/deliveryTripService';
import {
  DeliveryTrip,
  AreaGroupingSuggestion,
  PendingDispatchForRouting,
  DeliveryManifestResponse,
  DeliveryManifestStop,
} from '../../types/DeliveryTrip';
import { formatCurrency } from '../../utils/formatters';

// Danh sách tài xế mẫu gợi ý nhanh
const PRESET_DRIVERS = [
  { id: 101, name: 'Nguyễn Văn Hùng', phone: '0981122334', defaultVehicle: '29C-123.45', vehicleType: 'Xe tải 1.5 Tấn' },
  { id: 102, name: 'Trần Đình Trọng', phone: '0972233445', defaultVehicle: '29C-678.90', vehicleType: 'Xe tải 2.5 Tấn' },
  { id: 103, name: 'Lê Văn Tuấn', phone: '0913344556', defaultVehicle: '29D-456.78', vehicleType: 'Xe tải 3.5 Tấn' },
  { id: 104, name: 'Phạm Minh Đức', phone: '0904455667', defaultVehicle: '29K-999.88', vehicleType: 'Xe bán tải' },
  { id: 105, name: 'Vũ Đức Nam', phone: '0965566778', defaultVehicle: '29M-111.22', vehicleType: 'Xe máy chuyên dụng' },
];

export const DeliveryRoutingPage: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'PLANNER' | 'TRIPS'>('PLANNER');
  const [loading, setLoading] = useState(true);

  // Dữ liệu gợi ý gom chuyến và phiếu xuất chờ gom
  const [suggestions, setSuggestions] = useState<AreaGroupingSuggestion[]>([]);
  const [pendingDispatches, setPendingDispatches] = useState<PendingDispatchForRouting[]>([]);
  const [selectedDispatchIds, setSelectedDispatchIds] = useState<string[]>([]);
  const [searchPending, setSearchPending] = useState('');
  const [filterArea, setFilterArea] = useState<string>('ALL');

  // Dữ liệu danh sách chuyến giao hàng
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [tripFilterStatus, setTripFilterStatus] = useState<string>('ALL');
  const [tripSearch, setTripSearch] = useState('');

  // 1. Modal Tạo chuyến mới
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createArea, setCreateArea] = useState('');
  const [createDriverName, setCreateDriverName] = useState('');
  const [createDriverPhone, setCreateDriverPhone] = useState('');
  const [createLicensePlate, setCreateLicensePlate] = useState('');
  const [createVehicleType, setCreateVehicleType] = useState('Xe tải 1.5 Tấn');
  const [createExpectedTime, setCreateExpectedTime] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // 2. Modal Gán / Đổi tài xế & xe
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetTrip, setTargetTrip] = useState<DeliveryTrip | null>(null);
  const [assignDriverName, setAssignDriverName] = useState('');
  const [assignDriverPhone, setAssignDriverPhone] = useState('');
  const [assignLicensePlate, setAssignLicensePlate] = useState('');
  const [assignVehicleType, setAssignVehicleType] = useState('Xe tải 1.5 Tấn');
  const [assignNotes, setAssignNotes] = useState('');
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // 3. Modal Xem chi tiết điểm dừng (Stops Viewer)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewTrip, setViewTrip] = useState<DeliveryTrip | null>(null);

  // 4. Modal In Lệnh Điều Phối & Danh Sách Điểm Giao (Print Manifest)
  const [isManifestModalOpen, setIsManifestModalOpen] = useState(false);
  const [manifestData, setManifestData] = useState<DeliveryManifestResponse | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Tải dữ liệu ban đầu
  const loadData = async () => {
    try {
      setLoading(true);
      const [sugRes, penRes, tripsRes] = await Promise.all([
        deliveryTripService.getGroupingSuggestions(),
        deliveryTripService.getPendingDispatches(),
        deliveryTripService.getTrips(),
      ]);
      setSuggestions(sugRes);
      setPendingDispatches(penRes);
      setTrips(tripsRes);
    } catch (err: any) {
      console.warn('Lỗi tải dữ liệu phân tuyến:', err);
      showToast(err.message || 'Lỗi tải dữ liệu điều phối', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Tính toán số liệu thống kê
  const stats = useMemo(() => {
    return {
      totalTrips: trips.length,
      planned: trips.filter((t) => t.status === 'PLANNED').length,
      ready: trips.filter((t) => t.status === 'READY').length,
      inTransit: trips.filter((t) => t.status === 'IN_TRANSIT').length,
      completed: trips.filter((t) => t.status === 'COMPLETED').length,
      pendingCount: pendingDispatches.length,
    };
  }, [trips, pendingDispatches]);

  // Lọc phiếu xuất chờ điều phối
  const filteredPending = useMemo(() => {
    return pendingDispatches.filter((p) => {
      const q = searchPending.toLowerCase();
      const matchSearch =
        p.id.toLowerCase().includes(q) ||
        p.order_id.toLowerCase().includes(q) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
        (p.customer_address && p.customer_address.toLowerCase().includes(q));

      if (!matchSearch) return false;
      if (filterArea !== 'ALL' && p.detected_area !== filterArea) return false;
      return true;
    });
  }, [pendingDispatches, searchPending, filterArea]);

  // Lọc danh sách chuyến giao hàng
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const q = tripSearch.toLowerCase();
      const matchSearch =
        t.trip_code.toLowerCase().includes(q) ||
        (t.area && t.area.toLowerCase().includes(q)) ||
        (t.driver_name && t.driver_name.toLowerCase().includes(q)) ||
        (t.license_plate && t.license_plate.toLowerCase().includes(q));

      if (!matchSearch) return false;
      if (tripFilterStatus !== 'ALL' && t.status !== tripFilterStatus) return false;
      return true;
    });
  }, [trips, tripSearch, tripFilterStatus]);

  // Xử lý chọn / bỏ chọn phiếu xuất
  const handleToggleSelectDispatch = (id: string) => {
    setSelectedDispatchIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllPending = () => {
    if (selectedDispatchIds.length === filteredPending.length) {
      setSelectedDispatchIds([]);
    } else {
      setSelectedDispatchIds(filteredPending.map((p) => p.id));
    }
  };

  // Gom nhanh từ Thẻ gợi ý khu vực (Smart Suggestion)
  const handleQuickGroupArea = (sug: AreaGroupingSuggestion) => {
    const idsInGroup = sug.dispatches.map((d) => d.id);
    setSelectedDispatchIds(idsInGroup);
    setCreateArea(sug.area);

    // Mặc định gợi ý tài xế đầu tiên
    const defaultD = PRESET_DRIVERS[0];
    setCreateDriverName(defaultD.name);
    setCreateDriverPhone(defaultD.phone);
    setCreateLicensePlate(defaultD.defaultVehicle);
    setCreateVehicleType(defaultD.vehicleType);

    // Đặt giờ dự kiến 4 tiếng sau
    const nowPlus4 = new Date(Date.now() + 4 * 3600 * 1000);
    setCreateExpectedTime(nowPlus4.toISOString().slice(0, 16));
    setCreateNotes(`Tuyến giao hàng ${sug.area} (Gom ${sug.dispatch_count} phiếu)`);

    setIsCreateModalOpen(true);
  };

  // Mở modal tạo chuyến từ các phiếu đã tích chọn thủ công
  const handleOpenCreateModalFromSelected = () => {
    if (selectedDispatchIds.length === 0) return;

    // Tìm khu vực chung nếu có
    const selectedObjs = pendingDispatches.filter((p) => selectedDispatchIds.includes(p.id));
    const commonArea = selectedObjs[0]?.detected_area || 'Tuyến giao hàng nội thành';
    setCreateArea(commonArea);

    const defaultD = PRESET_DRIVERS[0];
    setCreateDriverName(defaultD.name);
    setCreateDriverPhone(defaultD.phone);
    setCreateLicensePlate(defaultD.defaultVehicle);
    setCreateVehicleType(defaultD.vehicleType);

    const nowPlus4 = new Date(Date.now() + 4 * 3600 * 1000);
    setCreateExpectedTime(nowPlus4.toISOString().slice(0, 16));
    setCreateNotes(`Gom ${selectedDispatchIds.length} phiếu xuất kho theo tuyến`);

    setIsCreateModalOpen(true);
  };

  // Chọn nhanh tài xế từ danh sách mẫu
  const handleSelectPresetDriver = (d: typeof PRESET_DRIVERS[0]) => {
    setCreateDriverName(d.name);
    setCreateDriverPhone(d.phone);
    setCreateLicensePlate(d.defaultVehicle);
    setCreateVehicleType(d.vehicleType);
  };

  const handleSelectPresetDriverForAssign = (d: typeof PRESET_DRIVERS[0]) => {
    setAssignDriverName(d.name);
    setAssignDriverPhone(d.phone);
    setAssignLicensePlate(d.defaultVehicle);
    setAssignVehicleType(d.vehicleType);
  };

  // Submit Tạo chuyến giao hàng (S6-06 Subtask 8)
  const handleSubmitCreateTrip = async () => {
    if (selectedDispatchIds.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 phiếu xuất kho để gom chuyến', 'error');
      return;
    }

    try {
      setIsSubmittingCreate(true);
      const newTrip = await deliveryTripService.createTrip({
        warehouse_id: 1,
        area: createArea.trim() || undefined,
        driver_name: createDriverName.trim() || undefined,
        driver_phone: createDriverPhone.trim() || undefined,
        license_plate: createLicensePlate.trim() || undefined,
        vehicle_type: createVehicleType.trim() || undefined,
        expected_completion_time: createExpectedTime ? new Date(createExpectedTime).toISOString() : undefined,
        notes: createNotes.trim() || undefined,
        dispatch_ids: selectedDispatchIds,
      });

      showToast(`Tạo thành công chuyến giao hàng ${newTrip.trip_code} gom ${newTrip.total_points} phiếu xuất!`, 'success');
      setIsCreateModalOpen(false);
      setSelectedDispatchIds([]);
      loadData();
      setActiveTab('TRIPS'); // Chuyển sang xem danh sách chuyến
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi tạo chuyến giao hàng', 'error');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Mở modal gán / đổi tài xế & xe (S6-06 Subtask 14)
  const handleOpenAssignModal = (trip: DeliveryTrip) => {
    setTargetTrip(trip);
    setAssignDriverName(trip.driver_name || '');
    setAssignDriverPhone(trip.driver_phone || '');
    setAssignLicensePlate(trip.license_plate || '');
    setAssignVehicleType(trip.vehicle_type || 'Xe tải 1.5 Tấn');
    setAssignNotes('');
    setIsAssignModalOpen(true);
  };

  // Submit gán / đổi tài xế & xe
  const handleSubmitAssign = async () => {
    if (!targetTrip) return;

    try {
      setIsSubmittingAssign(true);
      const updated = await deliveryTripService.assignDriverAndVehicle(targetTrip.id, {
        driver_name: assignDriverName.trim() || undefined,
        driver_phone: assignDriverPhone.trim() || undefined,
        license_plate: assignLicensePlate.trim() || undefined,
        vehicle_type: assignVehicleType.trim() || undefined,
        notes: assignNotes.trim() || undefined,
      });

      showToast(`Cập nhật tài xế & phương tiện chuyến ${updated.trip_code} thành công!`, 'success');
      setIsAssignModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi phân công tài xế/xe', 'error');
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  // Xem chi tiết các điểm dừng của chuyến
  const handleOpenDetailModal = (trip: DeliveryTrip) => {
    setViewTrip(trip);
    setIsDetailModalOpen(true);
  };

  // Mở modal in danh sách điểm giao (Print Manifest) (S6-06 Subtask 18 & 20)
  const handleOpenManifestModal = async (trip: DeliveryTrip) => {
    try {
      setLoadingManifest(true);
      setIsManifestModalOpen(true);
      const data = await deliveryTripService.getManifest(trip.id);
      setManifestData(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách in điểm giao', 'error');
      setIsManifestModalOpen(false);
    } finally {
      setLoadingManifest(false);
    }
  };

  // Thực hiện in ấn
  const handleTriggerPrint = () => {
    window.print();
  };

  // Xuất bến bắt đầu chuyến
  const handleStartTrip = async (tripId: string) => {
    try {
      await deliveryTripService.startTrip(tripId);
      showToast(`Chuyến giao hàng ${tripId} đã xuất bến bắt đầu giao hàng!`, 'info');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xuất bến', 'error');
    }
  };

  // Hủy chuyến
  const handleCancelTrip = async (tripId: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy chuyến ${tripId}? Các phiếu xuất sẽ được nhả lại vào hàng đợi.`)) {
      return;
    }
    try {
      await deliveryTripService.cancelTrip(tripId);
      showToast(`Đã hủy chuyến ${tripId} và nhả lại các phiếu xuất thành công!`, 'info');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi hủy chuyến', 'error');
    }
  };

  // Helper render Badge trạng thái chuyến
  const renderTripStatusBadge = (status: string) => {
    switch (status) {
      case 'PLANNED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Chờ điều xe
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            Sẵn sàng xuất bến
          </span>
        );
      case 'IN_TRANSIT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Đang trên đường
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            Hoàn thành
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <XCircle className="w-3.5 h-3.5" />
            Đã hủy
          </span>
        );
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <PageContainer
      title="Phân Tuyến Giao Hàng & Gán Tài Xế"
      subtitle="Gom nhiều phiếu xuất kho theo khu vực, phân công tài xế & phương tiện, in lệnh điều phối giao hàng"
    >
      {/* 1. Metric Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng chuyến giao</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.totalTrips}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chờ phân xe/tài</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.planned}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sẵn sàng xuất bến</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{stats.ready}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đang trên đường</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-0.5">{stats.inTransit}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phiếu chờ gom</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.pendingCount}</p>
          </div>
        </div>
      </div>

      {/* 2. Main Tab Navigation */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-slate-700 pb-2">
        <button
          onClick={() => setActiveTab('PLANNER')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'PLANNER'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Lập Tuyến & Gom Phiếu ({stats.pendingCount})
        </button>

        <button
          onClick={() => setActiveTab('TRIPS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'TRIPS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          Danh Sách Chuyến Giao Hàng ({stats.totalTrips})
        </button>

        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới dữ liệu
          </Button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: LẬP TUYẾN & GOM CHUYẾN (PLANNER)                                */}
      {/* ==================================================================== */}
      {activeTab === 'PLANNER' && (
        <div className="space-y-6">
          {/* A. Thẻ gợi ý gom theo cụm khu vực (Smart Grouping) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Gợi Ý Gom Chuyến Tự Động Theo Tuyến Đường (Giảm Đi Lẻ)
              </h3>
              <span className="text-xs text-slate-500">
                Tự động nhận diện cụm quận/huyện từ địa chỉ khách hàng
              </span>
            </div>

            {suggestions.length === 0 ? (
              <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
                Hiện tại không có phiếu xuất kho nào chờ gom chuyến.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-800 dark:to-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                          {sug.area}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                          {sug.dispatch_count} phiếu
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>
                          <p className="text-[11px] text-slate-400">Tổng kiện hàng:</p>
                          <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                            {sug.total_packages} sản phẩm
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">Ước tính tiền hàng:</p>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {formatCurrency(sug.total_value)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-1.5 flex-wrap">
                        {sug.dispatches.slice(0, 3).map((d) => (
                          <span
                            key={d.id}
                            className="text-[11px] font-mono px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300"
                          >
                            {d.id}
                          </span>
                        ))}
                        {sug.dispatches.length > 3 && (
                          <span className="text-[11px] text-slate-400 font-semibold">
                            +{sug.dispatches.length - 3} nữa
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full justify-center"
                        onClick={() => handleQuickGroupArea(sug)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Gom nhanh tuyến này ({sug.dispatch_count} phiếu)
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* B. Bảng danh sách phiếu xuất kho chờ điều phối */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-500" />
                  Danh Sách Phiếu Xuất Kho Chờ Lên Chuyến
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tích chọn các phiếu xuất kho để ghép thành một chuyến xe chạy vòng
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Lọc theo khu vực */}
                <select
                  value={filterArea}
                  onChange={(e) => setFilterArea(e.target.value)}
                  className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">Tất cả khu vực ({pendingDispatches.length})</option>
                  {suggestions.map((s, idx) => (
                    <option key={idx} value={s.area}>
                      {s.area} ({s.dispatch_count} phiếu)
                    </option>
                  ))}
                </select>

                {/* Tìm kiếm */}
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm mã PXK, đơn ORD, đại lý..."
                    value={searchPending}
                    onChange={(e) => setSearchPending(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredPending.length > 0 &&
                          selectedDispatchIds.length === filteredPending.length
                        }
                        onChange={handleSelectAllPending}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="py-3 px-4">Mã phiếu xuất</th>
                    <th className="py-3 px-4">Đơn hàng gốc</th>
                    <th className="py-3 px-4">Khách hàng / Đại lý</th>
                    <th className="py-3 px-4">Địa chỉ giao hàng</th>
                    <th className="py-3 px-4">Khu vực tuyến đường</th>
                    <th className="py-3 px-4 text-center">Số lượng xuất</th>
                    <th className="py-3 px-4 text-right">Giá trị đơn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                        Đang tải danh sách phiếu xuất...
                      </td>
                    </tr>
                  ) : filteredPending.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        Không có phiếu xuất nào phù hợp bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredPending.map((p) => {
                      const isSelected = selectedDispatchIds.includes(p.id);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => handleToggleSelectDispatch(p.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/30 font-medium'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-700/30'
                          }`}
                        >
                          <td
                            className="py-3 px-4 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectDispatch(p.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {p.id}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                            {p.order_id}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            {p.customer_name || p.customer_id}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                            {p.customer_address || 'Chưa có địa chỉ'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {p.detected_area || 'Chưa phân vùng'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                            {p.total_dispatched_quantity} cái
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(p.order_total_value)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* C. Thanh Floating Action Bar khi có phiếu được chọn */}
          {selectedDispatchIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-6 border border-slate-700/50 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm">
                  {selectedDispatchIds.length}
                </span>
                <span className="text-xs font-semibold">
                  Phiếu xuất kho đã được chọn gom vào chuyến
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedDispatchIds([])}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-900 transition-colors"
                >
                  Bỏ chọn
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenCreateModalFromSelected}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Tạo Chuyến Giao Hàng & Gán Xe
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: QUẢN LÝ CHUYẾN GIAO HÀNG (TRIPS)                              */}
      {/* ==================================================================== */}
      {activeTab === 'TRIPS' && (
        <div className="space-y-6">
          {/* Bộ lọc chuyến */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setTripFilterStatus('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  tripFilterStatus === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
                }`}
              >
                Tất cả ({trips.length})
              </button>
              <button
                onClick={() => setTripFilterStatus('PLANNED')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  tripFilterStatus === 'PLANNED'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-600 hover:bg-amber-50'
                }`}
              >
                Chờ điều xe ({stats.planned})
              </button>
              <button
                onClick={() => setTripFilterStatus('READY')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  tripFilterStatus === 'READY'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-600 hover:bg-blue-50'
                }`}
              >
                Sẵn sàng ({stats.ready})
              </button>
              <button
                onClick={() => setTripFilterStatus('IN_TRANSIT')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  tripFilterStatus === 'IN_TRANSIT'
                    ? 'bg-purple-600 text-white'
                    : 'text-purple-600 hover:bg-purple-50'
                }`}
              >
                Đang giao ({stats.inTransit})
              </button>
              <button
                onClick={() => setTripFilterStatus('COMPLETED')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  tripFilterStatus === 'COMPLETED'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                Hoàn thành ({stats.completed})
              </button>
            </div>

            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã chuyến, tài xế, biển số xe..."
                value={tripSearch}
                onChange={(e) => setTripSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Bảng chuyến giao */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Mã chuyến</th>
                    <th className="py-3 px-4">Khu vực / Tuyến đường</th>
                    <th className="py-3 px-4">Tài xế phân công</th>
                    <th className="py-3 px-4">Phương tiện & Biển số</th>
                    <th className="py-3 px-4 text-center">Số điểm dừng</th>
                    <th className="py-3 px-4 text-center">Số kiện hàng</th>
                    <th className="py-3 px-4">Trạng thái chuyến</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                        Đang tải danh sách chuyến giao...
                      </td>
                    </tr>
                  ) : filteredTrips.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Không có chuyến giao hàng nào phù hợp bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredTrips.map((tr) => (
                      <tr
                        key={tr.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {tr.trip_code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {tr.area || 'Chưa định tuyến'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {tr.driver_name ? (
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                {tr.driver_name}
                              </p>
                              {tr.driver_phone && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-2.5 h-2.5" />
                                  {tr.driver_phone}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-600 italic">Chưa gán tài xế</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {tr.license_plate ? (
                            <div>
                              <span className="font-mono font-bold bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
                                {tr.license_plate}
                              </span>
                              <span className="text-[11px] text-slate-500 block mt-0.5">
                                {tr.vehicle_type || 'Xe tải'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-amber-600 italic">Chưa gán xe</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                          {tr.total_points} điểm
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                          {tr.total_packages} cái
                        </td>
                        <td className="py-3 px-4">
                          {renderTripStatusBadge(tr.status)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Nút Xem hành trình stops */}
                            <button
                              onClick={() => handleOpenDetailModal(tr)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                              title="Xem chi tiết các điểm giao"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>

                            {/* Nút Gán / Đổi tài xế & xe */}
                            {tr.status !== 'COMPLETED' && tr.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleOpenAssignModal(tr)}
                                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 rounded-lg transition-all"
                                title="Gán hoặc đổi tài xế, phương tiện"
                              >
                                {tr.driver_name ? 'Đổi tài xế/xe' : 'Gán tài xế & xe'}
                              </button>
                            )}

                            {/* Nút In lệnh điều phối & danh sách điểm giao (Print Manifest) */}
                            <button
                              onClick={() => handleOpenManifestModal(tr)}
                              className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-all flex items-center gap-1"
                              title="In danh sách điểm giao cho tài xế mang theo"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              In danh sách
                            </button>

                            {/* Nút Xuất bến */}
                            {tr.status === 'READY' && (
                              <button
                                onClick={() => handleStartTrip(tr.id)}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all"
                                title="Xác nhận xe đã rời kho bắt đầu giao hàng"
                              >
                                Xuất bến
                              </button>
                            )}

                            {/* Nút Hủy chuyến */}
                            {(tr.status === 'PLANNED' || tr.status === 'READY') && (
                              <button
                                onClick={() => handleCancelTrip(tr.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hủy chuyến và nhả phiếu xuất"
                              >
                                <XCircle className="w-4 h-4" />
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: TẠO CHUYẾN GIAO HÀNG MỚI (S6-06 SUBTASK 8)                  */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Tạo Chuyến Giao Hàng & Phân Tuyến"
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-indigo-950 dark:text-indigo-200">
                Gom {selectedDispatchIds.length} phiếu xuất kho vào chuyến xe
              </p>
              <p className="text-indigo-700 dark:text-indigo-400 mt-0.5">
                Các phiếu xuất sẽ được gán vào chuyến này và xe chạy một vòng theo thứ tự giao
              </p>
            </div>
            <span className="font-mono font-bold text-indigo-600 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-indigo-200">
              {selectedDispatchIds.length} Điểm dừng
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Khu vực / Tuyến đường giao hàng *
              </label>
              <input
                type="text"
                value={createArea}
                onChange={(e) => setCreateArea(e.target.value)}
                placeholder="e.g. Tuyến Cầu Giấy - Ba Đình"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thời gian dự kiến hoàn thành
              </label>
              <input
                type="datetime-local"
                value={createExpectedTime}
                onChange={(e) => setCreateExpectedTime(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Chọn nhanh tài xế gợi ý */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Phân công Tài xế & Phương tiện</span>
              <span className="text-[11px] font-normal text-slate-400">Chọn nhanh tài xế có sẵn:</span>
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {PRESET_DRIVERS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectPresetDriver(d)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all whitespace-nowrap text-left ${
                    createDriverName === d.name
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-[10px] text-slate-400">{d.defaultVehicle}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Họ tên tài xế
              </label>
              <input
                type="text"
                value={createDriverName}
                onChange={(e) => setCreateDriverName(e.target.value)}
                placeholder="e.g. Nguyễn Văn Hùng"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Số điện thoại tài xế
              </label>
              <input
                type="text"
                value={createDriverPhone}
                onChange={(e) => setCreateDriverPhone(e.target.value)}
                placeholder="e.g. 0981122334"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Biển số xe
              </label>
              <input
                type="text"
                value={createLicensePlate}
                onChange={(e) => setCreateLicensePlate(e.target.value)}
                placeholder="e.g. 29C-123.45"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Loại phương tiện
              </label>
              <select
                value={createVehicleType}
                onChange={(e) => setCreateVehicleType(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Xe tải 1.25 Tấn">Xe tải 1.25 Tấn</option>
                <option value="Xe tải 1.5 Tấn">Xe tải 1.5 Tấn</option>
                <option value="Xe tải 2.5 Tấn">Xe tải 2.5 Tấn</option>
                <option value="Xe tải 3.5 Tấn">Xe tải 3.5 Tấn</option>
                <option value="Xe tải 5.0 Tấn">Xe tải 5.0 Tấn</option>
                <option value="Xe bán tải">Xe bán tải</option>
                <option value="Xe máy chuyên dụng">Xe máy chuyên dụng</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ghi chú điều phối
            </label>
            <textarea
              rows={2}
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
              placeholder="Ghi chú tuyến đường, dặn dò tài xế thu tiền hoặc kiểm tra biên bản..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmittingCreate}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitCreateTrip}
              disabled={isSubmittingCreate}
            >
              {isSubmittingCreate ? 'Đang tạo chuyến...' : 'Xác nhận tạo chuyến'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 2: GÁN / ĐỔI TÀI XẾ & XE (S6-06 SUBTASK 14)                    */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Phân Công Tài Xế & Phương Tiện - ${targetTrip?.trip_code}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Cập nhật, thay đổi hoặc bỏ gán tài xế và phương tiện cho chuyến giao hàng.
          </p>

          {/* Chọn nhanh */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Gợi ý tài xế có sẵn:
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {PRESET_DRIVERS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectPresetDriverForAssign(d)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all whitespace-nowrap text-left ${
                    assignDriverName === d.name
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-[10px] text-slate-400">{d.defaultVehicle}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên tài xế
              </label>
              <input
                type="text"
                value={assignDriverName}
                onChange={(e) => setAssignDriverName(e.target.value)}
                placeholder="Để trống nếu bỏ gán"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SĐT tài xế
              </label>
              <input
                type="text"
                value={assignDriverPhone}
                onChange={(e) => setAssignDriverPhone(e.target.value)}
                placeholder="SĐT"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Biển số xe
              </label>
              <input
                type="text"
                value={assignLicensePlate}
                onChange={(e) => setAssignLicensePlate(e.target.value)}
                placeholder="Để trống nếu bỏ gán"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại phương tiện
              </label>
              <input
                type="text"
                value={assignVehicleType}
                onChange={(e) => setAssignVehicleType(e.target.value)}
                placeholder="Loại xe"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do thay đổi / Ghi chú
            </label>
            <input
              type="text"
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="e.g. Đổi xe do xe cũ đang bảo dưỡng"
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAssignModalOpen(false)}
              disabled={isSubmittingAssign}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitAssign}
              disabled={isSubmittingAssign}
            >
              {isSubmittingAssign ? 'Đang lưu...' : 'Lưu phân công'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 3: XEM CHI TIẾT ĐIỂM GIAO CỦA CHUYẾN (S6-06 SUBTASK 16)        */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Chi Tiết Lộ Trình Điểm Dừng - ${viewTrip?.trip_code}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-xs">
            <div>
              <p className="text-slate-400">Tuyến đường:</p>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">{viewTrip?.area || 'Nội thành'}</p>
            </div>
            <div>
              <p className="text-slate-400">Tài xế:</p>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">{viewTrip?.driver_name || 'Chưa gán'}</p>
            </div>
            <div>
              <p className="text-slate-400">Phương tiện:</p>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">{viewTrip?.license_plate || 'Chưa gán'}</p>
            </div>
            <div>
              <p className="text-slate-400">Trạng thái:</p>
              <div className="mt-0.5">{viewTrip && renderTripStatusBadge(viewTrip.status)}</div>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-bold text-slate-900 dark:text-white mb-2">
              Danh sách thứ tự các điểm giao (Lộ trình di chuyển):
            </h5>
            <div className="space-y-2.5">
              {viewTrip?.points?.map((pt) => (
                <div
                  key={pt.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-start gap-3"
                >
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {pt.stop_order}
                  </span>
                  <div className="flex-1 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {pt.customer_name}
                      </p>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                        {pt.dispatch_id}
                      </span>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {pt.delivery_address || 'Chưa có địa chỉ'}
                    </p>

                    <div className="flex items-center gap-4 text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {pt.contact_phone || 'N/A'}
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {pt.total_items_count} sản phẩm
                      </span>
                      <span>•</span>
                      <span className="text-emerald-600 font-semibold">
                        {formatCurrency(pt.point_value)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-700">
            <Button variant="secondary" size="sm" onClick={() => setIsDetailModalOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 4: IN LỆNH ĐIỀU PHỐI & DANH SÁCH ĐIỂM GIAO (S6-06 SUBTASK 18/20) */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isManifestModalOpen}
        onClose={() => setIsManifestModalOpen(false)}
        title="Lệnh Điều Phối & Bảng Kê Điểm Giao Hàng (In ấn)"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex justify-end gap-2 pb-2 border-b border-slate-200 dark:border-slate-700 print:hidden">
            <Button variant="secondary" size="sm" onClick={() => setIsManifestModalOpen(false)}>
              Đóng
            </Button>
            <Button variant="primary" size="sm" onClick={handleTriggerPrint}>
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              In Bảng Kê (A4)
            </Button>
          </div>

          {loadingManifest || !manifestData ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
              Đang tổng hợp dữ liệu in ấn...
            </div>
          ) : (
            <div
              ref={printAreaRef}
              className="p-6 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm print:p-0 print:border-none print:shadow-none font-sans text-xs"
            >
              {/* Header phiếu in */}
              <div className="border-b-2 border-slate-900 pb-4 mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
                      HỆ THỐNG BÁN HÀNG & PHÂN PHỐI KHO VẬN
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      Kho xuất phát: {manifestData.warehouse_name || `Kho #${manifestData.warehouse_id}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Mã chuyến giao hàng:</p>
                    <p className="font-mono font-bold text-sm text-slate-900">
                      {manifestData.trip_code}
                    </p>
                  </div>
                </div>

                <div className="text-center mt-4">
                  <h1 className="text-lg font-black uppercase tracking-widest text-slate-900">
                    BẢNG KÊ ĐIỀU PHỐI & DANH SÁCH ĐIỂM GIAO HÀNG
                  </h1>
                  <p className="text-xs text-slate-600 italic mt-0.5">
                    (Tài xế mang theo đối soát và xin chữ ký người nhận tại từng điểm giao)
                  </p>
                </div>
              </div>

              {/* Thông tin chuyến & tài xế */}
              <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <p className="mb-1">
                    <span className="font-bold">Khu vực / Tuyến đường:</span>{' '}
                    {manifestData.area || 'Tuyến nội thành'}
                  </p>
                  <p className="mb-1">
                    <span className="font-bold">Họ tên tài xế:</span>{' '}
                    {manifestData.driver_name || '...........................................'}
                  </p>
                  <p>
                    <span className="font-bold">Số điện thoại liên hệ:</span>{' '}
                    {manifestData.driver_phone || '...........................................'}
                  </p>
                </div>
                <div>
                  <p className="mb-1">
                    <span className="font-bold">Phương tiện vận chuyển:</span>{' '}
                    {manifestData.vehicle_type || 'Xe tải'}
                  </p>
                  <p className="mb-1">
                    <span className="font-bold">Biển số xe:</span>{' '}
                    <span className="font-mono font-bold">{manifestData.license_plate || '...................'}</span>
                  </p>
                  <p>
                    <span className="font-bold">Tổng số điểm giao:</span>{' '}
                    <span className="font-bold">{manifestData.total_stops} điểm</span> ({manifestData.total_packages} sản phẩm)
                  </p>
                </div>
              </div>

              {/* Bảng danh sách điểm giao */}
              <table className="w-full border-collapse border border-slate-300 text-[11px] mb-6">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold text-center">
                    <th className="border border-slate-300 p-2 w-8">STT</th>
                    <th className="border border-slate-300 p-2 w-28">Mã PXK / Đơn</th>
                    <th className="border border-slate-300 p-2 text-left">Người nhận / Đại lý</th>
                    <th className="border border-slate-300 p-2 text-left w-52">Địa chỉ giao hàng</th>
                    <th className="border border-slate-300 p-2 w-24">Số ĐT</th>
                    <th className="border border-slate-300 p-2 w-16 text-center">Số lượng</th>
                    <th className="border border-slate-300 p-2 w-24 text-right">Tiền hàng</th>
                    <th className="border border-slate-300 p-2 w-24">Ký nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {manifestData.stops.map((st) => (
                    <tr key={st.point_id}>
                      <td className="border border-slate-300 p-2 text-center font-bold">
                        {st.stop_order}
                      </td>
                      <td className="border border-slate-300 p-2 font-mono text-[10px]">
                        <div>{st.dispatch_id}</div>
                        <div className="text-slate-500">{st.order_id}</div>
                      </td>
                      <td className="border border-slate-300 p-2 font-bold">
                        {st.customer_name}
                      </td>
                      <td className="border border-slate-300 p-2">
                        {st.delivery_address || 'N/A'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-mono font-bold">
                        {st.contact_phone || 'N/A'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold">
                        {st.total_items_count}
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-medium">
                        {formatCurrency(st.point_value)}
                      </td>
                      <td className="border border-slate-300 p-2 text-center text-slate-300 text-[9px]">
                        (Ký & ghi rõ họ tên)
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={5} className="border border-slate-300 p-2 text-right">
                      TỔNG CỘNG CHUYẾN GIAO:
                    </td>
                    <td className="border border-slate-300 p-2 text-center font-black">
                      {manifestData.total_packages}
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-black text-slate-900">
                      {formatCurrency(manifestData.total_trip_value)}
                    </td>
                    <td className="border border-slate-300 p-2"></td>
                  </tr>
                </tbody>
              </table>

              {/* Chữ ký xác nhận bàn giao */}
              <div className="grid grid-cols-3 text-center pt-4 text-xs font-bold text-slate-800">
                <div>
                  <p className="uppercase">Người Lập Phiếu</p>
                  <p className="text-[10px] font-normal text-slate-500 italic mt-0.5">(Ký & ghi rõ họ tên)</p>
                  <div className="h-16" />
                </div>
                <div>
                  <p className="uppercase">Thủ Kho Xuất Hàng</p>
                  <p className="text-[10px] font-normal text-slate-500 italic mt-0.5">(Ký & ghi rõ họ tên)</p>
                  <div className="h-16" />
                </div>
                <div>
                  <p className="uppercase">Tài Xế Nhận Hàng</p>
                  <p className="text-[10px] font-normal text-slate-500 italic mt-0.5">(Ký & ghi rõ họ tên)</p>
                  <div className="h-16" />
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
};
