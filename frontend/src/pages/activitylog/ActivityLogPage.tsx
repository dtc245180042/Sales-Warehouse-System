import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  Clock,
  Wifi,
  ChevronDown,
  Loader2,
  Laptop,
  Smartphone,
  Tablet,
  LogIn,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import {
  ActivityLog,
  ActivityAction,
  ActivityModule,
  ActivityStatus,
} from '../../types/ActivityLog';
import {
  fetchAuditLogs,
  fetchAuditStats,
  exportAuditLogsExcel,
  AuditLogStatsData,
} from '../../services/auditLogService';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_ACTIONS: { value: ActivityAction | ''; label: string }[] = [
  { value: '', label: 'Tất cả hành động' },
  { value: 'LOGIN', label: 'Đăng nhập' },
  { value: 'LOGOUT', label: 'Đăng xuất' },
  { value: 'CREATE', label: 'Tạo mới' },
  { value: 'UPDATE', label: 'Cập nhật' },
  { value: 'DELETE', label: 'Xóa' },
  { value: 'VIEW', label: 'Xem' },
  { value: 'EXPORT', label: 'Xuất dữ liệu' },
  { value: 'IMPORT', label: 'Nhập dữ liệu' },
  { value: 'APPROVE', label: 'Phê duyệt' },
  { value: 'REJECT', label: 'Từ chối' },
  { value: 'LOCK', label: 'Khóa' },
  { value: 'UNLOCK', label: 'Mở khóa' },
  { value: 'RESET_PASSWORD', label: 'Đặt lại mật khẩu' },
  { value: 'ASSIGN_ROLE', label: 'Phân quyền' },
  { value: 'CHANGE_STATUS', label: 'Đổi trạng thái' },
];

const ALL_MODULES: { value: ActivityModule | ''; label: string }[] = [
  { value: '', label: 'Tất cả module' },
  { value: 'AUTH', label: 'Xác thực' },
  { value: 'USER_MANAGEMENT', label: 'Quản lý người dùng' },
  { value: 'PRODUCT', label: 'Sản phẩm' },
  { value: 'INVENTORY', label: 'Kho hàng' },
  { value: 'ORDER', label: 'Đơn hàng' },
  { value: 'CUSTOMER', label: 'Khách hàng' },
  { value: 'SUPPLIER', label: 'Nhà cung cấp' },
  { value: 'REPORT', label: 'Báo cáo' },
  { value: 'SETTINGS', label: 'Cài đặt' },
];

const ALL_STATUSES: { value: ActivityStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'success', label: 'Thành công' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'warning', label: 'Cảnh báo' },
];

const PAGE_SIZES = [10, 20, 50];

// ─── Sub-components (defined outside the main component) ─────────────────────

interface StatusBadgeProps {
  status: ActivityStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Thành công
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
        <XCircle className="w-3.5 h-3.5" />
        Thất bại
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
      <AlertTriangle className="w-3.5 h-3.5" />
      Cảnh báo
    </span>
  );
};

interface ActionBadgeProps {
  action: ActivityAction;
}

const ActionBadge: React.FC<ActionBadgeProps> = ({ action }) => {
  const config: Record<ActivityAction, { label: string; className: string }> = {
    LOGIN:          { label: 'Đăng nhập',      className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
    LOGOUT:         { label: 'Đăng xuất',      className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
    CREATE:         { label: 'Tạo mới',        className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
    UPDATE:         { label: 'Cập nhật',       className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
    DELETE:         { label: 'Xóa',            className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
    VIEW:           { label: 'Xem',            className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700' },
    EXPORT:         { label: 'Xuất DL',        className: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' },
    IMPORT:         { label: 'Nhập DL',        className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
    APPROVE:        { label: 'Duyệt',          className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
    REJECT:         { label: 'Từ chối',        className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800' },
    LOCK:           { label: 'Khóa TK',        className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
    UNLOCK:         { label: 'Mở khóa',        className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800' },
    RESET_PASSWORD: { label: 'Reset mật khẩu', className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
    ASSIGN_ROLE:    { label: 'Phân quyền',     className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800' },
    CHANGE_STATUS:  { label: 'Đổi TT',         className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  };
  const cfg = config[action];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
};

interface ModuleBadgeProps {
  module: ActivityModule;
}

const ModuleBadge: React.FC<ModuleBadgeProps> = ({ module }) => {
  const labels: Record<ActivityModule, string> = {
    AUTH:            'Xác thực',
    USER_MANAGEMENT: 'Người dùng',
    PRODUCT:         'Sản phẩm',
    INVENTORY:       'Kho hàng',
    ORDER:           'Đơn hàng',
    CUSTOMER:        'Khách hàng',
    SUPPLIER:        'Nhà cung cấp',
    REPORT:          'Báo cáo',
    SETTINGS:        'Cài đặt',
  };
  return (
    <Badge variant="neutral" size="sm">
      {labels[module]}
    </Badge>
  );
};

interface DeviceIconProps {
  device?: string;
  className?: string;
}

const DeviceIcon: React.FC<DeviceIconProps> = ({ device, className = 'w-3.5 h-3.5' }) => {
  const d = (device || '').toLowerCase();
  if (d.includes('điện thoại') || d.includes('mobile') || d.includes('iphone') || d.includes('android')) {
    return <Smartphone className={`${className} text-indigo-500 shrink-0`} />;
  }
  if (d.includes('máy tính bảng') || d.includes('tablet') || d.includes('ipad')) {
    return <Tablet className={`${className} text-indigo-500 shrink-0`} />;
  }
  return <Laptop className={`${className} text-indigo-500 shrink-0`} />;
};

interface DetailDrawerProps {
  log: ActivityLog | null;
  onClose: () => void;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({ log, onClose }) => {
  if (!log) return null;

  const formatDateTime = (ts: string) => {
    if (log?.metadata?.['Thời điểm đăng nhập']) {
      return String(log.metadata['Thời điểm đăng nhập']);
    }
    if (log?.metadata?.['Thời điểm đăng xuất']) {
      return String(log.metadata['Thời điểm đăng xuất']);
    }
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const time = d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const date = d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return `${time} ngày ${date}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Chi tiết nhật ký">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-slide-right">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
              <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Chi tiết nhật ký</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{log.id}</p>
            </div>
          </div>
          <button
            id={`drawer-close-${log.id}`}
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status + Action */}
          <div className="flex items-center gap-3">
            <StatusBadge status={log.status} />
            <ActionBadge action={log.action} />
            <ModuleBadge module={log.module} />
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            {log.userAvatar ? (
              <img src={log.userAvatar} alt={log.userName} className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-700 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{log.userName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{log.userRole} · {log.userId}</p>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <DrawerField icon={<Clock className="w-4 h-4" />} label="Thời gian" value={formatDateTime(log.timestamp)} />
            <DrawerField
              icon={<DeviceIcon device={log.device} className="w-4 h-4" />}
              label="Thiết bị thao tác"
              value={log.device || 'Trình duyệt Web'}
            />
            <DrawerField icon={<Wifi className="w-4 h-4" />} label="Địa chỉ IP" value={log.ipAddress} mono />
            <DrawerField icon={<History className="w-4 h-4" />} label="Đối tượng tác động" value={log.target} />
          </div>

          {/* Description */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mô tả</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{log.detail}</p>
          </div>

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dữ liệu bổ sung</p>
              <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 space-y-1">
                {Object.entries(log.metadata).map(([key, val]) => (
                  <div key={key} className="flex justify-between gap-4 text-xs font-mono">
                    <span className="text-slate-400">{key}:</span>
                    <span className="text-emerald-400 text-right truncate">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface DrawerFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}

const DrawerField: React.FC<DrawerFieldProps> = ({ icon, label, value, mono = false }) => (
  <div className="flex items-start gap-3">
    <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-sm font-medium text-slate-800 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  </div>
);

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, colorClass }) => (
  <div className={`flex items-center gap-3 p-4 rounded-xl border ${colorClass}`}>
    <div className="shrink-0">{icon}</div>
    <div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const ActivityLogPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterAction, setFilterAction] = useState<ActivityAction | ''>('');
  const [filterModule, setFilterModule] = useState<ActivityModule | ''>('');
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);

  // Dữ liệu từ Server
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<AuditLogStatsData>({
    total: 0,
    success: 0,
    failed: 0,
    warning: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Debounce tìm kiếm từ khóa 300ms chống nghẽn máy khách và server
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Tải nhật ký từ máy chủ (Server-side Pagination & Filtering)
  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchAuditLogs({
        page: currentPage,
        pageSize: pageSize,
        search: debouncedSearch,
        action: filterAction || undefined,
        entityType: filterModule || undefined,
        status: filterStatus || undefined,
        username: filterUser || undefined,
        startDate: filterDateFrom || undefined,
        endDate: filterDateTo || undefined,
        sortDesc: sortDesc,
      });

      setLogs(res.items);
      setTotalRecords(res.total);
      setTotalPages(res.totalPages);
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err) {
      console.error('Lỗi khi tải nhật ký thao tác:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    debouncedSearch,
    filterAction,
    filterModule,
    filterStatus,
    filterUser,
    filterDateFrom,
    filterDateTo,
    sortDesc,
  ]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Nạp thống kê tổng quan
  useEffect(() => {
    fetchAuditStats().then(setStats).catch(() => {});
  }, []);

  // Xử lý Xuất file Excel / CSV trực tiếp từ máy chủ
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportAuditLogsExcel({
        search: debouncedSearch,
        action: filterAction || undefined,
        entityType: filterModule || undefined,
        status: filterStatus || undefined,
        username: filterUser || undefined,
        startDate: filterDateFrom || undefined,
        endDate: filterDateTo || undefined,
        sortDesc: sortDesc,
      });
    } catch (err) {
      console.error('Lỗi khi xuất file Excel:', err);
      alert('Không thể xuất file Excel. Vui lòng kiểm tra lại đường truyền mạng.');
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    filterAction || filterModule || filterStatus || filterUser || filterDateFrom || filterDateTo;

  const resetFilters = () => {
    setFilterAction('');
    setFilterModule('');
    setFilterStatus('');
    setFilterUser('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const formatDateTime = (ts: string, logItem?: ActivityLog) => {
    if (logItem?.metadata?.['Thời điểm đăng nhập']) {
      const parts = String(logItem.metadata['Thời điểm đăng nhập']).split(' ngày ');
      if (parts.length === 2) {
        return { time: parts[0], date: parts[1] };
      }
    }
    if (logItem?.metadata?.['Thời điểm đăng xuất']) {
      const parts = String(logItem.metadata['Thời điểm đăng xuất']).split(' ngày ');
      if (parts.length === 2) {
        return { time: parts[0], date: parts[1] };
      }
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return { date: ts, time: '' };
    return {
      date: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  };

  return (
    <div className="space-y-6 max-w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <History className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Nhật ký thao tác</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 ml-12">
            Theo dõi toàn bộ hoạt động của người dùng trong hệ thống (Lọc trực tiếp từ máy chủ)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="activity-log-refresh"
            onClick={() => {
              loadLogs();
              fetchAuditStats().then(setStats).catch(() => {});
            }}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
          <button
            id="activity-log-export"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25 transition-colors disabled:opacity-60"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{isExporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* Stats Row */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Tổng nhật ký"
          value={stats.total}
          icon={<History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          colorClass="bg-indigo-50 border-indigo-100 text-indigo-800 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-200"
        />
        <StatCard
          label="Thành công"
          value={stats.success}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          colorClass="bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200"
        />
        <StatCard
          label="Thất bại"
          value={stats.failed}
          icon={<XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
          colorClass="bg-rose-50 border-rose-100 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200"
        />
        <StatCard
          label="Cảnh báo"
          value={stats.warning}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          colorClass="bg-amber-50 border-amber-100 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200"
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="activity-log-search"
              type="text"
              placeholder="Tìm kiếm theo mô tả, đối tượng, người dùng, IP..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          {/* Quick status filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['', 'success', 'failed', 'warning'] as const).map((s) => (
              <button
                key={s || 'all'}
                id={`filter-status-${s || 'all'}`}
                onClick={() => { setFilterStatus(s); setCurrentPage(1); }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  filterStatus === s
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {s === '' ? 'Tất cả trạng thái' : s === 'success' ? 'Thành công' : s === 'failed' ? 'Thất bại' : 'Cảnh báo'}
              </button>
            ))}

            {/* Quick Auth Filter (Đăng nhập / Đăng xuất) */}
            <button
              id="filter-quick-auth"
              onClick={() => {
                if (filterModule === 'AUTH') {
                  setFilterModule('');
                } else {
                  setFilterModule('AUTH');
                }
                setCurrentPage(1);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterModule === 'AUTH'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Đăng nhập / Đăng xuất
            </button>
          </div>

          {/* Advanced filter toggle */}
          <button
            id="activity-log-filter-toggle"
            onClick={() => setIsFilterOpen((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              hasActiveFilters
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Filter className="w-4 h-4" />
            Bộ lọc
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Reset */}
          {(hasActiveFilters || searchQuery) && (
            <button
              id="activity-log-filter-reset"
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
              Xóa lọc
            </button>
          )}
        </div>

        {/* Advanced filter panel */}
        {isFilterOpen && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-4">
              {/* Action filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Hành động
                </label>
                <select
                  id="filter-action"
                  value={filterAction}
                  onChange={(e) => { setFilterAction(e.target.value as ActivityAction | ''); setCurrentPage(1); }}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {ALL_ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              {/* Module filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Module
                </label>
                <select
                  id="filter-module"
                  value={filterModule}
                  onChange={(e) => { setFilterModule(e.target.value as ActivityModule | ''); setCurrentPage(1); }}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {ALL_MODULES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Trạng thái
                </label>
                <select
                  id="filter-status-select"
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value as ActivityStatus | ''); setCurrentPage(1); }}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Date from */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Từ ngày
                </label>
                <input
                  id="filter-date-from"
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => { setFilterDateFrom(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Date to */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Đến ngày
                </label>
                <input
                  id="filter-date-to"
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => { setFilterDateTo(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* User filter */}
            <div className="mt-3 max-w-sm space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Người dùng
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="filter-user"
                  type="text"
                  placeholder="Nhập tên người dùng..."
                  value={filterUser}
                  onChange={(e) => { setFilterUser(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table header bar */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hiển thị <span className="font-semibold text-slate-700 dark:text-slate-200">{totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, totalRecords)}</span> trong tổng số <span className="font-semibold text-slate-700 dark:text-slate-200">{totalRecords.toLocaleString()}</span> bản ghi
          </p>
          <button
            id="activity-log-sort-toggle"
            onClick={() => { setSortDesc((v) => !v); setCurrentPage(1); }}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            {sortDesc ? 'Mới nhất trước' : 'Cũ nhất trước'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3.5 whitespace-nowrap">Thời gian</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Người dùng</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Hành động</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Module</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Đối tượng / Mô tả</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Thiết bị & IP</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                // Skeleton loading state
                Array.from({ length: Math.min(pageSize, 8) }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-1.5" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                        <div>
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1" />
                          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-md w-16" />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-md w-20" />
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-44 mb-1" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-56" />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-20" />
                    </td>
                  </tr>
                ))
              ) : logs.length > 0 ? (
                logs.map((log) => {
                  const { date, time } = formatDateTime(log.timestamp, log);
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 cursor-pointer transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{time}</p>
                        <p className="text-xs text-slate-400">{date}</p>
                      </td>

                      {/* User */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {log.userAvatar ? (
                            <img src={log.userAvatar} alt={log.userName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-indigo-600" />
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[120px] truncate" title={log.userName}>
                              {log.userName.split('(')[0].trim()}
                            </p>
                            <p className="text-xs text-slate-400">{log.userRole}</p>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <ActionBadge action={log.action} />
                      </td>

                      {/* Module */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <ModuleBadge module={log.module} />
                      </td>

                      {/* Target + Detail */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate" title={log.target}>
                          {log.target}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5" title={log.detail}>
                          {log.detail}
                        </p>
                      </td>

                      {/* Device & IP */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                          <DeviceIcon device={log.device} />
                          <span className="max-w-[150px] truncate" title={log.device || 'Trình duyệt Web'}>
                            {log.device || 'Trình duyệt Web'}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-slate-400 mt-0.5 pl-5">{log.ipAddress}</p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge status={log.status} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <History className="w-7 h-7 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">Không tìm thấy nhật ký</p>
                        <p className="text-sm text-slate-400 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                      </div>
                      <button
                        onClick={resetFilters}
                        className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Xóa bộ lọc
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalRecords > 0 && (
          <div className="px-4 py-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>Hiển thị</span>
              <select
                id="activity-log-page-size"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span>trong tổng số {totalRecords.toLocaleString()} bản ghi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                id="activity-log-prev-page"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoading}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">Trang {currentPage} / {totalPages}</span>
              <button
                id="activity-log-next-page"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <DetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};

export default ActivityLogPage;
