import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Users,
  Eye,
  Edit,
  Trash2,
  UserCheck,
  ArrowRightLeft,
  Filter,
  CheckSquare,
  Square,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { Customer, SalesRep } from '../../types/Customer';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const CustomerList: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('q') || '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [search, setSearch] = useState(urlSearch);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Bộ lọc
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');

  // Đánh giá quyền hạn người dùng
  const roleStr = String(user?.role || '').toLowerCase();
  const isManagerOrAdmin = roleStr.includes('admin') || roleStr.includes('manager') || roleStr.includes('director');
  const isSalesRep = !isManagerOrAdmin && (roleStr.includes('rep') || roleStr.includes('staff') || roleStr.includes('sales'));

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

  // Modal Thêm/Sửa đại lý
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    status: 'active' as 'active' | 'inactive',
  });

  const loadData = async () => {
    try {
      const custData = await customerService.getAll();
      setCustomers(custData);

      if (isManagerOrAdmin) {
        const repData = await customerService.getSalesReps();
        setSalesReps(repData);
      }
    } catch {
      showToast('Không thể tải dữ liệu đại lý', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    const params = new URLSearchParams(searchParams);
    if (newSearch.trim()) params.set('q', newSearch.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  // Lọc dữ liệu đại lý theo tìm kiếm, người phụ trách và khu vực
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // 1. Tìm kiếm chuỗi
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.address.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      // 2. Lọc theo nhân viên phụ trách (Manager/Admin)
      if (staffFilter === 'unassigned') {
        if (c.assignedStaffId) return false;
      } else if (staffFilter !== 'all') {
        if (String(c.assignedStaffId) !== String(staffFilter)) return false;
      }

      // 3. Lọc theo khu vực
      if (regionFilter !== 'all') {
        const addr = c.address.toLowerCase();
        const reg = regionFilter.toLowerCase();
        if (reg === 'miền bắc' && !addr.includes('hà nội') && !addr.includes('hải phòng') && !addr.includes('bắc')) return false;
        if (reg === 'miền trung' && !addr.includes('đà nẵng') && !addr.includes('huế') && !addr.includes('trung')) return false;
        if (reg === 'miền nam' && !addr.includes('hcm') && !addr.includes('hồ chí minh') && !addr.includes('nam')) return false;
        if (!['miền bắc', 'miền trung', 'miền nam'].includes(reg) && !addr.includes(reg)) return false;
      }

      return true;
    });
  }, [customers, search, staffFilter, regionFilter]);

  // Xử lý chọn checkbox
  const handleToggleSelect = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedCustomerIds.length === filteredCustomers.length) {
      setSelectedCustomerIds([]);
    } else {
      setSelectedCustomerIds(filteredCustomers.map((c) => c.id));
    }
  };

  // Mở modal phân công đơn lẻ
  const handleOpenAssign = (c: Customer) => {
    setTargetCustomer(c);
    setSelectedStaffId(c.assignedStaffId || '');
    setAssignReason('');
    setAssignModalOpen(true);
  };

  // Thực hiện phân công đơn lẻ
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
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi khi thực hiện phân công';
      showToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  // Hủy phân công đơn lẻ
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
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi khi hủy phân công';
      showToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  // Mở modal chuyển giao hàng loạt
  const handleOpenBulkTransfer = () => {
    if (selectedCustomerIds.length === 0) {
      showToast('Vui lòng chọn ít nhất một đại lý để chuyển giao', 'warning');
      return;
    }

    // Tự động suy ra nhân viên cũ nếu tất cả đại lý chọn cùng 1 nhân viên
    const selectedCustomers = customers.filter((c) => selectedCustomerIds.includes(c.id));
    const firstStaffId = selectedCustomers[0]?.assignedStaffId || '';
    const allSameStaff = selectedCustomers.every((c) => c.assignedStaffId === firstStaffId);

    setBulkFromStaffId(allSameStaff ? firstStaffId : '');
    setBulkToStaffId('');
    setBulkTransferAll(false);
    setBulkReason('');
    setBulkModalOpen(true);
  };

  // Thực hiện chuyển giao hàng loạt
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
      showToast('Nhân viên tiếp nhận không được trùng với nhân viên bàn giao', 'warning');
      return;
    }
    if (bulkReason.trim().length < 5) {
      showToast('Lý do chuyển giao phải có ít nhất 5 ký tự', 'warning');
      return;
    }

    setBulkLoading(true);
    try {
      const payload = {
        from_staff_id: bulkFromStaffId,
        to_staff_id: bulkToStaffId,
        transfer_all: bulkTransferAll,
        customer_ids: bulkTransferAll ? [] : selectedCustomerIds,
        reason: bulkReason.trim(),
      };
      const res = await customerService.bulkTransfer(payload);
      showToast(res.message || `Chuyển giao thành công ${res.transferred_count} đại lý!`, 'success');
      setBulkModalOpen(false);
      setSelectedCustomerIds([]);
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi khi chuyển giao đại lý hàng loạt';
      showToast(msg, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', email: '', address: '', status: 'active' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      status: c.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      showToast('Vui lòng nhập tên và số điện thoại khách hàng', 'warning');
      return;
    }

    try {
      if (editingCustomer) {
        await customerService.update(editingCustomer.id, formData);
        showToast('Cập nhật thông tin khách hàng thành công!', 'success');
      } else {
        await customerService.create(formData);
        showToast('Thêm mới khách hàng thành công!', 'success');
      }
      setIsModalOpen(false);
      loadData();
    } catch {
      showToast('Có lỗi xảy ra', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await customerService.delete(deleteId);
      showToast('Đã xóa khách hàng', 'success');
      setDeleteId(null);
      loadData();
    } catch {
      showToast('Lỗi khi xóa khách hàng', 'error');
    }
  };

  // Cấu hình các cột hiển thị trên bảng dữ liệu
  const columns: Column<Customer>[] = [
    ...(isManagerOrAdmin
      ? [
          {
            key: 'select',
            header: (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-slate-400 hover:text-indigo-600 focus:outline-none"
                title="Chọn tất cả"
              >
                {selectedCustomerIds.length > 0 && selectedCustomerIds.length === filteredCustomers.length ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            ),
            className: 'w-10 text-center',
            render: (c: Customer) => (
              <button
                type="button"
                onClick={() => handleToggleSelect(c.id)}
                className="text-slate-400 hover:text-indigo-600 focus:outline-none"
              >
                {selectedCustomerIds.includes(c.id) ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            ),
          },
        ]
      : []),
    {
      key: 'code',
      header: 'Mã Đại Lý',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
    },
    {
      key: 'name',
      header: 'Tên Đại Lý & Khu Vực',
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
      key: 'assignedStaffName',
      header: 'Nhân Viên Phụ Trách',
      sortable: true,
      className: 'min-w-[170px]',
      render: (c) => {
        if (c.assignedStaffName) {
          const initials = c.assignedStaffName.slice(0, 2).toUpperCase();
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="truncate">
                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                  {c.assignedStaffName}
                </div>
                {c.assignedStaffPhone && (
                  <div className="text-[11px] text-slate-400">{c.assignedStaffPhone}</div>
                )}
              </div>
            </div>
          );
        }
        return (
          <Badge variant="warning" size="sm">
            Chưa phân công
          </Badge>
        );
      },
    },
    {
      key: 'phone',
      header: 'Liên Hệ',
      sortable: true,
      render: (c) => (
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-slate-800 dark:text-slate-200">{c.phone}</div>
          <div className="text-slate-400">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'totalOrders',
      header: 'Đơn Hàng',
      sortable: true,
      render: (c) => <span className="font-bold text-slate-800 dark:text-slate-200">{c.totalOrders} đơn</span>,
    },
    {
      key: 'totalSpent',
      header: 'Tổng Chi Tiêu',
      sortable: true,
      render: (c) => (
        <span className="font-black text-indigo-600 dark:text-indigo-400">
          {formatCurrency(c.totalSpent)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (c) => (
        <Badge variant={c.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
          {c.status === 'active' ? 'Hoạt động' : 'Tạm ngưng'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1.5">
          {isManagerOrAdmin && (
            <button
              onClick={() => handleOpenAssign(c)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={c.assignedStaffId ? 'Đổi người phụ trách' : 'Phân công phụ trách'}
            >
              <UserCheck className="w-4 h-4" />
            </button>
          )}
          <Link
            to={`/customers/${c.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Xem chi tiết"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={() => handleOpenEdit(c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Chỉnh sửa"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteId(c.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="Xóa"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Quản Lý Đại Lý & Khách Hàng"
      subtitle={
        isSalesRep
          ? `Danh sách các đại lý đang thuộc phạm vi quản lý của bạn (${filteredCustomers.length} đại lý)`
          : `Theo dõi hồ sơ và điều phối ${customers.length} đại lý kinh doanh toàn hệ thống`
      }
      actions={
        <div className="flex items-center gap-2">
          {isManagerOrAdmin && selectedCustomerIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenBulkTransfer}
              leftIcon={<ArrowRightLeft className="w-4 h-4 text-indigo-600" />}
            >
              Chuyển giao hàng loạt ({selectedCustomerIds.length})
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
            Thêm đại lý mới
          </Button>
        </div>
      }
    >
      <DataTable
        data={filteredCustomers}
        columns={columns}
        keyExtractor={(c) => c.id}
        filterComponent={
          <div className="flex flex-wrap items-center gap-3 w-full">
            {/* Thanh tìm kiếm */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm theo tên đại lý, số điện thoại, mã đại lý, khu vực..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Bộ lọc nhân viên phụ trách (chỉ Manager/Admin thấy) */}
            {isManagerOrAdmin && (
              <div className="w-56">
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Tất cả nhân viên phụ trách</option>
                  <option value="unassigned">Chưa phân công phụ trách</option>
                  {salesReps.map((sr) => (
                    <option key={sr.id} value={sr.id}>
                      {sr.fullName} ({sr.assignedCustomerCount} đại lý)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bộ lọc khu vực */}
            <div className="w-44">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả khu vực</option>
                <option value="Hà Nội">Hà Nội</option>
                <option value="TP. HCM">TP. Hồ Chí Minh</option>
                <option value="Đà Nẵng">Đà Nẵng</option>
                <option value="Miền Bắc">Miền Bắc</option>
                <option value="Miền Trung">Miền Trung</option>
                <option value="Miền Nam">Miền Nam</option>
              </select>
            </div>
          </div>
        }
      />

      {/* Modal Phân công / Đổi người phụ trách đơn lẻ */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={targetCustomer?.assignedStaffId ? 'Điều chỉnh nhân viên phụ trách đại lý' : 'Phân công nhân viên phụ trách đại lý'}
        size="md"
      >
        <form onSubmit={handleConfirmAssign} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">Đại lý: </span>
            {targetCustomer?.name} ({targetCustomer?.code})
            {targetCustomer?.assignedStaffName && (
              <div className="mt-1">
                <span className="font-semibold text-slate-900 dark:text-white">Người phụ trách hiện tại: </span>
                {targetCustomer.assignedStaffName}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nhân viên kinh doanh phụ trách <span className="text-rose-500">*</span>
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
                  {sr.fullName} ({sr.email}) - Đang phụ trách {sr.assignedCustomerCount} đại lý
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do phân công / điều chỉnh <span className="text-rose-500">* (5 - 500 ký tự)</span>
            </label>
            <textarea
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Nhập lý do phân công hoặc chuyển giao người phụ trách..."
              rows={3}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <div className="text-right text-[11px] text-slate-400 mt-0.5">
              {assignReason.trim().length}/500 ký tự
            </div>
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

      {/* Modal Chuyển giao người phụ trách hàng loạt */}
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
            <div className="text-right text-[11px] text-slate-400 mt-0.5">
              {bulkReason.trim().length}/500 ký tự
            </div>
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ / Khu vực
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
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="active">Hoạt động</option>
              <option value="inactive">Tạm ngưng</option>
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

      {/* Dialog xác nhận xóa */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xóa thông tin đại lý"
        message="Bạn có chắc chắn muốn xóa đại lý này không? Thao tác này không thể hoàn tác."
        confirmText="Xác nhận xóa"
      />
    </PageContainer>
  );
};
