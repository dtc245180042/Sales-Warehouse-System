import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  ShieldCheck,
  Shield,
  UserCheck,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  Edit,
  Mail,
  Phone,
  AlertTriangle,
  Warehouse as WarehouseIcon,
  CheckCircle2,
  Camera,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { userService } from '../../services/userService';
import { User, UserRole, UserStatus } from '../../types/User';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

const WAREHOUSE_OPTIONS = [
  'Kho Tổng Hà Nội',
  'Kho Tổng TP. HCM',
  'Kho Đà Nẵng',
  'Kho Cần Thơ',
];

const TERRITORY_OPTIONS = [
  'Địa bàn Miền Bắc (Hà Nội, Hải Phòng, Quảng Ninh...)',
  'Địa bàn Miền Trung (Đà Nẵng, Huế, Khánh Hòa...)',
  'Địa bàn Miền Nam (TP. HCM, Bình Dương, Đồng Nai...)',
  'Địa bàn Tây Nguyên (Đắk Lắk, Gia Lai, Lâm Đồng...)',
  'Địa bàn Tây Nam Bộ (Cần Thơ, An Giang, Kiên Giang...)',
];

const AVAILABLE_ROLES: { role: UserRole; label: string; desc: string }[] = [
  { role: 'Admin', label: '1. Quản trị hệ thống (System Admin)', desc: 'Toàn quyền cấu hình, tài khoản, phân quyền & bảo mật' },
  { role: 'SalesManager', label: '2. Quản lý kinh doanh (Sales Manager)', desc: 'Quản lý địa bàn, duyệt đơn, xem giá vốn & biên lợi nhuận' },
  { role: 'SalesStaff', label: '3. Nhân viên kinh doanh (Sales Staff / Rep)', desc: 'Chăm sóc đại lý, tạo đơn thị trường, không xem giá vốn' },
  { role: 'WarehouseManager', label: '4. Quản lý kho (Warehouse Manager)', desc: 'Toàn quyền quản lý nhập/xuất/tồn kho được gán' },
  { role: 'WarehouseStaff', label: '5. Thủ kho (Warehouse Staff)', desc: 'Thao tác nhập/xuất kho phụ trách, không xem giá vốn' },
  { role: 'Accountant', label: '6. Kế toán (Accountant)', desc: 'Quản lý công nợ, hóa đơn chứng từ, không sửa tồn kho' },
  { role: 'Director', label: '7. Ban giám đốc (Director / Executive)', desc: 'Xem báo cáo tổng thể, chiến lược toàn hệ thống' },
];

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    role: 'SalesStaff' as UserRole,
    roles: ['SalesStaff'] as UserRole[],
    warehouse: 'Kho Tổng TP. HCM',
    territory: 'Địa bàn Miền Nam (TP. HCM, Bình Dương, Đồng Nai...)',
    status: 'active' as UserStatus,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  });

  // Lock & Unlock Modal state (SCRUM-207)
  const [lockingUser, setLockingUser] = useState<User | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [lockHandoverTo, setLockHandoverTo] = useState('');
  const [isSubmittingLock, setIsSubmittingLock] = useState(false);
  const [unlockingUser, setUnlockingUser] = useState<User | null>(null);

  const loadUsers = async () => {
    const data = await userService.getAll();
    setUsers(data);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // SCRUM-205: Search by name, username/email, phone, department & Filter by Role & Status
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q));
      
      const matchRole =
        roleFilter === 'all' ||
        u.role === roleFilter ||
        (u.roles && u.roles.includes(roleFilter as UserRole));

      const matchStatus =
        statusFilter === 'all' ||
        u.status === statusFilter;

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      department: 'Phòng Kinh Doanh',
      role: 'SalesStaff',
      roles: ['SalesStaff'],
      warehouse: 'Kho Tổng TP. HCM',
      territory: 'Địa bàn Miền Nam (TP. HCM, Bình Dương, Đồng Nai...)',
      status: 'active',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    const assignedRoles = u.roles && u.roles.length > 0 ? u.roles : [u.role];
    setFormData({
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      department: u.department || '',
      role: u.role,
      roles: assignedRoles,
      warehouse: u.warehouse || 'Kho Tổng TP. HCM',
      territory: u.territory || 'Địa bàn Miền Nam (TP. HCM, Bình Dương, Đồng Nai...)',
      status: u.status,
      avatar: u.avatar,
    });
    setIsModalOpen(true);
  };

  const handleRoleToggle = (targetRole: UserRole) => {
    // SCRUM-206: Prevent self-revocation of Admin role
    if (editingUser && currentUser && currentUser.id === editingUser.id && targetRole === 'Admin') {
      showToast('Không thể tự thu hồi vai trò Quản trị viên (Admin) của chính mình!', 'warning', 'Bảo vệ quyền truy cập');
      return;
    }

    let updatedRoles: UserRole[];
    if (formData.roles.includes(targetRole)) {
      if (formData.roles.length === 1) {
        showToast('Tài khoản phải có ít nhất một vai trò.', 'warning');
        return;
      }
      updatedRoles = formData.roles.filter((r) => r !== targetRole);
    } else {
      updatedRoles = [...formData.roles, targetRole];
    }

    const primaryRole = updatedRoles[0] || 'SalesStaff';

    setFormData({
      ...formData,
      roles: updatedRoles,
      role: primaryRole,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      showToast('Vui lòng nhập họ tên và email tài khoản', 'warning');
      return;
    }

    // SCRUM-206: Warehouse role must be bound to at least one warehouse
    const hasWarehouseRole = formData.roles.some((r) =>
      ['WarehouseManager', 'WarehouseStaff', 'Manager', 'Staff'].includes(r)
    );
    if (hasWarehouseRole && !formData.warehouse) {
      showToast('Người dùng thuộc vai trò kho phải gắn với ít nhất một kho cụ thể.', 'warning', 'Ràng buộc kho');
      return;
    }

    // SCRUM-206: Sales role must be bound to a territory
    const hasSalesRole = formData.roles.some((r) =>
      ['SalesManager', 'SalesStaff'].includes(r)
    );
    if (hasSalesRole && !formData.territory) {
      showToast('Người dùng thuộc vai trò kinh doanh phải gắn với ít nhất một địa bàn cụ thể.', 'warning', 'Ràng buộc địa bàn');
      return;
    }

    // Ràng buộc số điện thoại 10 số di động bắt đầu bằng 0
    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        showToast(`Số điện thoại phải gồm đúng 10 chữ số (hiện có ${cleanPhone.length}/10 số).`, 'warning', 'Ràng buộc số điện thoại');
        return;
      }
      if (!cleanPhone.startsWith('0')) {
        showToast('Số điện thoại phải bắt đầu bằng chữ số 0.', 'warning', 'Ràng buộc số điện thoại');
        return;
      }
    }

    try {
      if (editingUser) {
        await userService.update(editingUser.id, {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          department: formData.department,
          role: formData.role,
          roles: formData.roles,
          warehouse: formData.warehouse,
          territory: formData.territory,
          status: formData.status,
        });
        showToast('Cập nhật tài khoản người dùng thành công!', 'success');
      } else {
        // SCRUM-205: Create user, send activation email with temp password
        const tempPassword = `Pass@${Math.floor(100000 + Math.random() * 900000)}`;
        await userService.create({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          department: formData.department,
          role: formData.role,
          roles: formData.roles,
          warehouse: formData.warehouse,
          territory: formData.territory,
          status: formData.status,
          avatar: formData.avatar,
          password: tempPassword,
          assignedDealersCount: hasSalesRole ? 3 : 0,
          assignedDealers: hasSalesRole ? ['Đại lý Tân Phú', 'Đại lý Bình Thạnh', 'Đại lý Thủ Đức'] : [],
        });
        showToast(
          `Đã tạo tài khoản thành công! Email kích hoạt kèm mật khẩu tạm (${tempPassword}) đã được gửi tới ${formData.email}`,
          'success',
          'Kích hoạt tài khoản'
        );
      }
      setIsModalOpen(false);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Có lỗi xảy ra khi lưu tài khoản', 'error');
    }
  };

  // SCRUM-207: Account locking logic
  const handleOpenLock = (u: User) => {
    setLockingUser(u);
    setLockReason('');
    // Select first available replacement staff for handover
    const candidate = users.find((item) => item.id !== u.id && item.status === 'active');
    setLockHandoverTo(candidate ? candidate.name : '');
  };

  const handleConfirmLock = async () => {
    if (!lockingUser) return;
    if (!lockReason.trim()) {
      showToast('Bắt buộc phải ghi rõ lý do khóa tài khoản!', 'warning', 'Lý do khóa');
      return;
    }

    if (lockingUser.assignedDealersCount && lockingUser.assignedDealersCount > 0 && !lockHandoverTo.trim()) {
      showToast('Bắt buộc chọn nhân sự tiếp quản bàn giao đại lý trước khi khóa!', 'warning', 'Bàn giao đại lý');
      return;
    }

    setIsSubmittingLock(true);
    try {
      await userService.lockAccount(lockingUser.id, lockReason, lockHandoverTo);
      showToast(
        `Đã khóa tài khoản của ${lockingUser.name}. Mọi phiên làm việc đang mở đã bị thu hồi ngay lập tức.`,
        'info',
        'Khóa tài khoản thành công'
      );
      setLockingUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi khóa tài khoản', 'error');
    } finally {
      setIsSubmittingLock(false);
    }
  };

  const handleConfirmUnlock = async () => {
    if (!unlockingUser) return;
    try {
      await userService.unlockAccount(unlockingUser.id);
      showToast(`Đã mở khóa tài khoản cho ${unlockingUser.name}. Nhân viên có thể đăng nhập lại.`, 'success');
      setUnlockingUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi mở khóa', 'error');
    }
  };

  const handleResetPassword = (u: User) => {
    showToast(`Đã gửi mật khẩu mới tạm thời (Abc@123456) tới email ${u.email}`, 'success', 'Đặt lại mật khẩu');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await userService.delete(deleteId);
      showToast('Đã xóa người dùng khỏi hệ thống', 'success');
      setDeleteId(null);
      loadUsers();
    } catch {
      showToast('Lỗi khi xóa người dùng', 'error');
    }
  };

  const activeCandidates = useMemo(() => {
    return users.filter((u) => lockingUser && u.id !== lockingUser.id && u.status === 'active');
  }, [users, lockingUser]);

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Nhân Viên',
      sortable: true,
      className: 'min-w-[220px]',
      render: (u) => (
        <div className="flex items-center gap-3">
          <img
            src={u.avatar}
            alt={u.name}
            className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-indigo-500/20"
          />
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>{u.name}</span>
              {currentUser?.id === u.id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                  (Tôi)
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400">{u.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Vai Trò (Roles)',
      sortable: true,
      className: 'min-w-[180px]',
      render: (u) => {
        const displayRoles = u.roles && u.roles.length > 0 ? u.roles : [u.role];
        const roleConfig: Record<string, { label: string; variant: 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'danger' }> = {
          Admin: { label: 'Admin', variant: 'primary' },
          SalesManager: { label: 'QL Kinh Doanh', variant: 'warning' },
          SalesStaff: { label: 'Kinh Doanh', variant: 'info' },
          WarehouseManager: { label: 'QL Kho', variant: 'warning' },
          WarehouseStaff: { label: 'Thủ Kho', variant: 'neutral' },
          Accountant: { label: 'Kế Toán', variant: 'success' },
          Director: { label: 'Ban Giám Đốc', variant: 'danger' },
          Manager: { label: 'Manager', variant: 'info' },
          Staff: { label: 'Staff', variant: 'neutral' },
          User: { label: 'User', variant: 'success' },
        };
        return (
          <div className="flex flex-wrap gap-1">
            {displayRoles.map((r) => (
              <Badge key={r} variant={roleConfig[r]?.variant || 'neutral'} size="sm">
                {roleConfig[r]?.label || r}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'warehouse',
      header: 'Kho / Địa Bàn Phụ Trách',
      sortable: true,
      render: (u) => (
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <WarehouseIcon className="w-3.5 h-3.5 text-slate-400" />
            <span>{u.warehouse || 'Toàn hệ thống'}</span>
          </div>
          {u.territory && (
            <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
              {u.territory}
            </div>
          )}
          {u.assignedDealersCount ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium block">
              Phụ trách {u.assignedDealersCount} đại lý
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Số Điện Thoại',
      render: (u) => <span className="text-xs text-slate-500 font-mono">{u.phone || '-'}</span>,
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (u) => (
        <div className="space-y-1">
          <Badge
            variant={u.status === 'active' ? 'success' : u.status === 'locked' ? 'danger' : 'neutral'}
            size="sm"
            dot
          >
            {u.status === 'active' ? 'Hoạt động' : u.status === 'locked' ? 'Đã khóa' : 'Nghỉ phép'}
          </Badge>
          {u.status === 'locked' && u.lockReason && (
            <p className="text-[10px] text-rose-500 font-medium line-clamp-1" title={u.lockReason}>
              Lý do: {u.lockReason}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right min-w-[130px]',
      render: (u) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => handleResetPassword(u)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Gửi lại mật khẩu tạm"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          {/* Lock / Unlock button (SCRUM-207) */}
          {u.status === 'locked' ? (
            <button
              onClick={() => setUnlockingUser(u)}
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
              title="Mở khóa tài khoản"
            >
              <Unlock className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => handleOpenLock(u)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Khóa tài khoản và thu hồi phiên"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => handleOpenEdit(u)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Chỉnh sửa quyền & kho"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteId(u.id)}
            disabled={currentUser?.id === u.id}
            className={`p-1.5 rounded-lg transition-colors ${
              currentUser?.id === u.id
                ? 'opacity-30 cursor-not-allowed text-slate-300'
                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
            title={currentUser?.id === u.id ? 'Không thể xóa tài khoản của chính mình' : 'Xóa tài khoản'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Người Dùng & Phân Quyền Hệ Thống"
      subtitle={`Quản lý ${users.length} tài khoản nhân sự và phân bổ quyền thao tác nghiệp vụ`}
      actions={
        <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Thêm người dùng mới
        </Button>
      }
    >
      {/* SCRUM-205: defaultPageSize is 20 rows */}
      <DataTable
        data={filteredUsers}
        columns={columns}
        keyExtractor={(u) => u.id}
        defaultPageSize={20}
        filterComponent={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên, email, SĐT, phòng ban..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Filter by Role */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả vai trò</option>
                <option value="Admin">Admin (Quản trị)</option>
                <option value="SalesManager">QL Kinh Doanh</option>
                <option value="SalesStaff">Kinh Doanh / Bán Hàng</option>
                <option value="WarehouseManager">QL Kho Vận</option>
                <option value="WarehouseStaff">Thủ Kho</option>
                <option value="Accountant">Kế Toán</option>
                <option value="Director">Ban Giám Đốc</option>
              </select>

              {/* Filter by Status (SCRUM-205) */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Đã bị khóa</option>
                <option value="inactive">Tạm ngưng</option>
              </select>
            </div>
          </div>
        }
      />

      {/* Add / Edit Modal with multi-role and warehouse binding (SCRUM-206) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Chỉnh Sửa Quyền: ${editingUser.name}` : 'Tạo Tài Khoản Người Dùng Mới'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Họ và tên *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email đăng nhập *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@khovanpro.vn"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>Số điện thoại</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {formData.phone ? `${formData.phone.length}/10 số` : '10 số'}
                </span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setFormData({ ...formData, phone: digits });
                }}
                placeholder="Nhập 10 chữ số (ví dụ: 0901234567)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phòng ban
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="Vận hành, Kế toán, POS..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Ảnh đại diện: Trạng thái chờ */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Ảnh đại diện nhân sự
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Hệ thống tự động dùng ảnh mặc định (Tính năng tải ảnh đang chờ cập nhật)
                </span>
              </div>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
              Trạng thái chờ
            </span>
          </div>

          {/* SCRUM-206: Multi-role Assignment */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Gán vai trò hệ thống (Có thể chọn nhiều vai trò) *
              </label>
              <span className="text-[11px] text-slate-400">Tối thiểu 1 vai trò</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {AVAILABLE_ROLES.map(({ role, label, desc }) => {
                const isChecked = formData.roles.includes(role);
                const isSelfAdmin =
                  editingUser &&
                  currentUser &&
                  currentUser.id === editingUser.id &&
                  role === 'Admin';

                return (
                  <label
                    key={role}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isChecked
                        ? 'border-indigo-500/60 bg-indigo-50/50 dark:bg-indigo-950/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    } ${isSelfAdmin ? 'opacity-85' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isSelfAdmin}
                      onChange={() => handleRoleToggle(role)}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>{label}</span>
                        {isSelfAdmin && (
                          <span className="text-[10px] text-amber-600 font-semibold">(Không thể tự gỡ)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* SCRUM-206: Warehouse Binding (Required for Warehouse roles) */}
          {formData.roles.some((r) => ['WarehouseManager', 'WarehouseStaff', 'Manager', 'Staff'].includes(r)) && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40">
              <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-200 mb-1.5 flex items-center gap-1.5">
                <WarehouseIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Gán kho hoạt động (Bắt buộc với vai trò Quản lý kho / Thủ kho) *</span>
              </label>
              <select
                value={formData.warehouse}
                onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Vui lòng chọn kho cụ thể --</option>
                {WAREHOUSE_OPTIONS.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1">
                Nhân viên kho chỉ được thao tác xuất/nhập tại kho được phân công.
              </p>
            </div>
          )}

          {/* SCRUM-206: Territory Binding (Required for Sales roles) */}
          {formData.roles.some((r) => ['SalesManager', 'SalesStaff'].includes(r)) && (
            <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
              <label className="block text-xs font-bold text-amber-900 dark:text-amber-200 mb-1.5 flex items-center gap-1.5">
                <span>Gán địa bàn hoạt động (Bắt buộc với vai trò Quản lý / Nhân viên kinh doanh) *</span>
              </label>
              <select
                value={formData.territory}
                onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                required
              >
                <option value="">-- Vui lòng chọn địa bàn phụ trách --</option>
                {TERRITORY_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                Nhân viên kinh doanh chỉ phụ trách chăm sóc các đại lý thuộc địa bàn này.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Trạng thái hoạt động
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Tạm ngưng</option>
              <option value="locked">Bị khóa tài khoản</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản & Gửi email kích hoạt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SCRUM-207: Lock Account Modal with Mandatory Reason & Dealer Handover Warning */}
      <Modal
        isOpen={!!lockingUser}
        onClose={() => setLockingUser(null)}
        title="Khóa Tài Khoản & Thu Hồi Phiên"
        maxWidth="md"
      >
        {lockingUser && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <img
                src={lockingUser.avatar}
                alt={lockingUser.name}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-rose-500/20"
              />
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100">{lockingUser.name}</h4>
                <p className="text-xs text-slate-500">{lockingUser.email} • {lockingUser.department || 'Văn phòng'}</p>
                <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                  Khóa sẽ chặn ngay quyền tạo đơn và thu hồi toàn bộ phiên đăng nhập đang mở.
                </div>
              </div>
            </div>

            {/* Handover Warning if dealers assigned */}
            {lockingUser.assignedDealersCount && lockingUser.assignedDealersCount > 0 ? (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs sm:text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>CẢNH BÁO BÀN GIAO ĐẠI LÝ PHỤ TRÁCH</span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  Nhân viên này hiện đang phụ trách <strong>{lockingUser.assignedDealersCount} đại lý/khách hàng</strong>. Bạn bắt buộc phải chỉ định nhân viên tiếp quản bàn giao để không làm gián đoạn việc cung ứng hàng hóa!
                </p>

                {/* Specific assigned dealers list */}
                {lockingUser.assignedDealers && lockingUser.assignedDealers.length > 0 && (
                  <div className="p-2.5 bg-amber-100/70 dark:bg-amber-900/40 rounded-xl space-y-1">
                    <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block">
                      Danh sách các đại lý cần bàn giao ngay:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {lockingUser.assignedDealers.map((d) => (
                        <span key={d} className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 text-[11px] rounded-lg font-medium">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                    Chỉ định nhân sự tiếp quản bàn giao *
                  </label>
                  <select
                    value={lockHandoverTo}
                    onChange={(e) => setLockHandoverTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                    required
                  >
                    <option value="">-- Chọn nhân viên tiếp quản --</option>
                    {activeCandidates.map((cand) => (
                      <option key={cand.id} value={cand.name}>
                        {cand.name} ({cand.department || 'Nhân viên'} - {cand.warehouse || 'Kho'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {/* Mandatory Lock Reason */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Lý do khóa tài khoản (Bắt buộc) *
              </label>
              <textarea
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Ví dụ: Nhân viên nghỉ việc, chuyển công tác, vi phạm quy chế bán hàng..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
              <span className="text-[11px] text-slate-400">
                Lý do này sẽ được lưu vào nhật ký an ninh và hiển thị cho ban quản trị.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" onClick={() => setLockingUser(null)} disabled={isSubmittingLock}>
                Hủy bỏ
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmLock}
                isLoading={isSubmittingLock}
                leftIcon={<Lock className="w-4 h-4" />}
              >
                Xác nhận khóa & Thu hồi phiên
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Unlock Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!unlockingUser}
        onClose={() => setUnlockingUser(null)}
        onConfirm={handleConfirmUnlock}
        title="Mở Khóa Tài Khoản"
        message={`Bạn có chắc chắn muốn mở khóa tài khoản cho ${unlockingUser?.name}? Nhân sự sẽ được khôi phục quyền đăng nhập và tạo đơn theo quyền hạn phân bổ.`}
        confirmText="Mở khóa tài khoản"
        variant="primary"
      />

      {/* Delete User Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xác nhận xóa tài khoản người dùng"
        message="Hành động này sẽ thu hồi quyền truy cập của nhân viên này vĩnh viễn khỏi hệ thống."
        confirmText="Xóa tài khoản"
        variant="danger"
      />
    </PageContainer>
  );
};
