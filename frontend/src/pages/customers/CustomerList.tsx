import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Users,
  Eye,
  Edit,
  Trash2,
  Mail,
  Phone,
  DollarSign,
  MapPin,
  UserCheck,
  Filter,
  RotateCcw,
  LayoutGrid,
  List as ListIcon,
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { Customer, CustomerFilterOptions } from '../../types/Customer';
import { useToast } from '../../contexts/ToastContext';

export const CustomerList: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Đọc trạng thái từ URL Query Parameters
  const urlSearch = searchParams.get('q') || '';
  const urlRegion = searchParams.get('region') || 'all';
  const urlGroup = searchParams.get('group') || 'all';
  const urlRep = searchParams.get('rep') || 'all';
  const urlStatus = searchParams.get('status') || 'all';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const urlView = (searchParams.get('view') as 'table' | 'cards') || 'table';

  // 2. Local States
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(urlView);

  // Search input state (với debounce hỗ trợ nhập mượt mà)
  const [searchInput, setSearchInput] = useState<string>(urlSearch);

  // Filter options nạp tự động từ backend
  const [filterOptions, setFilterOptions] = useState<CustomerFilterOptions>({
    regions: ['Miền Bắc', 'Miền Trung', 'Miền Nam', 'Tây Nguyên'],
    customer_groups: ['TIER_1', 'TIER_2', 'WHOLESALE', 'VIP', 'RETAIL'],
    sales_reps: ['Lê Thị Nhân Viên Kinh Doanh', 'Nguyễn Văn Giám Đốc Kinh Doanh', 'Trần Quản Trị Hệ Thống'],
    statuses: ['active', 'inactive', 'locked'],
  });

  // Modal create/edit & delete dialog state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    customer_group: 'RETAIL',
    region: 'Miền Bắc',
    assigned_sales_rep: 'Lê Thị Nhân Viên Kinh Doanh',
    status: 'active' as 'active' | 'inactive' | 'locked',
  });

  // 3. Nạp danh mục tùy chọn lọc từ backend
  useEffect(() => {
    customerService.getFilterOptions().then(setFilterOptions);
  }, []);

  // 4. Đồng bộ search input khi URL query thay đổi
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // 5. Cập nhật URL Parameters tập trung
  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (!val || val === 'all' || (key === 'page' && val === '1')) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // 6. Xử lý tìm kiếm với debounce (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== urlSearch) {
        updateParams({ q: searchInput.trim() ? searchInput.trim() : null, page: '1' });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, urlSearch, updateParams]);

  // 7. Nạp dữ liệu danh sách đại lý phân trang từ Server
  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await customerService.getPaginated({
        search: urlSearch.trim() || undefined,
        region: urlRegion !== 'all' ? urlRegion : undefined,
        customer_group: urlGroup !== 'all' ? urlGroup : undefined,
        assigned_sales_rep: urlRep !== 'all' ? urlRep : undefined,
        status: urlStatus !== 'all' ? urlStatus : undefined,
        page: urlPage,
        page_size: 10,
      });
      setCustomers(res.items);
      setTotalCount(res.total);
      setTotalPages(res.total_pages);
    } catch {
      showToast('Lỗi khi tải danh sách đại lý', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [urlSearch, urlRegion, urlGroup, urlRep, urlStatus, urlPage, showToast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // 8. Đặt lại toàn bộ bộ lọc
  const handleResetFilters = () => {
    setSearchInput('');
    const params = new URLSearchParams();
    if (viewMode === 'cards') params.set('view', 'cards');
    setSearchParams(params, { replace: true });
  };

  const hasActiveFilters = Boolean(
    urlSearch ||
    urlRegion !== 'all' ||
    urlGroup !== 'all' ||
    urlRep !== 'all' ||
    urlStatus !== 'all'
  );

  // 9. Thao tác Modal Thêm / Sửa
  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      customer_group: filterOptions.customer_groups[0] || 'RETAIL',
      region: filterOptions.regions[0] || 'Miền Bắc',
      assigned_sales_rep: filterOptions.sales_reps[0] || 'Lê Thị Nhân Viên Kinh Doanh',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      customer_group: c.customer_group || c.customerGroup || 'RETAIL',
      region: c.region || 'Miền Bắc',
      assigned_sales_rep: c.assigned_sales_rep || c.assignedSalesRep || 'Lê Thị Nhân Viên Kinh Doanh',
      status: c.status,
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
      if (editingCustomer) {
        await customerService.update(editingCustomer.id, formData);
        showToast('Cập nhật thông tin đại lý thành công!', 'success');
      } else {
        await customerService.create(formData);
        showToast('Thêm mới đại lý thành công!', 'success');
      }
      setIsModalOpen(false);
      loadCustomers();
    } catch {
      showToast('Có lỗi xảy ra khi lưu đại lý', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await customerService.delete(deleteId);
      showToast('Đã xóa đại lý thành công', 'success');
      setDeleteId(null);
      loadCustomers();
    } catch {
      showToast('Lỗi khi xóa đại lý', 'error');
    }
  };

  const getStatusBadge = (statusVal: string) => {
    switch (statusVal) {
      case 'active':
        return <Badge variant="success" size="sm" dot>Hoạt động</Badge>;
      case 'locked':
        return <Badge variant="danger" size="sm" dot>Đang khóa</Badge>;
      case 'inactive':
      default:
        return <Badge variant="neutral" size="sm" dot>Tạm ngưng</Badge>;
    }
  };

  const getGroupBadge = (groupVal?: string) => {
    switch (groupVal) {
      case 'TIER_1':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">Cấp 1</span>;
      case 'TIER_2':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">Cấp 2</span>;
      case 'VIP':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">VIP</span>;
      case 'WHOLESALE':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">Bán buôn</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">Bán lẻ</span>;
    }
  };

  // Cấu hình các cột cho Bảng DataTable
  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: 'Mã Đại Lý',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
      render: (c) => (
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
          {c.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Đại Lý & Địa Chỉ',
      sortable: true,
      className: 'min-w-[200px]',
      render: (c) => (
        <div>
          <Link
            to={`/customers/${c.id}`}
            className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 block truncate"
          >
            {c.name}
          </Link>
          <div className="flex items-center gap-1 text-xs text-slate-400 truncate max-w-xs mt-0.5">
            <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
            <span className="truncate">{c.address || 'Chưa cập nhật địa chỉ'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Liên Hệ Nhanh',
      sortable: true,
      render: (c) => (
        <div className="text-xs space-y-0.5">
          <a
            href={`tel:${c.phone}`}
            className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 flex items-center gap-1.5"
            title="Gọi điện ngay ngoài hiện trường"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span>{c.phone}</span>
          </a>
          {c.email && (
            <div className="text-slate-400 flex items-center gap-1 text-[11px]">
              <Mail className="w-3 h-3 text-slate-400" />
              <span className="truncate max-w-[140px]">{c.email}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Khu Vực & Nhóm',
      sortable: true,
      render: (c) => (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-indigo-500" />
            <span>{c.region || 'Toàn quốc'}</span>
          </div>
          <div>{getGroupBadge(c.customer_group || c.customerGroup)}</div>
        </div>
      ),
    },
    {
      key: 'assignedSalesRep',
      header: 'Người Phụ Trách',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate max-w-[150px]">
            {c.assigned_sales_rep || c.assignedSalesRep || 'Chưa phân công'}
          </span>
        </div>
      ),
    },
    {
      key: 'totalSpent',
      header: 'Doanh Số',
      sortable: true,
      render: (c) => (
        <div className="text-right">
          <div className="font-bold text-xs text-indigo-600 dark:text-indigo-400">
            {formatCurrency(c.totalSpent)}
          </div>
          <div className="text-[11px] text-slate-400">{c.totalOrders} đơn hàng</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (c) => getStatusBadge(c.status),
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/customers/${c.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Xem hồ sơ chi tiết"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={() => handleOpenEdit(c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Chỉnh sửa đại lý"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteId(c.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="Xóa đại lý"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Tra Cứu & Quản Lý Đại Lý"
      subtitle={`Hệ thống quản lý ${totalCount} đại lý và khách hàng trong tuyến bán hàng`}
      actions={
        <div className="flex items-center gap-2">
          {/* Nút chuyển đổi View Mode: Bảng vs Thẻ Ngoài Hiện Trường */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setViewMode('table');
                updateParams({ view: null });
              }}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Xem dạng Bảng dữ liệu"
            >
              <ListIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Bảng</span>
            </button>
            <button
              onClick={() => {
                setViewMode('cards');
                updateParams({ view: 'cards' });
              }}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Xem dạng Thẻ nhanh Hiện trường (Tối ưu Mobile)"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Thẻ Hiện Trường</span>
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Thêm đại lý mới
          </Button>
        </div>
      }
    >
      {/* ============================================================== */}
      {/* KHỐI TÌM KIẾM NHANH & BỘ LỌC ĐA TIÊU CHÍ (SCRUM-229 S3-08)     */}
      {/* ============================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3 mb-4">
        {/* Hàng 1: Ô tìm kiếm nhanh toàn cục */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="🔍 Tìm nhanh theo Mã đại lý, Tên, Số điện thoại..."
              className="w-full pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  updateParams({ q: null, page: '1' });
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                title="Xóa từ khóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Nút đặt lại bộ lọc nếu đang có filter */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded-xl border border-rose-200 dark:border-rose-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>

        {/* Hàng 2: Bộ lọc 4 tiêu chí theo SCRUM-229 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* 1. Lọc theo Khu Vực */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-indigo-500" />
              <span>Khu Vực Địa Bàn</span>
            </label>
            <select
              value={urlRegion}
              onChange={(e) => updateParams({ region: e.target.value, page: '1' })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">Tất cả khu vực</option>
              {filterOptions.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Lọc theo Nhóm Khách Hàng */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-500" />
              <span>Nhóm Khách Hàng</span>
            </label>
            <select
              value={urlGroup}
              onChange={(e) => updateParams({ group: e.target.value, page: '1' })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">Tất cả nhóm</option>
              {filterOptions.customer_groups.map((g) => (
                <option key={g} value={g}>
                  {g === 'TIER_1'
                    ? 'Cấp 1 (Tier 1)'
                    : g === 'TIER_2'
                    ? 'Cấp 2 (Tier 2)'
                    : g === 'WHOLESALE'
                    ? 'Bán buôn'
                    : g === 'VIP'
                    ? 'VIP'
                    : 'Bán lẻ (Retail)'}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Lọc theo Người Phụ Trách */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-emerald-500" />
              <span>NVKD Phụ Trách</span>
            </label>
            <select
              value={urlRep}
              onChange={(e) => updateParams({ rep: e.target.value, page: '1' })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">Tất cả nhân viên</option>
              {filterOptions.sales_reps.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Lọc theo Trạng Thái */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-amber-500" />
              <span>Trạng Thái Đại Lý</span>
            </label>
            <select
              value={urlStatus}
              onChange={(e) => updateParams({ status: e.target.value, page: '1' })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Tạm ngưng</option>
              <option value="locked">Đang bị khóa</option>
            </select>
          </div>
        </div>
      </div>

      {/* Thông tin số lượng kết quả */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
        <span>
          Tìm thấy <strong className="text-slate-900 dark:text-slate-100">{totalCount}</strong> đại lý phù hợp
          {hasActiveFilters && ' (đang áp dụng bộ lọc)'}
        </span>
        <span>
          Trang {urlPage} / {totalPages}
        </span>
      </div>

      {/* ============================================================== */}
      {/* PHẦN HIỂN THỊ: DẠNG BẢNG HOẶC DẠNG THẺ HIỆN TRƯỜNG             */}
      {/* ============================================================== */}
      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-sm">
          Đang tải dữ liệu đại lý...
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10">
          <EmptyState
            title="Không tìm thấy đại lý phù hợp"
            description={
              hasActiveFilters
                ? 'Không có đại lý nào khớp với điều kiện tìm kiếm hoặc bộ lọc hiện tại.'
                : 'Chưa có dữ liệu đại lý nào trong hệ thống.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={handleResetFilters} leftIcon={<RotateCcw className="w-4 h-4" />}>
                  Xóa tất cả bộ lọc
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
                  Tạo đại lý đầu tiên
                </Button>
              )
            }
          />
        </div>
      ) : viewMode === 'table' ? (
        /* 1. DẠNG BẢNG (TABLE VIEW) */
        <div className="space-y-3">
          <DataTable
            data={customers}
            columns={columns}
            keyExtractor={(c) => c.id}
          />
          {/* Thanh phân trang Server-side */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
            <div>
              Hiển thị {customers.length} trên tổng số {totalCount} đại lý
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={urlPage <= 1}
                onClick={() => updateParams({ page: String(urlPage - 1) })}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
              >
                Trang trước
              </Button>
              <span className="px-2 font-semibold">
                {urlPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={urlPage >= totalPages}
                onClick={() => updateParams({ page: String(urlPage + 1) })}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                Trang sau
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* 2. DẠNG THẺ HIỆN TRƯỜNG CHO NHÂN VIÊN NGOÀI TUYẾN (FIELD CARDS VIEW) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {customers.map((c) => (
              <div
                key={c.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative overflow-hidden"
              >
                {/* Header Card */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                      {c.code}
                    </span>
                    <div className="flex items-center gap-1">
                      {getGroupBadge(c.customer_group || c.customerGroup)}
                      {getStatusBadge(c.status)}
                    </div>
                  </div>

                  <Link
                    to={`/customers/${c.id}`}
                    className="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-indigo-600 block line-clamp-1"
                  >
                    {c.name}
                  </Link>

                  <div className="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{c.address || 'Chưa có thông tin địa chỉ'}</span>
                  </div>
                </div>

                {/* Body Card */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400">Khu vực:</span>
                    <span className="font-semibold">{c.region || 'Toàn quốc'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400">Phụ trách:</span>
                    <span className="font-semibold truncate max-w-[170px]">
                      {c.assigned_sales_rep || c.assignedSalesRep || 'Chưa gán'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400">Doanh số:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(c.totalSpent)}
                    </span>
                  </div>
                </div>

                {/* Footer Card: Nút gọi điện nhanh & Thao tác ngoài hiện trường */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <a
                    href={`tel:${c.phone}`}
                    className="flex-1 py-1.5 px-3 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-emerald-200 dark:border-emerald-800"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Gọi {c.phone}</span>
                  </a>

                  {c.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700"
                      title="Chỉ đường Google Maps"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  <Link
                    to={`/customers/${c.id}`}
                    className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 rounded-xl border border-indigo-200 dark:border-indigo-800"
                    title="Xem chi tiết"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>

                  <button
                    onClick={() => handleOpenEdit(c)}
                    className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700"
                    title="Chỉnh sửa"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Phân trang cho Card View */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
            <div>
              Hiển thị {customers.length} trên tổng số {totalCount} đại lý
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={urlPage <= 1}
                onClick={() => updateParams({ page: String(urlPage - 1) })}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
              >
                Trước
              </Button>
              <span className="px-2 font-semibold">
                {urlPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={urlPage >= totalPages}
                onClick={() => updateParams({ page: String(urlPage + 1) })}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                Sau
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL THÊM MỚI / CHỈNH SỬA ĐẠI LÝ                              */}
      {/* ============================================================== */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Chỉnh Sửa Thông Tin Đại Lý' : 'Thêm Mới Đại Lý Vào Tuyến'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên đại lý / Khách hàng *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ví dụ: Đại Lý Thiết Bị Số Thăng Long"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại liên hệ *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0901234567"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Địa chỉ Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="daily@example.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ cửa hàng / kho đại lý
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Chọn Khu Vực */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Khu vực địa bàn *
              </label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                {filterOptions.regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Chọn Nhóm Đại Lý */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhóm khách hàng *
              </label>
              <select
                value={formData.customer_group}
                onChange={(e) => setFormData({ ...formData, customer_group: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                {filterOptions.customer_groups.map((g) => (
                  <option key={g} value={g}>
                    {g === 'TIER_1'
                      ? 'Đại lý Cấp 1 (Tier 1)'
                      : g === 'TIER_2'
                      ? 'Đại lý Cấp 2 (Tier 2)'
                      : g === 'WHOLESALE'
                      ? 'Bán buôn'
                      : g === 'VIP'
                      ? 'Khách hàng VIP'
                      : 'Bán lẻ (Retail)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Chọn Nhân Viên Phụ Trách */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                NVKD phụ trách đại lý
              </label>
              <select
                value={formData.assigned_sales_rep}
                onChange={(e) => setFormData({ ...formData, assigned_sales_rep: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                {filterOptions.sales_reps.map((rep) => (
                  <option key={rep} value={rep}>
                    {rep}
                  </option>
                ))}
              </select>
            </div>

            {/* Chọn Trạng Thái */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trạng thái hoạt động
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng giao dịch</option>
                <option value="locked">Khóa giao dịch</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              {editingCustomer ? 'Lưu thay đổi' : 'Tạo đại lý'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xác nhận xóa đại lý"
        message="Bạn có chắc chắn muốn xóa đại lý này khỏi danh sách quản lý? Dữ liệu lịch sử có thể bị ảnh hưởng."
        confirmText="Xóa đại lý"
        variant="danger"
      />
    </PageContainer>
  );
};
