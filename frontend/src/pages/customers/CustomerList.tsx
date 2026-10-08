import React, { useState, useEffect, useMemo } from 'react';
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
  Download,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { Customer } from '../../types/Customer';
import { useToast } from '../../contexts/ToastContext';

export const CustomerList: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('q') || '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState(urlSearch);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Đồng bộ hai chiều từ URL -> State khi người dùng nhấn Back / Forward trên trình duyệt
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

  // Add/Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    status: 'active' as 'active' | 'inactive',
  });

  const loadCustomers = async () => {
    const data = await customerService.getAll();
    setCustomers(data);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [customers, search]);

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
      loadCustomers();
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
      loadCustomers();
    } catch {
      showToast('Lỗi khi xóa khách hàng', 'error');
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: 'Mã KH',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
    },
    {
      key: 'name',
      header: 'Họ & Tên',
      sortable: true,
      className: 'min-w-[180px]',
      render: (c) => (
        <div>
          <Link
            to={`/customers/${c.id}`}
            className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 block truncate"
          >
            {c.name}
          </Link>
          <span className="text-xs text-slate-400 truncate block max-w-xs">{c.address}</span>
        </div>
      ),
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
        <Badge
          variant={c.status === 'locked' ? 'danger' : c.status === 'active' ? 'success' : 'neutral'}
          size="sm"
          dot
        >
          {c.status === 'locked' ? 'Bị khoá GD' : c.status === 'active' ? 'Hoạt động' : 'Tạm ngưng'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Ngày Tham Gia',
      sortable: true,
      render: (c) => <span className="text-xs text-slate-400">{c.createdAt}</span>,
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
      title="Quản Lý Khách Hàng"
      subtitle={`Theo dõi hồ sơ ${customers.length} khách hàng cá nhân và doanh nghiệp`}
      actions={
        <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Thêm khách hàng
        </Button>
      }
    >
      <DataTable
        data={filteredCustomers}
        columns={columns}
        keyExtractor={(c) => c.id}
        filterComponent={
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo tên, số điện thoại, email, mã KH..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        }
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Chỉnh Sửa Thông Tin Khách Hàng' : 'Thêm Mới Khách Hàng'}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Họ và tên / Tên công ty *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nguyễn Văn A / Công ty ABC"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại *
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
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="customer@domain.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ liên hệ
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Số nhà, đường, phường, quận, tỉnh thành"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              {editingCustomer ? 'Lưu thay đổi' : 'Tạo khách hàng'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xác nhận xóa khách hàng"
        message="Bạn có chắc chắn muốn xóa khách hàng này khỏi danh sách quản lý?"
        confirmText="Xóa khách hàng"
        variant="danger"
      />
    </PageContainer>
  );
};
