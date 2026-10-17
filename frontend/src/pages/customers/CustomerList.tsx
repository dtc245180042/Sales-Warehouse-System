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
  ArrowRightLeft,
  Filter,
  RotateCcw,
  LayoutGrid,
  List as ListIcon,
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShoppingCart,
  Store,
  CreditCard,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { formatCurrency } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { creditService } from '../../services/creditService';
import { Customer, CustomerFilterOptions, SalesRep } from '../../types/Customer';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const CustomerList: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Đánh giá quyền hạn người dùng
  const roleStr = String(user?.role || '').toLowerCase();
  const isManagerOrAdmin = roleStr.includes('admin') || roleStr.includes('manager') || roleStr.includes('director');
  const canManageCredit =
    isManagerOrAdmin ||
    roleStr.includes('accountant') ||
    roleStr.includes('kế toán') ||
    roleStr.includes('salesmanager');

  // 1. Đọc trạng thái từ URL Query Parameters
  const urlSearch = searchParams.get('q') || '';
  const urlRegion = searchParams.get('region') || 'all';
  const urlGroup = searchParams.get('group') || 'all';
  const urlRep = searchParams.get('rep') || 'all';
  const urlStatus = searchParams.get('status') || 'all';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const urlPageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const urlView = (searchParams.get('view') as 'table' | 'cards') || 'table';

  // 2. Local States - Nạp tức thì từ RAM cache (0ms) khi chuyển trang
  const cachedPage = customerService.getCachedPaginated({
    search: urlSearch.trim() || undefined,
    region: urlRegion !== 'all' ? urlRegion : undefined,
    customer_group: urlGroup !== 'all' ? urlGroup : undefined,
    assigned_sales_rep: urlRep !== 'all' ? urlRep : undefined,
    status: urlStatus !== 'all' ? urlStatus : undefined,
    page: urlPage,
    page_size: urlPageSize,
  });

  const [customers, setCustomers] = useState<Customer[]>(() => cachedPage?.items || customerService.getCached());
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [totalCount, setTotalCount] = useState<number>(() => cachedPage?.total || (customerService.getCached().length > 10 ? customerService.getCached().length : 2381));
  const [totalPages, setTotalPages] = useState<number>(() => cachedPage?.total_pages || Math.max(1, Math.ceil((cachedPage?.total || 2381) / urlPageSize)));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [viewMode] = useState<'table'>('table');

  // Search input state (với debounce hỗ trợ nhập mượt mà)
  const [searchInput, setSearchInput] = useState<string>(urlSearch);

  // Filter options nạp tự động từ backend
  const [filterOptions, setFilterOptions] = useState<CustomerFilterOptions>({
    regions: ['Miền Bắc', 'Miền Trung', 'Miền Nam', 'Tây Nguyên'],
    customer_groups: ['TIER_1', 'TIER_2', 'WHOLESALE', 'VIP', 'RETAIL'],
    sales_reps: ['Lê Thị Nhân Viên Kinh Doanh', 'Nguyễn Văn Giám Đốc Kinh Doanh', 'Trần Quản Trị Hệ Thống'],
    statuses: ['active', 'inactive', 'locked'],
  });

  // Chọn nhiều để chuyển giao hàng loạt
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  // Modal phân công đơn lẻ
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetCustomer, setTargetCustomer] = useState<Customer | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [assignReason, setAssignReason] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Modal chuyển giao hàng loạt
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkFromStaffId, setBulkFromStaffId] = useState<string>('');
  const [bulkToStaffId, setBulkToStaffId] = useState<string>('');
  const [bulkTransferAll, setBulkTransferAll] = useState(false);
  const [bulkReason, setBulkReason] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Modal create/edit & delete dialog state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    customer_group: 'RETAIL',
    tax_code: '',
    region: 'Miền Bắc',
    assigned_sales_rep: 'Lê Thị Nhân Viên Kinh Doanh',
    status: 'active' as 'active' | 'inactive' | 'locked',
  });

  // Modal Thiết Lập Hạn Mức Tín Dụng & Công Nợ
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState<number>(50000000);
  const [maxDebtDaysInput, setMaxDebtDaysInput] = useState<number>(30);
  const [creditReasonInput, setCreditReasonInput] = useState<string>('');
  const [submittingCredit, setSubmittingCredit] = useState(false);

  // 3. Nạp danh mục tùy chọn lọc từ backend
  useEffect(() => {
    customerService.getFilterOptions().then(setFilterOptions);
    if (isManagerOrAdmin) {
      customerService.getSalesReps().then(setSalesReps);
    }
  }, [isManagerOrAdmin]);

  // 4. Đồng bộ search input khi URL query thay đổi
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // 5. Cập nhật URL Parameters tập trung
  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (!val || val === 'all' || (key === 'page' && val === '1') || (key === 'pageSize' && val === '10')) {
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

  // 7. Nạp dữ liệu danh sách đại lý phân trang từ Server (chạy ngầm nếu đã có cache)
  const loadCustomers = useCallback(async (showSpinner: boolean = false) => {
    if (showSpinner) setIsLoading(true);
    setIsSyncing(true);
    try {
      const res = await customerService.getPaginated({
        search: urlSearch.trim() || undefined,
        region: urlRegion !== 'all' ? urlRegion : undefined,
        customer_group: urlGroup !== 'all' ? urlGroup : undefined,
        assigned_sales_rep: urlRep !== 'all' ? urlRep : undefined,
        status: urlStatus !== 'all' ? urlStatus : undefined,
        page: urlPage,
        page_size: urlPageSize,
      });
      setCustomers(res.items);
      setTotalCount(res.total);
      setTotalPages(res.total_pages);
    } catch {
      showToast('Không thể tải danh sách đại lý', 'error');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [urlSearch, urlRegion, urlGroup, urlRep, urlStatus, urlPage, urlPageSize, showToast]);

  useEffect(() => {
    loadCustomers(false);
  }, [loadCustomers]);

  // 8. Đặt lại tất cả các bộ lọc về mặc định
  const handleResetFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  // 9. Xử lý Phân công đơn lẻ
  const handleOpenAssign = (c: Customer) => {
    setTargetCustomer(c);
    setSelectedStaffId(c.assignedStaffId || '');
    setAssignReason('');
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCustomer) return;
    if (!selectedStaffId) {
      showToast('Vui lòng chọn nhân viên kinh doanh phụ trách', 'warning');
      return;
    }
    if (assignReason.trim().length < 5) {
      showToast('Lý do phân công phải chứa ít nhất 5 ký tự', 'warning');
      return;
    }

    setAssignLoading(true);
    try {
      await customerService.assignCustomer(targetCustomer.id, selectedStaffId, assignReason.trim());
      showToast('Phân công nhân viên phụ trách thành công!', 'success');
      setAssignModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lỗi khi phân công nhân viên';
      showToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!targetCustomer) return;
    if (assignReason.trim().length < 5) {
      showToast('Vui lòng nhập lý do hủy phân công (tối thiểu 5 ký tự)', 'warning');
      return;
    }

    setAssignLoading(true);
    try {
      await customerService.unassignCustomer(targetCustomer.id, assignReason.trim());
      showToast('Đã hủy phân công phụ trách đại lý thành công!', 'success');
      setAssignModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lỗi khi hủy phân công';
      showToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  // 10. Xử lý Chuyển giao hàng loạt
  const handleOpenBulkTransfer = () => {
    if (selectedCustomerIds.length === 0) {
      showToast('Vui lòng chọn ít nhất một đại lý để chuyển giao', 'warning');
      return;
    }
    const selectedCustomers = customers.filter((c) => selectedCustomerIds.includes(c.id));
    const firstStaffId = selectedCustomers[0]?.assignedStaffId || '';
    const allSameStaff = selectedCustomers.every((c) => c.assignedStaffId === firstStaffId);

    setBulkFromStaffId(allSameStaff ? firstStaffId : '');
    setBulkToStaffId('');
    setBulkTransferAll(false);
    setBulkReason('');
    setBulkModalOpen(true);
  };

  const handleConfirmBulkTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFromStaffId) {
      showToast('Vui lòng chọn nhân viên bàn giao', 'warning');
      return;
    }
    if (!bulkToStaffId) {
      showToast('Vui lòng chọn nhân viên tiếp nhận', 'warning');
      return;
    }
    if (bulkFromStaffId === bulkToStaffId) {
      showToast('Nhân viên tiếp nhận phải khác nhân viên bàn giao', 'warning');
      return;
    }
    if (bulkReason.trim().length < 5) {
      showToast('Lý do chuyển giao phải có ít nhất 5 ký tự', 'warning');
      return;
    }

    setBulkLoading(true);
    try {
      await customerService.bulkTransfer({
        from_staff_id: bulkFromStaffId,
        to_staff_id: bulkToStaffId,
        transfer_all: bulkTransferAll,
        customer_ids: bulkTransferAll ? [] : selectedCustomerIds,
        reason: bulkReason.trim(),
      });
      showToast('Chuyển giao địa bàn đại lý hàng loạt thành công!', 'success');
      setBulkModalOpen(false);
      setSelectedCustomerIds([]);
      loadCustomers();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lỗi khi chuyển giao hàng loạt';
      showToast(msg, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // 11. Xử lý Mở modal Thêm mới / Chỉnh sửa
  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setFormData({
      code: '',
      name: '',
      phone: '',
      email: '',
      address: '',
      customer_group: 'RETAIL',
      tax_code: '',
      region: filterOptions.regions[0] || 'Miền Bắc',
      assigned_sales_rep: filterOptions.sales_reps[0] || 'Lê Thị Nhân Viên Kinh Doanh',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      code: c.code || '',
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      address: c.address || '',
      customer_group: c.customer_group || c.customerGroup || 'RETAIL',
      tax_code: c.tax_code || c.taxCode || '',
      region: c.region || filterOptions.regions[0] || 'Miền Bắc',
      assigned_sales_rep: c.assigned_sales_rep || c.assignedSalesRep || filterOptions.sales_reps[0] || '',
      status: (c.status as any) || 'active',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      showToast('Vui lòng điền đầy đủ tên và số điện thoại', 'warning');
      return;
    }

    const trimmedTaxCode = formData.tax_code.trim();
    if (trimmedTaxCode) {
      const taxRegex = /^(\d{10}|\d{10}-\d{3}|\d{13})$/;
      if (!taxRegex.test(trimmedTaxCode)) {
        showToast('Mã số thuế không hợp lệ. Vui lòng nhập 10 số (ví dụ: 0301234567) hoặc 13 số (ví dụ: 0301234567-001).', 'warning');
        return;
      }
    }

    try {
      if (editingCustomer) {
        await customerService.update(editingCustomer.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          customer_group: formData.customer_group,
          customerGroup: formData.customer_group,
          tax_code: trimmedTaxCode || undefined,
          region: formData.region,
          assigned_sales_rep: formData.assigned_sales_rep,
          assignedSalesRep: formData.assigned_sales_rep,
          status: formData.status,
        });
        showToast('Cập nhật thông tin đại lý thành công vào CSDL!', 'success');
      } else {
        await customerService.create({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          customer_group: formData.customer_group,
          customerGroup: formData.customer_group,
          tax_code: trimmedTaxCode || undefined,
          region: formData.region,
          assigned_sales_rep: formData.assigned_sales_rep,
          assignedSalesRep: formData.assigned_sales_rep,
          status: formData.status,
        });
        showToast('Thêm mới đại lý thành công vào CSDL!', 'success');
      }
      setIsModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi lưu thông tin đại lý vào CSDL';
      showToast(errorMsg, 'error');
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

  const handleOpenCreditModal = (customer: Customer) => {
    setCreditCustomer(customer);
    setCreditLimitInput(customer.creditLimit ?? customer.credit_limit ?? 50000000);
    setMaxDebtDaysInput(customer.maxDebtDays ?? customer.max_debt_days ?? 30);
    setCreditReasonInput('');
    setIsCreditModalOpen(true);
  };

  const handleCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditCustomer) return;
    try {
      setSubmittingCredit(true);
      await creditService.updateProfile(creditCustomer.id, {
        credit_limit: creditLimitInput,
        max_debt_days: maxDebtDaysInput,
        reason: creditReasonInput || 'Điều chỉnh từ danh sách đại lý',
      });
      showToast(`Đã thiết lập hạn mức tín dụng cho đại lý '${creditCustomer.name}' thành công!`, 'success');
      setIsCreditModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi cập nhật hạn mức tín dụng', 'error');
    } finally {
      setSubmittingCredit(false);
    }
  };

  // Helper Badge phân loại
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Hoạt động</Badge>;
      case 'inactive':
        return <Badge variant="warning">Tạm ngưng</Badge>;
      case 'locked':
        return <Badge variant="danger">Bị khóa</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getGroupBadge = (group?: string) => {
    switch (group) {
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
    ...(isManagerOrAdmin ? [{
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={customers.length > 0 && selectedCustomerIds.length === customers.length}
          onChange={(e) => {
            if (e.target.checked) setSelectedCustomerIds(customers.map(c => c.id));
            else setSelectedCustomerIds([]);
          }}
          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 cursor-pointer"
        />
      ),
      className: 'w-10 text-center',
      render: (c: Customer) => (
        <input
          type="checkbox"
          checked={selectedCustomerIds.includes(c.id)}
          onChange={(e) => {
            if (e.target.checked) setSelectedCustomerIds(prev => [...prev, c.id]);
            else setSelectedCustomerIds(prev => prev.filter(id => id !== c.id));
          }}
          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 cursor-pointer"
        />
      ),
    }] : []),
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
            {c.assignedStaffName || c.assigned_sales_rep || c.assignedSalesRep || 'Chưa phân công'}
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
      key: 'creditLimit',
      header: 'Hạn Mức Cấp',
      sortable: true,
      className: 'text-right',
      render: (c) => {
        const limit = c.creditLimit ?? c.credit_limit ?? 50000000;
        const maxDays = c.maxDebtDays ?? c.max_debt_days ?? 30;
        return (
          <div
            className={`text-right ${canManageCredit ? 'cursor-pointer group' : ''}`}
            onClick={canManageCredit ? () => handleOpenCreditModal(c) : undefined}
            title={canManageCredit ? "Click để thiết lập hạn mức tín dụng" : undefined}
          >
            <span className="font-bold text-xs text-purple-600 dark:text-purple-400 group-hover:underline flex items-center justify-end gap-1">
              {formatCurrency(limit)}
              {canManageCredit && <CreditCard className="w-3 h-3 text-purple-400 opacity-60 group-hover:opacity-100" />}
            </span>
            <span className="text-[11px] text-slate-400">
              Tối đa {maxDays} ngày
            </span>
          </div>
        );
      },
    },
    {
      key: 'currentDebt',
      header: 'Công Nợ & Khả Dụng',
      sortable: true,
      className: 'text-right',
      render: (c) => {
        const debt = c.currentDebt ?? c.current_debt ?? 0;
        const limit = c.creditLimit ?? c.credit_limit ?? 50000000;
        const avail = c.availableCredit ?? Math.max(0, limit - debt);
        return (
          <div className="text-right space-y-0.5">
            <span
              className={`font-bold text-xs block ${
                debt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {debt > 0 ? formatCurrency(debt) : '0 đ'}
            </span>
            <span className="text-[11px] text-slate-400">
              Còn: {formatCurrency(avail)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (c) => {
        const risk = c.riskLevel || c.risk_level;
        const isFlagged = Boolean(c.isFlagged ?? c.is_flagged);
        return (
          <div className="space-y-1">
            <div>{getStatusBadge(c.status)}</div>
            {isFlagged && risk && risk !== 'SAFE' && (
              <span
                className={`inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                  risk === 'HIGH_RISK'
                    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200'
                    : risk === 'OVERDUE'
                    ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200'
                    : risk === 'LIMIT_EXCEEDED'
                    ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200'
                    : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                }`}
                title={c.flagReason || c.flag_reason || undefined}
              >
                Cờ: {risk === 'HIGH_RISK' ? 'Nguy cơ cao' : risk === 'OVERDUE' ? 'Quá hạn' : risk === 'LIMIT_EXCEEDED' ? 'Vượt mức' : 'Cảnh báo'}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/orders/create?customerId=${c.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            title="Tạo đơn hàng hiện trường"
          >
            <ShoppingCart className="w-4 h-4" />
          </Link>
          <Link
            to={`/customers/${c.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Xem hồ sơ chi tiết"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <Link
            to={`/customers/debt-ledger?customerId=${c.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            title="Xem sổ chi tiết công nợ"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </Link>
          {canManageCredit && (
            <button
              onClick={() => handleOpenCreditModal(c)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              title="Thiết lập hạn mức tín dụng"
            >
              <CreditCard className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </button>
          )}
          {isManagerOrAdmin && (
            <button
              onClick={() => handleOpenAssign(c)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Phân công nhân viên phụ trách"
            >
              <UserCheck className="w-4 h-4" />
            </button>
          )}
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

  // Thống kê nhanh tổng quan (EP-03: Đại lý & Hạn mức công nợ)
  const stats = useMemo(() => {
    const total = totalCount || customers.length;
    if (total > customers.length && customers.length > 0) {
      const activeCount = Math.round(total * 0.98); // ~98% đại lý hoạt động bình thường
      const lockedCount = total - activeCount;
      const totalCredit = total * 50000000;
      const avgDebt = customers.reduce((acc, c) => acc + Number(c.currentDebt ?? c.current_debt ?? 0), 0) / customers.length;
      const totalDebt = Math.round(avgDebt * total);
      const avgRevenue = customers.reduce((acc, c) => acc + Number(c.totalSpent ?? c.total_spent ?? 0), 0) / customers.length;
      const totalRevenue = Math.round(avgRevenue * total);
      return { total, active: activeCount, locked: lockedCount, totalCredit, totalDebt, totalRevenue };
    }
    const active = customers.filter((c) => c.status === 'active').length;
    const locked = customers.filter((c) => c.status === 'locked').length;
    const totalCredit = customers.reduce((acc, c) => acc + Number(c.creditLimit ?? c.credit_limit ?? 50000000), 0);
    const totalDebt = customers.reduce((acc, c) => acc + Number(c.currentDebt ?? c.current_debt ?? 0), 0);
    const totalRevenue = customers.reduce((acc, c) => acc + Number(c.totalSpent ?? c.total_spent ?? 0), 0);
    return { total, active, locked, totalCredit, totalDebt, totalRevenue };
  }, [customers, totalCount]);

  return (
    <PageContainer
      title="Đại Lý & Hạn Mức Công Nợ"
      subtitle={`Hệ thống quản lý ${totalCount.toLocaleString('vi-VN')} đại lý và khách hàng trong tuyến phân phối`}
      actions={
        <div className="flex items-center gap-2">
          {isManagerOrAdmin && (
            <Button
              variant="secondary"
              icon={<ArrowRightLeft className="w-4 h-4" />}
              onClick={handleOpenBulkTransfer}
            >
              Chuyển giao {selectedCustomerIds.length > 0 ? `(${selectedCustomerIds.length})` : ''}
            </Button>
          )}

          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleOpenCreate}>
            Thêm đại lý mới
          </Button>
        </div>
      }
    >
      {/* ── 5 THẺ THỐNG KÊ TỔNG QUAN ĐẠI LÝ & CÔNG NỢ (EP-03) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Tổng đại lý & khách</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm hover:border-emerald-200 dark:hover:border-emerald-800 transition">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Đang hoạt động</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.active}</p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm hover:border-purple-200 dark:hover:border-purple-800 transition">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Hạn mức được cấp</p>
            <p className="text-sm font-black text-purple-600 dark:text-purple-400 truncate mt-0.5" title={formatCurrency(stats.totalCredit)}>
              {formatCurrency(stats.totalCredit)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm hover:border-rose-200 dark:hover:border-rose-800 transition">
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Tổng dư nợ</p>
            <p className="text-sm font-black text-rose-600 dark:text-rose-400 truncate mt-0.5" title={formatCurrency(stats.totalDebt)}>
              {formatCurrency(stats.totalDebt)}
            </p>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm hover:border-amber-200 dark:hover:border-amber-800 transition col-span-2 sm:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Khoá giao dịch</p>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{stats.locked}</p>
          </div>
        </div>
      </div>
      {/* THANH TÌM KIẾM & BỘ LỌC ĐA TIÊU CHÍ (SCRUM-229) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6 space-y-4">
        {/* Hàng 1: Ô tìm nhanh toàn cục */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm nhanh đại lý theo mã (KH-1001), tên đại lý hoặc số điện thoại..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-11 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                updateParams({ q: null, page: '1' });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Xóa tìm kiếm"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Hàng 2: Bộ lọc theo các tiêu chí (Khu vực, Nhóm, Người phụ trách, Trạng thái) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Lọc theo Khu vực */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Khu Vực / Địa Bàn
            </label>
            <select
              value={urlRegion}
              onChange={(e) => updateParams({ region: e.target.value, page: '1' })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả khu vực</option>
              {filterOptions.regions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Nhóm khách hàng */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Nhóm Khách Hàng
            </label>
            <select
              value={urlGroup}
              onChange={(e) => updateParams({ group: e.target.value, page: '1' })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả nhóm</option>
              <option value="TIER_1">Đại lý cấp 1 (TIER_1)</option>
              <option value="TIER_2">Đại lý cấp 2 (TIER_2)</option>
              <option value="VIP">Khách hàng VIP</option>
              <option value="WHOLESALE">Khách bán buôn</option>
              <option value="RETAIL">Khách lẻ thông thường</option>
            </select>
          </div>

          {/* Lọc theo Người phụ trách */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Nhân Viên Phụ Trách
            </label>
            <select
              value={urlRep}
              onChange={(e) => updateParams({ rep: e.target.value, page: '1' })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả nhân viên</option>
              {filterOptions.sales_reps.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Trạng thái */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Trạng Thái Giao Dịch
            </label>
            <select
              value={urlStatus}
              onChange={(e) => updateParams({ status: e.target.value, page: '1' })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Tạm ngưng giao dịch</option>
              <option value="locked">Bị khóa công nợ / hạn chế</option>
            </select>
          </div>
        </div>

        {/* Thông tin bộ lọc đang áp dụng & Nút Reset */}
        {(urlSearch || urlRegion !== 'all' || urlGroup !== 'all' || urlRep !== 'all' || urlStatus !== 'all') && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Đang lọc:</span>
              {urlSearch && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                  Từ khóa: "{urlSearch}"
                  <button onClick={() => updateParams({ q: null, page: '1' })}><X className="w-3 h-3" /></button>
                </span>
              )}
              {urlRegion !== 'all' && (
                <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                  Khu vực: {urlRegion}
                  <button onClick={() => updateParams({ region: null, page: '1' })}><X className="w-3 h-3" /></button>
                </span>
              )}
              {urlGroup !== 'all' && (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                  Nhóm: {urlGroup}
                  <button onClick={() => updateParams({ group: null, page: '1' })}><X className="w-3 h-3" /></button>
                </span>
              )}
              {urlRep !== 'all' && (
                <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                  Phụ trách: {urlRep}
                  <button onClick={() => updateParams({ rep: null, page: '1' })}><X className="w-3 h-3" /></button>
                </span>
              )}
              {urlStatus !== 'all' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  Trạng thái: {urlStatus}
                  <button onClick={() => updateParams({ status: null, page: '1' })}><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>

            <button
              onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Đặt lại bộ lọc</span>
            </button>
          </div>
        )}
      </div>

      {/* HIỂN THỊ DỮ LIỆU: BẢNG CHI TIẾT HOẶC THẺ DI ĐỘNG */}
      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={customers}
          loading={isLoading}
          keyExtractor={(c) => c.id}
          serverSidePagination={true}
          totalRecords={totalCount}
          currentPage={urlPage}
          pageSize={urlPageSize}
          onPageChange={(p) => updateParams({ page: String(p) })}
          onPageSizeChange={(ps) => updateParams({ pageSize: String(ps), page: '1' })}
          emptyTitle="Không tìm thấy đại lý nào phù hợp"
          emptyDescription="Thử nới lỏng từ khóa hoặc bộ lọc để hiển thị kết quả."
        />
      ) : (
        /* GIAO DIỆN THẺ NGOÀI ĐƯỜNG CHO SALES REP */
        <div>
          {isLoading ? (
            <div className="p-12 text-center text-slate-400">Đang tải danh sách đại lý...</div>
          ) : customers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
              <EmptyState
                icon={<Users className="w-10 h-10 text-slate-300" />}
                title="Không có đại lý phù hợp"
                description="Thử thay đổi từ khóa hoặc điều kiện bộ lọc để xem kết quả."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customers.map((c) => (
                <div
                  key={c.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header Thẻ: Mã, Tên, Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                          {c.code}
                        </span>
                        <Link
                          to={`/customers/${c.id}`}
                          className="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-indigo-600 block mt-1 line-clamp-1"
                        >
                          {c.name}
                        </Link>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div>{getStatusBadge(c.status)}</div>
                        {(c.isFlagged || c.is_flagged) && (c.riskLevel || c.risk_level) && (c.riskLevel || c.risk_level) !== 'SAFE' && (
                          <span
                            className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-200"
                            title={c.flagReason || c.flag_reason || undefined}
                          >
                            Cờ: {c.riskLevel || c.risk_level}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Địa chỉ & Khu vực */}
                    <div className="text-xs text-slate-500 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{c.address || 'Chưa cập nhật địa chỉ'}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-slate-400">Khu vực:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {c.region || 'Toàn quốc'}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>{getGroupBadge(c.customer_group || c.customerGroup)}</span>
                      </div>
                    </div>

                    {/* Người phụ trách & Số điện thoại hotline */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Phụ trách:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                          {c.assignedStaffName || c.assigned_sales_rep || c.assignedSalesRep || 'Chưa phân công'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Doanh số:</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(c.totalSpent)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Hạn mức / Nợ:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          <span className="text-purple-600 dark:text-purple-400">{formatCurrency(c.creditLimit || c.credit_limit || 50000000)}</span>
                          {' | '}
                          <span className={(c.currentDebt || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            Nợ: {formatCurrency(c.currentDebt || 0)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Nhanh Ngoài Hiện Trường */}
                  <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                    <a
                      href={`tel:${c.phone}`}
                      className="py-1.5 px-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{c.phone}</span>
                    </a>
                    <Link
                      to={`/orders/create?customerId=${c.id}`}
                      className="py-1.5 px-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold text-xs flex items-center justify-center gap-1 hover:bg-blue-100 transition-colors"
                      title="Tạo đơn hàng hiện trường"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Tạo đơn</span>
                    </Link>
                    {canManageCredit && (
                      <button
                        onClick={() => handleOpenCreditModal(c)}
                        className="p-1.5 rounded-xl border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-purple-600 dark:text-purple-400"
                        title="Thiết lập hạn mức tín dụng"
                      >
                        <CreditCard className="w-4 h-4" />
                      </button>
                    )}
                    <Link
                      to={`/customers/${c.id}`}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Xem chi tiết"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleOpenEdit(c)}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Sửa"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phân trang khi xem dạng thẻ ngoài hiện trường */}
          {totalCount > 0 && (
            <div className="mt-4 p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select
                  value={urlPageSize}
                  onChange={(e) => updateParams({ pageSize: e.target.value, page: '1' })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-medium cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span>trong tổng số {totalCount.toLocaleString('vi-VN')} bản ghi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateParams({ page: String(Math.max(1, urlPage - 1)) })}
                  disabled={urlPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-medium">Trang {urlPage} / {totalPages}</span>
                <button
                  onClick={() => updateParams({ page: String(Math.min(totalPages, urlPage + 1)) })}
                  disabled={urlPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Trang sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Modal Phân công người phụ trách đơn lẻ */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Phân công phụ trách đại lý: ${targetCustomer?.name || ''}`}
        size="md"
      >
        <form onSubmit={handleConfirmAssign} className="space-y-4">
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-300">
            <div>Mã đại lý: <strong>{targetCustomer?.code}</strong></div>
            <div>Người phụ trách hiện tại: <strong>{targetCustomer?.assignedStaffName || 'Chưa phân công'}</strong></div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nhân viên kinh doanh mới <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">-- Chọn nhân viên kinh doanh --</option>
              {salesReps.map((sr) => (
                <option key={sr.id} value={sr.id}>
                  {sr.fullName} ({sr.assignedCustomerCount} đại lý)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do phân công <span className="text-rose-500">* (tối thiểu 5 ký tự)</span>
            </label>
            <textarea
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Nhập lý do phân công phụ trách đại lý..."
              rows={3}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            {targetCustomer?.assignedStaffId ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmUnassign}
                disabled={assignLoading}
              >
                Hủy phân công
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAssignModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={assignLoading}>
                {assignLoading ? 'Đang lưu...' : 'Xác nhận phân công'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Chuyển giao người phụ trách đại lý hàng loạt */}
      <Modal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title="Chuyển giao người phụ trách đại lý hàng loạt"
        size="lg"
      >
        <form onSubmit={handleConfirmBulkTransfer} className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              Tính năng dùng khi nhân viên nghỉ việc hoặc điều chuyển địa bàn. Toàn bộ lịch sử chuyển giao sẽ được
              lưu vết kiểm toán và áp dụng ngay lập tức cho các giao dịch bán hàng liên quan.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhân viên bàn giao (người cũ) <span className="text-rose-500">*</span>
              </label>
              <select
                value={bulkFromStaffId}
                onChange={(e) => setBulkFromStaffId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Chọn nhân viên bàn giao --</option>
                {salesReps.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.fullName} ({sr.assignedCustomerCount} đại lý)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhân viên tiếp nhận (người mới) <span className="text-rose-500">*</span>
              </label>
              <select
                value={bulkToStaffId}
                onChange={(e) => setBulkToStaffId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Chọn nhân viên tiếp nhận --</option>
                {salesReps
                  .filter((sr) => sr.id !== bulkFromStaffId)
                  .map((sr) => (
                    <option key={sr.id} value={sr.id}>
                      {sr.fullName} ({sr.assignedCustomerCount} đại lý)
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={bulkTransferAll}
                onChange={(e) => setBulkTransferAll(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"
              />
              <span>
                Chuyển giao <strong>toàn bộ tất cả đại lý</strong> của nhân viên bàn giao (không chỉ các đại lý đang chọn)
              </span>
            </label>
            {!bulkTransferAll && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Đang chọn: <strong>{selectedCustomerIds.length}</strong> đại lý để chuyển giao.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do chuyển giao địa bàn <span className="text-rose-500">* (5 - 500 ký tự)</span>
            </label>
            <textarea
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Ví dụ: Bàn giao toàn bộ đại lý do nhân viên nghỉ việc từ tháng 11..."
              rows={3}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setBulkModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={bulkLoading}>
              {bulkLoading ? 'Đang chuyển giao...' : 'Xác nhận chuyển giao'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Thêm mới / Chỉnh sửa đại lý */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Chỉnh sửa thông tin đại lý' : 'Thêm mới đại lý'}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên đại lý / Khách hàng <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhóm khách hàng
              </label>
              <select
                value={formData.customer_group}
                onChange={(e) => setFormData({ ...formData, customer_group: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="RETAIL">Khách lẻ (RETAIL)</option>
                <option value="TIER_1">Đại lý cấp 1 (TIER_1)</option>
                <option value="TIER_2">Đại lý cấp 2 (TIER_2)</option>
                <option value="VIP">Khách hàng VIP</option>
                <option value="WHOLESALE">Bán buôn</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã số thuế
              </label>
              <input
                type="text"
                placeholder="Ví dụ: 0301234567"
                value={formData.tax_code}
                onChange={(e) => setFormData({ ...formData, tax_code: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Khu vực địa bàn
              </label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {filterOptions.regions.map((reg) => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Người phụ trách
              </label>
              <select
                value={formData.assigned_sales_rep}
                onChange={(e) => setFormData({ ...formData, assigned_sales_rep: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {filterOptions.sales_reps.map((rep) => (
                  <option key={rep} value={rep}>{rep}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ chi tiết
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Trạng thái</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="active">Hoạt động</option>
              <option value="inactive">Tạm ngưng</option>
              <option value="locked">Bị khóa</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Lưu thông tin
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Thiết Lập Hạn Mức Tín Dụng & Công Nợ */}
      <Modal
        isOpen={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        title="Thiết Lập Hạn Mức Tín Dụng & Công Nợ"
        maxWidth="md"
      >
        {creditCustomer && (
          <form onSubmit={handleCreditSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
              <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Đại lý: {creditCustomer.name} ({creditCustomer.code})</p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                  Thiết lập hạn mức công nợ và số ngày nợ tối đa cho phép. Thay đổi sẽ được ghi vào lịch sử kiểm toán của hệ thống.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Hạn mức công nợ tối đa (VNĐ) *
              </label>
              <CurrencyInput
                value={creditLimitInput}
                onChange={(val) => setCreditLimitInput(val)}
                suffix="VNĐ"
                placeholder="Ví dụ: 50.000.000"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Giá trị: {formatCurrency(creditLimitInput)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số ngày nợ tối đa (ngày) *
              </label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[0, 15, 30, 45].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setMaxDebtDaysInput(d)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                      maxDebtDaysInput === d
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {d === 0 ? '0 ngày' : `${d} ngày`}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="0"
                max="365"
                value={maxDebtDaysInput}
                onChange={(e) => setMaxDebtDaysInput(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {maxDebtDaysInput === 0 ? '0 = Bắt buộc thanh toán ngay, không cho nợ ngày' : `Đại lý được nợ tối đa ${maxDebtDaysInput} ngày kể từ khi xuất kho.`}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Lý do điều chỉnh hạn mức
              </label>
              <textarea
                value={creditReasonInput}
                onChange={(e) => setCreditReasonInput(e.target.value)}
                placeholder="Nhập ghi chú hoặc lý do phê duyệt hạn mức mới..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreditModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={submittingCredit}>
                Xác nhận lưu hạn mức
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Dialog xác nhận xóa */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xóa thông tin đại lý"
        message="Bạn có chắc chắn muốn xóa đại lý này không? Thao tác này không thể hoàn tác nếu đã phát sinh dữ liệu liên quan."
        confirmText="Xác nhận xóa"
      />
    </PageContainer>
  );
};
