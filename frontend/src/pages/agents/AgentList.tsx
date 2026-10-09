import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  Users,
  MapPin,
  Phone,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  UserCheck,
  Building2,
  DollarSign,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { agentService } from '../../services/agentService';
import { Agent, AgentStatus, AgentGroup } from '../../types/Agent';
import { useToast } from '../../contexts/ToastContext';

// ─── Hằng số cấu hình ───────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const REGION_OPTIONS = ['Tất cả', 'Miền Nam', 'Miền Bắc', 'Miền Trung'];

const GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả nhóm' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'standard', label: 'Standard' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'inactive', label: 'Tạm ngưng' },
  { value: 'pending', label: 'Chờ duyệt' },
];

const GROUP_CONFIG: Record<AgentGroup, { label: string; variant: 'warning' | 'primary' | 'info' | 'neutral' }> = {
  platinum: { label: 'Platinum', variant: 'warning' },
  gold: { label: 'Gold', variant: 'primary' },
  silver: { label: 'Silver', variant: 'info' },
  standard: { label: 'Standard', variant: 'neutral' },
};

const STATUS_CONFIG: Record<AgentStatus, { label: string; variant: 'success' | 'danger' | 'warning' }> = {
  active: { label: 'Hoạt động', variant: 'success' },
  inactive: { label: 'Tạm ngưng', variant: 'danger' },
  pending: { label: 'Chờ duyệt', variant: 'warning' },
};

// ─── Component chính ─────────────────────────────────────────────────────────

export const AgentList: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Đọc tất cả state từ URL (SCRUM-470: đồng bộ URL ↔ State) ──
  const urlSearch = searchParams.get('q') || '';
  const urlRegion = searchParams.get('region') || 'Tất cả';
  const urlGroup = searchParams.get('group') || 'all';
  const urlStaff = searchParams.get('staff') || 'all';
  const urlStatus = searchParams.get('status') || 'all';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const urlPageSize = parseInt(searchParams.get('size') || '10', 10);

  // ── Local state ──
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(urlSearch);
  const [regionFilter, setRegionFilter] = useState(urlRegion);
  const [groupFilter, setGroupFilter] = useState(urlGroup);
  const [staffFilter, setStaffFilter] = useState(urlStaff);
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [currentPage, setCurrentPage] = useState(urlPage);
  const [pageSize, setPageSize] = useState(urlPageSize);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    province: '',
    district: '',
    region: 'Miền Nam' as Agent['region'],
    customerGroup: 'standard' as AgentGroup,
    contactPerson: '',
    taxCode: '',
    assignedStaffId: 'USR-003',
    assignedStaffName: 'Nguyễn Văn Sales',
    status: 'active' as AgentStatus,
  });

  // ── Đồng bộ URL → State khi back/forward ──
  useEffect(() => {
    setSearch(urlSearch);
    setRegionFilter(urlRegion);
    setGroupFilter(urlGroup);
    setStaffFilter(urlStaff);
    setStatusFilter(urlStatus);
    setCurrentPage(urlPage);
    setPageSize(urlPageSize);
  }, [urlSearch, urlRegion, urlGroup, urlStaff, urlStatus, urlPage, urlPageSize]);

  const loadAgents = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await agentService.getAll();
      setAgents(data);
    } catch {
      setLoadError('Không thể tải danh sách đại lý. Vui lòng kiểm tra kết nối mạng và thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  // Danh sách nhân viên phụ trách trích xuất từ dữ liệu (SCRUM-469)
  const staffOptions = useMemo(() => {
    const staffMap = new Map<string, string>();
    agents.forEach((a) => {
      if (a.assignedStaffId && a.assignedStaffName) {
        staffMap.set(a.assignedStaffId, a.assignedStaffName);
      }
    });
    return [
      { value: 'all', label: 'Tất cả người phụ trách' },
      ...Array.from(staffMap.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [agents]);

  // ── Helper: cập nhật URL và state cùng lúc (SCRUM-470) ──
  const updateParam = (key: string, value: string, reset?: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all' && value !== 'Tất cả' && value !== '1' && value !== '10') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (reset) params.delete('page');
    setSearchParams(params, { replace: true });
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
    const params = new URLSearchParams(searchParams);
    if (val.trim()) params.set('q', val.trim());
    else params.delete('q');
    params.delete('page');
    setSearchParams(params, { replace: true });
  };

  const handleRegionChange = (val: string) => {
    setRegionFilter(val);
    setCurrentPage(1);
    updateParam('region', val, true);
  };

  const handleGroupChange = (val: string) => {
    setGroupFilter(val);
    setCurrentPage(1);
    updateParam('group', val, true);
  };

  const handleStaffChange = (val: string) => {
    setStaffFilter(val);
    setCurrentPage(1);
    updateParam('staff', val, true);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
    updateParam('status', val, true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    const params = new URLSearchParams(searchParams);
    if (page > 1) params.set('page', String(page));
    else params.delete('page');
    setSearchParams(params, { replace: true });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    const params = new URLSearchParams(searchParams);
    if (size !== 10) params.set('size', String(size));
    else params.delete('size');
    params.delete('page');
    setSearchParams(params, { replace: true });
  };

  const clearAllFilters = () => {
    setSearch('');
    setRegionFilter('Tất cả');
    setGroupFilter('all');
    setStaffFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
    setSearchParams({}, { replace: true });
  };

  // ── Lọc dữ liệu (SCRUM-469) ──
  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        (a.contactPerson || '').toLowerCase().includes(q);
      const matchRegion = regionFilter === 'Tất cả' || a.region === regionFilter;
      const matchGroup = groupFilter === 'all' || a.customerGroup === groupFilter;
      const matchStaff = staffFilter === 'all' || a.assignedStaffId === staffFilter;
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchSearch && matchRegion && matchGroup && matchStaff && matchStatus;
    });
  }, [agents, search, regionFilter, groupFilter, staffFilter, statusFilter]);

  // ── Phân trang (SCRUM-470) ──
  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAgents = filteredAgents.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters =
    Boolean(search) ||
    regionFilter !== 'Tất cả' ||
    groupFilter !== 'all' ||
    staffFilter !== 'all' ||
    statusFilter !== 'all';

  // ── Xuất CSV ──
  const handleExportCSV = () => {
    exportToCSV({
      filename: `danh_sach_dai_ly_${Date.now()}`,
      headers: ['Mã ĐL', 'Tên đại lý', 'Số điện thoại', 'Email', 'Khu vực', 'Nhóm KH', 'Người phụ trách', 'Tổng đơn', 'Doanh số', 'Công nợ', 'Trạng thái'],
      rows: filteredAgents.map((a) => [
        a.code,
        a.name,
        a.phone,
        a.email,
        a.region,
        a.customerGroup,
        a.assignedStaffName || '',
        a.totalOrders,
        a.totalSpent,
        a.outstandingDebt,
        a.status,
      ]),
    });
    showToast(`Đã xuất ${filteredAgents.length} đại lý ra file CSV thành công`, 'success');
  };

  // ── CRUD handlers ──
  const handleOpenCreate = () => {
    setEditingAgent(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      province: '',
      district: '',
      region: 'Miền Nam',
      customerGroup: 'standard',
      contactPerson: '',
      taxCode: '',
      assignedStaffId: 'USR-003',
      assignedStaffName: 'Nguyễn Văn Sales',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (a: Agent) => {
    setEditingAgent(a);
    setFormData({
      name: a.name,
      phone: a.phone,
      email: a.email,
      address: a.address,
      province: a.province,
      district: a.district,
      region: a.region as Agent['region'],
      customerGroup: a.customerGroup,
      contactPerson: a.contactPerson || '',
      taxCode: a.taxCode || '',
      assignedStaffId: a.assignedStaffId || 'USR-003',
      assignedStaffName: a.assignedStaffName || 'Nguyễn Văn Sales',
      status: a.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      showToast('Vui lòng nhập tên và số điện thoại đại lý', 'warning');
      return;
    }
    try {
      if (editingAgent) {
        await agentService.update(editingAgent.id, formData);
        showToast('Cập nhật thông tin đại lý thành công!', 'success');
      } else {
        await agentService.create(formData);
        showToast('Thêm mới đại lý thành công!', 'success');
      }
      setIsModalOpen(false);
      loadAgents();
    } catch {
      showToast('Có lỗi xảy ra, vui lòng thử lại', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await agentService.delete(deleteId);
      showToast('Đã xóa đại lý khỏi hệ thống', 'success');
      setDeleteId(null);
      loadAgents();
    } catch {
      showToast('Lỗi khi xóa đại lý', 'error');
    }
  };

  // ── Render ──
  return (
    <PageContainer
      title="Danh Sách Đại Lý"
      subtitle={`Quản lý ${agents.length} đại lý và nhà phân phối trong hệ thống`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<FileSpreadsheet className="w-4 h-4" />}
          >
            Xuất Excel
          </Button>
          <Link to="/agents/orders/new">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ShoppingBag className="w-4 h-4" />}
            >
              Tạo đơn đại lý
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Thêm đại lý
          </Button>
        </div>
      }
    >
      {/* ── Thẻ thống kê nhanh ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Tổng đại lý</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{agents.length}</p>
          </div>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Đang hoạt động</p>
            <p className="text-lg font-black text-emerald-600">
              {agents.filter((a) => a.status === 'active').length}
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Tổng doanh số</p>
            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
              {formatCurrency(agents.reduce((sum, a) => sum + (a.totalSpent || 0), 0))}
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Tổng công nợ</p>
            <p className="text-sm font-black text-rose-600 truncate">
              {formatCurrency(agents.reduce((sum, a) => sum + (a.outstandingDebt || 0), 0))}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bộ lọc nhanh (SCRUM-469 & SCRUM-470) ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-4 space-y-3 shadow-sm">
        {/* Dòng 1: Tìm kiếm */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="agent-search-input"
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo mã, tên đại lý, số điện thoại, người liên hệ..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            {search && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-100 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Dòng 2: Bộ lọc pill & dropdowns */}
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>

          {/* Khu vực (Pill buttons) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {REGION_OPTIONS.map((r) => (
              <button
                key={r}
                id={`agent-filter-region-${r}`}
                onClick={() => handleRegionChange(r)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                  regionFilter === r
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* Nhóm KH */}
          <select
            id="agent-filter-group"
            value={groupFilter}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>

          {/* Người phụ trách (SCRUM-469) */}
          <select
            id="agent-filter-staff"
            value={staffFilter}
            onChange={(e) => handleStaffChange(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {staffOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Trạng thái */}
          <select
            id="agent-filter-status"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Kết quả tìm kiếm & Active filter tags */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500">
          <p>
            Tìm thấy <span className="font-bold text-indigo-600">{filteredAgents.length}</span> đại lý
            {hasActiveFilters && ' khớp điều kiện lọc'}
          </p>

          {/* Active chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5">
              {search && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px]">
                  Từ khóa: &quot;{search}&quot;
                  <button onClick={() => handleSearchChange('')}><X className="w-3 h-3 hover:text-rose-500" /></button>
                </span>
              )}
              {regionFilter !== 'Tất cả' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px]">
                  Khu vực: {regionFilter}
                  <button onClick={() => handleRegionChange('Tất cả')}><X className="w-3 h-3 hover:text-rose-500" /></button>
                </span>
              )}
              {groupFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px]">
                  Nhóm: {groupFilter}
                  <button onClick={() => handleGroupChange('all')}><X className="w-3 h-3 hover:text-rose-500" /></button>
                </span>
              )}
              {staffFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px]">
                  NV: {staffOptions.find((s) => s.value === staffFilter)?.label}
                  <button onClick={() => handleStaffChange('all')}><X className="w-3 h-3 hover:text-rose-500" /></button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px]">
                  TT: {STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label}
                  <button onClick={() => handleStatusChange('all')}><X className="w-3 h-3 hover:text-rose-500" /></button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Thông báo lỗi khi tải dữ liệu (SCRUM-473) */}
      {loadError && (
        <div className="p-4 mb-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-medium">{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadAgents}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shrink-0 transition text-xs shadow-xs"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* ── DANH SÁCH MOBILE CARDS (Tối ưu tra cứu nhanh trên màn hình nhỏ) ── */}
      <div className="block md:hidden space-y-3 mb-4">
        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-12 text-center text-xs text-slate-500">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Đang tải danh sách đại lý...
          </div>
        ) : paginatedAgents.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-12 text-center space-y-2">
            <Users className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Không tìm thấy đại lý phù hợp</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-block pt-1"
              >
                Xóa tất cả bộ lọc
              </button>
            )}
          </div>
        ) : (
          paginatedAgents.map((agent) => {
            const statusConf = STATUS_CONFIG[agent.status];
            const groupConf = GROUP_CONFIG[agent.customerGroup];
            return (
              <div
                key={agent.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      {agent.code}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {agent.name}
                    </h3>
                    {agent.contactPerson && (
                      <p className="text-xs text-slate-500">LH: {agent.contactPerson}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={statusConf.variant} size="sm" dot>
                      {statusConf.label}
                    </Badge>
                    <Badge variant={groupConf.variant} size="sm">
                      {groupConf.label}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Khu vực / Tỉnh</span>
                    <span className="font-semibold">{agent.province}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Người phụ trách</span>
                    <span className="font-semibold truncate block">{agent.assignedStaffName || 'Chưa gán'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Doanh số</span>
                    <span className="font-black text-indigo-600">{formatCurrency(agent.totalSpent)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Công nợ</span>
                    <span className={`font-bold ${agent.outstandingDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {agent.outstandingDebt > 0 ? formatCurrency(agent.outstandingDebt) : '0 đ'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <a
                    href={`tel:${agent.phone}`}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl hover:bg-emerald-100 transition"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Gọi {agent.phone}</span>
                  </a>

                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`/agents/orders/new?agent=${agent.id}`}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Tạo đơn</span>
                    </Link>
                    <button
                      onClick={() => handleOpenEdit(agent)}
                      className="p-2 text-slate-400 hover:text-amber-600 bg-slate-100 dark:bg-slate-800 rounded-xl transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(agent.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 bg-slate-100 dark:bg-slate-800 rounded-xl transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── BẢNG DANH SÁCH DESKTOP ── */}
      <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mã / Tên Đại Lý</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Liên Hệ</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Khu Vực</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nhóm KH</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Người Phụ Trách</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Đơn</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Doanh Số</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Công Nợ</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Trạng Thái</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-xs text-slate-500">
                    <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Đang tải danh sách đại lý...
                  </td>
                </tr>
              ) : paginatedAgents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <Users className="w-12 h-12 mx-auto mb-3 text-slate-300 stroke-[1.2]" />
                    <p className="text-sm font-semibold text-slate-500">Không tìm thấy đại lý nào</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {hasActiveFilters ? 'Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm' : 'Hãy thêm đại lý đầu tiên'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition inline-block"
                      >
                        Xóa tất cả bộ lọc
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedAgents.map((agent) => {
                  const statusConf = STATUS_CONFIG[agent.status];
                  const groupConf = GROUP_CONFIG[agent.customerGroup];
                  return (
                    <tr
                      key={agent.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors group"
                    >
                      {/* Mã / Tên */}
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block">
                            {agent.code}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                            {agent.name}
                          </span>
                          {agent.contactPerson && (
                            <span className="text-[11px] text-slate-400">
                              Người LH: {agent.contactPerson}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Liên hệ */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <a
                            href={`tel:${agent.phone}`}
                            className="flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 transition"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            {agent.phone}
                          </a>
                          <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{agent.email}</div>
                        </div>
                      </td>

                      {/* Khu vực */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-1 text-xs text-slate-600 dark:text-slate-300">
                          <MapPin className="w-3 h-3 mt-0.5 text-slate-400 shrink-0" />
                          <span className="line-clamp-2">{agent.province}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{agent.region}</span>
                      </td>

                      {/* Nhóm KH */}
                      <td className="px-4 py-3">
                        <Badge variant={groupConf.variant} size="sm">
                          {groupConf.label}
                        </Badge>
                      </td>

                      {/* Người phụ trách (SCRUM-469) */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {agent.assignedStaffName || 'Chưa gán'}
                        </span>
                      </td>

                      {/* Tổng đơn */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                          <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                          {agent.totalOrders}
                        </div>
                      </td>

                      {/* Doanh số */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(agent.totalSpent)}
                        </span>
                      </td>

                      {/* Công nợ */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`text-sm font-bold ${
                            agent.outstandingDebt > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {agent.outstandingDebt > 0 ? formatCurrency(agent.outstandingDebt) : '—'}
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3">
                        <Badge variant={statusConf.variant} size="sm" dot>
                          {statusConf.label}
                        </Badge>
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          {/* Nút Tạo đơn hàng đại lý nhanh */}
                          <Link
                            to={`/agents/orders/new?agent=${agent.id}`}
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                            title="Tạo đơn hàng đại lý"
                          >
                            <ShoppingBag className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleOpenEdit(agent)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(agent.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Phân trang Desktop (SCRUM-470) ── */}
        {filteredAgents.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span>/ {filteredAgents.length} đại lý</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(safePage - 1)}
                disabled={safePage <= 1}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (safePage <= 3) {
                  page = i + 1;
                } else if (safePage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = safePage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                      page === safePage
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                onClick={() => handlePageChange(safePage + 1)}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Phân trang Mobile ── */}
      {filteredAgents.length > 0 && (
        <div className="flex md:hidden items-center justify-between px-2 py-3 text-xs text-slate-500">
          <span>Trang {safePage} / {totalPages} ({filteredAgents.length} đại lý)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(safePage - 1)}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
            >
              Trước
            </button>
            <button
              onClick={() => handlePageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Thêm / Sửa ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAgent ? 'Chỉnh Sửa Thông Tin Đại Lý' : 'Thêm Mới Đại Lý'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên đại lý / Công ty *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Công Ty TNHH / Cửa hàng..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0901234567"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contact@dailyvn.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Người liên hệ chính
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã số thuế
              </label>
              <input
                type="text"
                value={formData.taxCode}
                onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                placeholder="0300000000"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Địa chỉ
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Số nhà, đường, phường, quận..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tỉnh / Thành phố
              </label>
              <input
                type="text"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="TP. Hồ Chí Minh"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Khu vực
              </label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value as Agent['region'] })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="Miền Nam">Miền Nam</option>
                <option value="Miền Bắc">Miền Bắc</option>
                <option value="Miền Trung">Miền Trung</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhóm khách hàng
              </label>
              <select
                value={formData.customerGroup}
                onChange={(e) => setFormData({ ...formData, customerGroup: e.target.value as AgentGroup })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="platinum">Platinum</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="standard">Standard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Người phụ trách
              </label>
              <select
                value={formData.assignedStaffId}
                onChange={(e) => {
                  const staff = staffOptions.find((s) => s.value === e.target.value);
                  setFormData({
                    ...formData,
                    assignedStaffId: e.target.value,
                    assignedStaffName: staff?.label || '',
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {staffOptions.filter((s) => s.value !== 'all').map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trạng thái
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as AgentStatus })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
                <option value="pending">Chờ duyệt</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              {editingAgent ? 'Lưu thay đổi' : 'Tạo đại lý'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm xóa ── */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xác nhận xóa đại lý"
        message="Bạn có chắc chắn muốn xóa đại lý này khỏi hệ thống? Thao tác này không thể hoàn tác."
        confirmText="Xóa đại lý"
        variant="danger"
      />
    </PageContainer>
  );
};
export default AgentList;
