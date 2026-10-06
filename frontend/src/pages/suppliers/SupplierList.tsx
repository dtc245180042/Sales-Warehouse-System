import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  Ban,
  Building2,
  Receipt,
  CreditCard,
  Phone,
  Mail,
  Filter,
  Lock,
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

const PAYMENT_TERM_PRESETS = [
  'COD',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Trả trước 100%',
];

const getPaymentTermBadgeVariant = (terms?: string) => {
  if (!terms) return 'neutral';
  if (terms.includes('COD')) return 'success';
  if (terms.includes('Net 15') || terms.includes('Net 30')) return 'primary';
  if (terms.includes('Net 45') || terms.includes('Net 60')) return 'warning';
  if (terms.includes('Trả trước')) return 'danger';
  return 'neutral';
};

export const SupplierList: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('q') || '';
  const urlStatus = (searchParams.get('status') as 'all' | 'active' | 'inactive') || 'all';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(urlStatus);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Đồng bộ hai chiều từ URL -> State khi người dùng nhấn Back / Forward trên trình duyệt
  useEffect(() => {
    setSearch(urlSearch);
    setStatusFilter(urlStatus);
  }, [urlSearch, urlStatus]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    const params = new URLSearchParams(searchParams);
    if (newSearch.trim()) params.set('q', newSearch.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  const handleStatusChange = (newStatus: 'all' | 'active' | 'inactive') => {
    setStatusFilter(newStatus);
    const params = new URLSearchParams(searchParams);
    if (newStatus && newStatus !== 'all') params.set('status', newStatus);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };

  // Tracks which supplier IDs already have import receipts
  const [hasReceiptsMap, setHasReceiptsMap] = useState<Record<string, boolean>>({});

  // Suspend modal state
  const [suspendTarget, setSuspendTarget] = useState<Supplier | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    taxCode: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: 'Net 30',
    status: 'active' as 'active' | 'inactive',
  });

  const loadSuppliers = async () => {
    const data = await supplierService.getAll();
    setSuppliers(data);

    // Batch-check which suppliers have import receipts
    const map: Record<string, boolean> = {};
    await Promise.all(
      data.map(async (s) => {
        map[s.id] = await supplierService.hasImportReceipts(s.id);
      })
    );
    setHasReceiptsMap(map);
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const query = search.trim().toLowerCase();
      const matchSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query) ||
        (s.taxCode && s.taxCode.toLowerCase().includes(query)) ||
        s.contactPerson.toLowerCase().includes(query) ||
        s.phone.includes(query) ||
        (s.email && s.email.toLowerCase().includes(query)) ||
        (s.paymentTerms && s.paymentTerms.toLowerCase().includes(query));

      const matchStatus = statusFilter === 'all' || s.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [suppliers, search, statusFilter]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    const nextNum = suppliers.length + 1;
    setFormData({
      code: `NCC-${String(nextNum).padStart(2, '0')}`,
      name: '',
      taxCode: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      paymentTerms: 'Net 30',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormData({
      code: s.code,
      name: s.name,
      taxCode: s.taxCode || '',
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email || '',
      address: s.address || '',
      paymentTerms: s.paymentTerms || 'Net 30',
      status: s.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      showToast('Vui lòng nhập mã nhà cung cấp', 'warning');
      return;
    }
    if (!formData.name.trim()) {
      showToast('Vui lòng nhập tên nhà cung cấp', 'warning');
      return;
    }
    if (!formData.contactPerson.trim()) {
      showToast('Vui lòng nhập người liên hệ chính', 'warning');
      return;
    }
    if (!formData.phone.trim()) {
      showToast('Vui lòng nhập số điện thoại', 'warning');
      return;
    }

    // Check duplicate code
    const isDuplicateCode = suppliers.some(
      (s) => s.code.toLowerCase() === formData.code.trim().toLowerCase() && s.id !== editingSupplier?.id
    );
    if (isDuplicateCode) {
      showToast('Mã nhà cung cấp đã tồn tại trong hệ thống', 'error');
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
      showToast('Có lỗi xảy ra khi lưu thông tin', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supplierService.delete(deleteId);
      showToast('Đã xóa nhà cung cấp thành công', 'success');
      setDeleteId(null);
      loadSuppliers();
    } catch {
      showToast('Lỗi khi xóa nhà cung cấp', 'error');
    }
  };

  const handleOpenSuspend = (s: Supplier) => {
    setSuspendTarget(s);
    setSuspendReason('');
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    if (!suspendReason.trim()) {
      showToast('Vui lòng nhập lý do ngừng giao dịch', 'warning');
      return;
    }
    setSuspendLoading(true);
    try {
      await supplierService.suspend(suspendTarget.id, suspendReason);
      showToast(
        `Đã ngừng giao dịch với "${suspendTarget.name}". Lý do: ${suspendReason}`,
        'success'
      );
      setSuspendTarget(null);
      setSuspendReason('');
      loadSuppliers();
    } catch {
      showToast('Có lỗi khi ngừng giao dịch', 'error');
    } finally {
      setSuspendLoading(false);
    }
  };

  const columns: Column<Supplier>[] = [
    {
      key: 'code',
      header: 'Mã NCC',
      sortable: true,
      className: 'font-semibold whitespace-nowrap',
      render: (s) => (
        <Link
          to={`/suppliers/${s.id}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-bold hover:bg-indigo-100 transition-colors"
        >
          <Building2 className="w-3.5 h-3.5" />
          {s.code}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Tên Nhà Cung Cấp',
      sortable: true,
      className: 'min-w-[220px]',
      render: (s) => (
        <div>
          <Link
            to={`/suppliers/${s.id}`}
            className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 block transition-colors"
          >
            {s.name}
          </Link>
          <span className="text-xs text-slate-400 truncate block max-w-xs mt-0.5">
            {s.address || 'Chưa có thông tin địa chỉ'}
          </span>
        </div>
      ),
    },
    {
      key: 'taxCode',
      header: 'Mã Số Thuế',
      sortable: true,
      className: 'whitespace-nowrap',
      render: (s) => (
        s.taxCode ? (
          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
            <Receipt className="w-3 h-3 text-slate-400" />
            {s.taxCode}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">Chưa cập nhật</span>
        )
      ),
    },
    {
      key: 'contactPerson',
      header: 'Người Liên Hệ',
      sortable: true,
      render: (s) => (
        <div className="text-xs space-y-0.5">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            {s.contactPerson}
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Phone className="w-3 h-3 text-slate-400" />
            <a href={`tel:${s.phone}`} className="hover:text-indigo-600">
              {s.phone}
            </a>
          </div>
          {s.email && (
            <div className="flex items-center gap-1 text-slate-400 truncate max-w-[160px]">
              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{s.email}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'paymentTerms',
      header: 'Điều Khoản TT',
      sortable: true,
      className: 'whitespace-nowrap',
      render: (s) => (
        <Badge variant={getPaymentTermBadgeVariant(s.paymentTerms)} size="sm">
          <CreditCard className="w-3 h-3 mr-1 inline-block" />
          {s.paymentTerms || 'Net 30'}
        </Badge>
      ),
    },
    {
      key: 'totalImports',
      header: 'Số Lần Nhập',
      sortable: true,
      render: (s) => (
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {s.totalImports} phiếu
        </span>
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
        <div>
          <Badge variant={s.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
            {s.status === 'active' ? 'Đang hợp tác' : 'Tạm dừng'}
          </Badge>
          {s.suspendReason && (
            <p
              className="text-[10px] text-amber-600 dark:text-amber-400 max-w-[130px] truncate mt-0.5 font-medium"
              title={`Lý do ngừng giao dịch: ${s.suspendReason}`}
            >
              Lý do: {s.suspendReason}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (s) => {
        const hasReceipts = hasReceiptsMap[s.id];
        return (
          <div className="flex items-center justify-end gap-1">
            <Link
              to={`/suppliers/${s.id}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Xem chi tiết"
            >
              <Eye className="w-4 h-4" />
            </Link>
            <button
              onClick={() => handleOpenEdit(s)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
              title="Chỉnh sửa"
            >
              <Edit className="w-4 h-4" />
            </button>

            {hasReceipts ? (
              <>
                {s.status === 'active' && (
                  <button
                    onClick={() => handleOpenSuspend(s)}
                    className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                    title="Ngừng giao dịch (Đã phát sinh phiếu nhập hàng)"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    showToast(
                      `Không thể xóa nhà cung cấp "${s.name}": Đã phát sinh ${s.totalImports} phiếu nhập hàng trong hệ thống. Vui lòng sử dụng thao tác "Ngừng giao dịch".`,
                      'warning'
                    );
                  }}
                  className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 transition-colors cursor-not-allowed"
                  title="Không thể xóa – NCC đã phát sinh phiếu nhập hàng (Bấm để xem lý do)"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setDeleteId(s.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                title="Xóa nhà cung cấp"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="Danh Mục Nhà Cung Cấp"
      subtitle={`Quản lý ${suppliers.length} đối tác cung ứng và điều khoản thương mại`}
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={handleOpenCreate}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Thêm nhà cung cấp
        </Button>
      }
    >
      <DataTable
        data={filteredSuppliers}
        columns={columns}
        keyExtractor={(s) => s.id}
        defaultPageSize={10}
        filterComponent={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm theo tên NCC, mã NCC, MST, người liên hệ, SĐT..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value as 'all' | 'active' | 'inactive')}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hợp tác</option>
                <option value="inactive">Tạm dừng</option>
              </select>
            </div>
          </div>
        }
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'Chỉnh Sửa Nhà Cung Cấp' : 'Thêm Mới Nhà Cung Cấp'}
        subtitle={
          editingSupplier
            ? `Cập nhật thông tin cho đối tác ${editingSupplier.name}`
            : 'Nhập thông tin mã, tên, mã số thuế, liên hệ và điều khoản thanh toán'
        }
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã nhà cung cấp <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="VD: NCC-01"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                required
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Mã định danh duy nhất trong hệ thống
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã số thuế (MST)
              </label>
              <input
                type="text"
                value={formData.taxCode}
                onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                placeholder="VD: 0101234567 hoặc 0309876543-001"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Mã số thuế doanh nghiệp (10 hoặc 13 chữ số)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên nhà cung cấp <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: Công ty TNHH Apple Distribution VN"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Người liên hệ chính <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                placeholder="VD: Nguyễn Văn An"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="VD: 028 3822 1199 hoặc 0909 123 456"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email giao dịch
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="VD: contact@supplier.vn"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Điều khoản thanh toán
              </label>
              <div className="flex gap-2">
                <select
                  value={
                    PAYMENT_TERM_PRESETS.includes(formData.paymentTerms)
                      ? formData.paymentTerms
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      setFormData({ ...formData, paymentTerms: e.target.value });
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  {PAYMENT_TERM_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                  <option value="custom">Tùy chỉnh...</option>
                </select>
                <input
                  type="text"
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  placeholder="Hoặc nhập điều khoản khác..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ trụ sở / Kho xuất hàng
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="VD: Tòa nhà Bitexco, 2 Hải Triều, Bến Nghé, Quận 1, TP. HCM"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Trạng thái hợp tác
            </label>
            <div className="flex items-center gap-6 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  checked={formData.status === 'active'}
                  onChange={() => setFormData({ ...formData, status: 'active' })}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>Đang hợp tác (Active)</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="status"
                  value="inactive"
                  checked={formData.status === 'inactive'}
                  onChange={() => setFormData({ ...formData, status: 'inactive' })}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>Tạm dừng (Inactive)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              {editingSupplier ? 'Lưu thay đổi' : 'Thêm nhà cung cấp'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xác nhận xóa nhà cung cấp"
        message="Hành động này sẽ xóa nhà cung cấp khỏi danh mục đối tác hiện tại. Thao tác không thể hoàn tác."
        confirmText="Xóa nhà cung cấp"
        variant="danger"
      />

      {/* Suspend Modal */}
      <Modal
        isOpen={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title="Ngừng giao dịch với nhà cung cấp"
        subtitle={suspendTarget?.name}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold mb-1">Không thể xóa nhà cung cấp này</p>
              <p className="text-xs leading-relaxed">
                Nhà cung cấp <strong>{suspendTarget?.name}</strong> đã phát sinh phiếu nhập hàng
                trong hệ thống. Để đảm bảo tính toàn vẹn dữ liệu kế toán và kho bãi, bạn chỉ có thể{' '}
                <strong>ngừng giao dịch</strong> thay vì xóa.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Lý do ngừng giao dịch <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="VD: Nhà cung cấp không đáp ứng yêu cầu chất lượng, chấm dứt hợp đồng theo thỏa thuận..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setSuspendTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              isLoading={suspendLoading}
              onClick={handleSuspend}
              leftIcon={<Ban className="w-4 h-4" />}
            >
              Xác nhận ngừng giao dịch
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
