import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Building2,
  Eye,
  Edit,
  Trash2,
  Mail,
  Phone,
  ArrowDownLeft,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatters';
import { supplierService } from '../../services/supplierService';
import { Supplier } from '../../types/Supplier';
import { useToast } from '../../contexts/ToastContext';

export const SupplierList: React.FC = () => {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    status: 'active' as 'active' | 'inactive',
  });

  const loadSuppliers = async () => {
    const data = await supplierService.getAll();
    setSuppliers(data);
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
        s.phone.includes(search) ||
        s.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [suppliers, search]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormData({
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      status: s.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      showToast('Vui lòng nhập tên nhà cung cấp và số điện thoại', 'warning');
      return;
    }

    try {
      if (editingSupplier) {
        await supplierService.update(editingSupplier.id, formData);
        showToast('Cập nhật nhà cung cấp thành công!', 'success');
      } else {
        await supplierService.create(formData);
        showToast('Thêm mới nhà cung cấp thành công!', 'success');
      }
      setIsModalOpen(false);
      loadSuppliers();
    } catch {
      showToast('Có lỗi xảy ra', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supplierService.delete(deleteId);
      showToast('Đã xóa nhà cung cấp', 'success');
      setDeleteId(null);
      loadSuppliers();
    } catch {
      showToast('Lỗi khi xóa nhà cung cấp', 'error');
    }
  };

  const columns: Column<Supplier>[] = [
    {
      key: 'code',
      header: 'Mã NCC',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
    },
    {
      key: 'name',
      header: 'Tên Nhà Cung Cấp',
      sortable: true,
      className: 'min-w-[200px]',
      render: (s) => (
        <div>
          <Link
            to={`/suppliers/${s.id}`}
            className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 block truncate"
          >
            {s.name}
          </Link>
          <span className="text-xs text-slate-400 truncate block max-w-xs">{s.address}</span>
        </div>
      ),
    },
    {
      key: 'contactPerson',
      header: 'Người Liên Hệ',
      sortable: true,
      render: (s) => (
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-slate-800 dark:text-slate-200">{s.contactPerson}</div>
          <div className="text-slate-400">{s.phone}</div>
        </div>
      ),
    },
    {
      key: 'totalImports',
      header: 'Số Lần Nhập',
      sortable: true,
      render: (s) => (
        <span className="font-bold text-slate-800 dark:text-slate-200">{s.totalImports} phiếu</span>
      ),
    },
    {
      key: 'totalSpent',
      header: 'Tổng Giá Trị Nhập',
      sortable: true,
      render: (s) => (
        <span className="font-black text-slate-900 dark:text-white">
          {formatCurrency(s.totalSpent)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (s) => (
        <Badge variant={s.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
          {s.status === 'active' ? 'Hợp tác' : 'Tạm dừng'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (s) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/suppliers/${s.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Xem chi tiết"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={() => handleOpenEdit(s)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Chỉnh sửa"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteId(s.id)}
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
      title="Nhà Cung Cấp"
      subtitle={`Quản lý ${suppliers.length} đối tác phân phối và cung ứng hàng hóa`}
      actions={
        <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Thêm nhà cung cấp
        </Button>
      }
    >
      <DataTable
        data={filteredSuppliers}
        columns={columns}
        keyExtractor={(s) => s.id}
        filterComponent={
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên NCC, người liên hệ, số điện thoại..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        }
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'Chỉnh Sửa Nhà Cung Cấp' : 'Thêm Mới Nhà Cung Cấp'}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên nhà cung cấp *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: Apple Distribution VN"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Người liên hệ chính *
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
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
                placeholder="028 1234 5678"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email giao dịch
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@supplier.vn"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ trụ sở / Kho
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Tòa nhà, số đường, quận, tỉnh thành"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              {editingSupplier ? 'Lưu thay đổi' : 'Thêm nhà cung cấp'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xác nhận xóa nhà cung cấp"
        message="Hành động này sẽ xóa nhà cung cấp khỏi danh mục đối tác hiện tại."
        confirmText="Xóa nhà cung cấp"
        variant="danger"
      />
    </PageContainer>
  );
};
