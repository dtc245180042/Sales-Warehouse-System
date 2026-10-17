import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  Plus,
  Lock,
  Calendar,
  User,
  MapPin,
  TrendingUp,
  History,
  Edit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Users,
  ShieldAlert,
  ArrowRight,
  X,
  Check,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { salesTargetService } from '../../services/salesTargetService';
import { userService } from '../../services/userService';
import { SalesTarget, TargetScope } from '../../types/SalesTarget';
import { User as UserType } from '../../types/User';
import { LockedTargetEditModal } from '../../components/sales/LockedTargetEditModal';
import { TargetAuditHistory } from '../../components/sales/TargetAuditHistory';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { formatNumber } from '../../utils/formatters';

const TERRITORY_OPTIONS = [
  'Khu vực Hà Nội',
  'Khu vực TP. Hồ Chí Minh',
  'Khu vực Đà Nẵng',
  'Khu vực Cần Thơ & Miền Tây',
  'Khu vực Miền Bắc',
  'Khu vực Miền Nam',
  'Khu vực Miền Trung',
];

export const SalesTargetManagement: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [selectedScope, setSelectedScope] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTargetForEdit, setSelectedTargetForEdit] = useState<SalesTarget | null>(null);
  const [isLockedModalOpen, setIsLockedModalOpen] = useState(false);
  const [isStandardEditModalOpen, setIsStandardEditModalOpen] = useState(false);
  const [selectedTargetForAudit, setSelectedTargetForAudit] = useState<SalesTarget | null>(null);
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [lockingPeriod, setLockingPeriod] = useState(false);

  // Create form state
  const [createScope, setCreateScope] = useState<TargetScope>('individual');
  const [createUserId, setCreateUserId] = useState<string>('');
  const [createUserName, setCreateUserName] = useState<string>('');
  const [createTerritory, setCreateTerritory] = useState<string>(TERRITORY_OPTIONS[0]);
  const [createRevenue, setCreateRevenue] = useState<number>(500000000);
  const [createOrders, setCreateOrders] = useState<number>(100);
  const [creating, setCreating] = useState(false);

  // Standard Edit form state
  const [editRevenue, setEditRevenue] = useState<number>(0);
  const [editOrders, setEditOrders] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);

  // Sales Staff Users for selection
  const [salesUsers, setSalesUsers] = useState<UserType[]>([]);

  const isAdmin = role === 'Admin';
  const canManage = ['Admin', 'SalesManager', 'Director', 'Manager'].includes(role || '');

  const loadTargets = async () => {
    setLoading(true);
    try {
      const data = await salesTargetService.getAll({
        year: selectedYear,
        month: selectedMonth,
      });
      setTargets(data);
    } catch {
      showToast('Không thể tải danh sách chỉ tiêu', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const all = await userService.getAll();
        const salesStaff = all.filter(
          (u) =>
            u.role === 'SalesStaff' ||
            u.role === 'SalesManager' ||
            u.role === 'Staff' ||
            u.department === 'Phòng Kinh Doanh'
        );
        setSalesUsers(salesStaff.length > 0 ? salesStaff : all);
        if (salesStaff.length > 0 && !createUserId) {
          setCreateUserId(String(salesStaff[0].id));
          setCreateUserName(salesStaff[0].name);
        }
      } catch {
        // Fallback
      }
    };
    loadUsers();
  }, []);

  const filteredTargets = useMemo(() => {
    return targets.filter((t) => {
      if (selectedScope !== 'all' && t.scope !== selectedScope) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = t.userName?.toLowerCase().includes(q);
        const matchTerritory = t.territory?.toLowerCase().includes(q);
        if (!matchName && !matchTerritory) return false;
      }
      return true;
    });
  }, [targets, selectedScope, search]);

  const stats = useMemo(() => {
    const totalTargets = targets.length;
    const totalRev = targets.reduce((sum, t) => sum + (t.targetRevenue || 0), 0);
    const activeCount = targets.filter((t) => t.status === 'active').length;
    const lockedCount = targets.filter((t) => t.status === 'locked').length;
    return { totalTargets, totalRev, activeCount, lockedCount };
  }, [targets]);

  const handleOpenEdit = (target: SalesTarget) => {
    setSelectedTargetForEdit(target);
    if (target.status === 'locked') {
      setIsLockedModalOpen(true);
    } else {
      setEditRevenue(target.targetRevenue);
      setEditOrders(target.targetOrders || 0);
      setIsStandardEditModalOpen(true);
    }
  };

  const handleStandardEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetForEdit) return;

    if (editRevenue <= 0) {
      showToast('Chỉ tiêu doanh số phải lớn hơn 0', 'error');
      return;
    }

    setSavingEdit(true);
    try {
      await salesTargetService.update(
        selectedTargetForEdit.id,
        {
          targetRevenue: editRevenue,
          targetOrders: editOrders,
        },
        {
          id: user?.id,
          name: user?.name || user?.username,
          role,
        }
      );
      showToast('Cập nhật chỉ tiêu thành công', 'success');
      setIsStandardEditModalOpen(false);
      loadTargets();
    } catch (err: any) {
      showToast(err?.message || 'Có lỗi khi cập nhật', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createRevenue <= 0) {
      showToast('Chỉ tiêu doanh số phải lớn hơn 0', 'error');
      return;
    }

    setCreating(true);
    try {
      await salesTargetService.create(
        {
          year: selectedYear,
          month: selectedMonth,
          scope: createScope,
          userId: createScope === 'individual' ? createUserId : undefined,
          userName: createScope === 'individual' ? createUserName : undefined,
          territory: createScope === 'individual' ? undefined : createTerritory,
          targetRevenue: createRevenue,
          targetOrders: createOrders,
        },
        {
          id: user?.id,
          name: user?.name || user?.username,
          role,
        }
      );
      showToast('Thiết lập chỉ tiêu doanh số mới thành công!', 'success');
      setIsCreateModalOpen(false);
      loadTargets();
    } catch (err: any) {
      showToast(err?.message || 'Không thể tạo chỉ tiêu', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleLockPeriod = async () => {
    setLockingPeriod(true);
    try {
      const res = await salesTargetService.lockPeriod(selectedYear, selectedMonth, {
        id: user?.id,
        name: user?.name || user?.username,
        role,
      });
      showToast(
        `Đã khoá ${res.count} chỉ tiêu kỳ Tháng ${selectedMonth}/${selectedYear}`,
        'success'
      );
      setIsLockConfirmOpen(false);
      loadTargets();
    } catch {
      showToast('Khóa kỳ thất bại', 'error');
    } finally {
      setLockingPeriod(false);
    }
  };

  return (
    <PageContainer
      title="Quản lý chỉ tiêu doanh số"
      description="Thiết lập, theo dõi và khóa sổ chỉ tiêu doanh số hàng tháng theo nhân viên và khu vực (SCRUM-802)"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/sales/targets/progress')}
            leftIcon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
          >
            Xem tiến độ thực tế
          </Button>

          {isAdmin && stats.activeCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLockConfirmOpen(true)}
              leftIcon={<Lock className="w-4 h-4 text-slate-500" />}
            >
              Khoá kỳ hiện tại
            </Button>
          )}

          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Thêm chỉ tiêu
            </Button>
          )}
        </div>
      }
    >
      {/* 4 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Tổng chỉ tiêu kỳ
            </span>
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {stats.totalTargets}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Tháng {selectedMonth}/{selectedYear}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Tổng doanh số đặt ra
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatNumber(stats.totalRev)} đ
          </div>
          <div className="mt-1 text-xs text-slate-500">Kế hoạch doanh thu</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Đang hiệu lực
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.activeCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Cho phép điều chỉnh bình thường</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Đã khoá sổ
            </span>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              <Lock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">
            {stats.lockedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Cần lý do khi sửa (SCRUM-805)</div>
        </div>
      </div>

      {/* Filter and Period Selection Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Month / Year picker */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Kỳ:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              aria-label="Chọn tháng"
              className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="Chọn năm"
              className="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          {/* Scope filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setSelectedScope('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedScope === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope('individual')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedScope === 'individual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Nhân viên
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope('territory')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedScope === 'territory'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Khu vực
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhân viên, khu vực..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
      </div>

      {/* Targets Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-medium text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3.5 text-center w-12">STT</th>
                <th className="px-4 py-3.5">Phân loại</th>
                <th className="px-4 py-3.5">Đối tượng áp dụng</th>
                <th className="px-4 py-3.5">Kỳ chỉ tiêu</th>
                <th className="px-4 py-3.5 text-right">Chỉ tiêu doanh số</th>
                <th className="px-4 py-3.5 text-center">Chỉ tiêu đơn</th>
                <th className="px-4 py-3.5 text-center">Trạng thái</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-500" />
                    Đang tải danh sách chỉ tiêu...
                  </td>
                </tr>
              ) : filteredTargets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Target className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Không có chỉ tiêu nào trong Tháng {selectedMonth}/{selectedYear}.
                  </td>
                </tr>
              ) : (
                filteredTargets.map((t, idx) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3.5 text-center text-slate-400 text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      {t.scope === 'individual' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                          <User className="w-3 h-3" />
                          Cá nhân
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          <MapPin className="w-3 h-3" />
                          Khu vực
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                      {t.scope === 'individual' ? t.userName : t.territory}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 font-medium">
                      {t.period}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(t.targetRevenue)} đ
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-700 dark:text-slate-300">
                      {t.targetOrders ? `${t.targetOrders} đơn` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {t.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đang hiệu lực
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <Lock className="w-3.5 h-3.5" />
                          Đã khoá sổ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(t)}
                          leftIcon={<Edit className="w-3.5 h-3.5" />}
                        >
                          Sửa
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTargetForAudit(t)}
                          leftIcon={<History className="w-3.5 h-3.5" />}
                        >
                          Audit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Target */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Target className="w-5 h-5 text-primary-500" />
                Thiết lập chỉ tiêu Tháng {selectedMonth}/{selectedYear}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              {/* Scope Radio */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Phạm vi chỉ tiêu <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateScope('individual')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 ${
                      createScope === 'individual'
                        ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-950/40 text-primary-900 dark:text-primary-200 ring-2 ring-primary-500/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span className="font-semibold text-xs">Cá nhân nhân viên</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateScope('territory')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 ${
                      createScope === 'territory'
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    <span className="font-semibold text-xs">Khu vực bán hàng</span>
                  </button>
                </div>
              </div>

              {/* Individual: User Dropdown */}
              {createScope === 'individual' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Chọn nhân viên Sales <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={createUserId}
                    onChange={(e) => {
                      const uid = e.target.value;
                      setCreateUserId(uid);
                      const found = salesUsers.find((u) => String(u.id) === uid);
                      if (found) setCreateUserName(found.name);
                    }}
                    aria-label="Chọn nhân viên Sales"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    {salesUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Territory Dropdown */
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Chọn khu vực <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={createTerritory}
                    onChange={(e) => setCreateTerritory(e.target.value)}
                    aria-label="Chọn khu vực"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    {TERRITORY_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Target Revenue */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Chỉ tiêu doanh số (VND) <span className="text-rose-500">*</span>
                </label>
                <CurrencyInput
                  value={createRevenue}
                  onChange={(val) => setCreateRevenue(val)}
                  suffix="VNĐ"
                  placeholder="VD: 500.000.000"
                  className="w-full px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              {/* Target Orders */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Chỉ tiêu số đơn hàng
                </label>
                <input
                  type="number"
                  min={0}
                  value={createOrders === 0 ? '' : createOrders}
                  placeholder="VD: 100"
                  onChange={(e) => {
                    const val = e.target.value;
                    setCreateOrders(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                  }}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  isLoading={creating}
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  Lưu chỉ tiêu
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Standard Edit for Active Target */}
      {isStandardEditModalOpen && selectedTargetForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Cập nhật chỉ tiêu đang hiệu lực
              </h3>
              <button
                type="button"
                onClick={() => setIsStandardEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStandardEditSubmit} className="mt-4 space-y-4">
              <div className="text-xs text-slate-500">
                Đối tượng:{' '}
                <strong>
                  {selectedTargetForEdit.scope === 'individual'
                    ? selectedTargetForEdit.userName
                    : selectedTargetForEdit.territory}
                </strong>{' '}
                • {selectedTargetForEdit.period}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Chỉ tiêu doanh số mới (VND) <span className="text-rose-500">*</span>
                </label>
                <CurrencyInput
                  value={editRevenue}
                  onChange={(val) => setEditRevenue(val)}
                  suffix="VNĐ"
                  placeholder="VD: 500.000.000"
                  className="w-full px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Chỉ tiêu số đơn hàng
                </label>
                <input
                  type="number"
                  min={0}
                  value={editOrders === 0 ? '' : editOrders}
                  placeholder="VD: 100"
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditOrders(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                  }}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsStandardEditModalOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  isLoading={savingEdit}
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Locked Target Edit (SCRUM-805) */}
      {selectedTargetForEdit && (
        <LockedTargetEditModal
          target={selectedTargetForEdit}
          isOpen={isLockedModalOpen}
          onClose={() => setIsLockedModalOpen(false)}
          onSuccess={loadTargets}
        />
      )}

      {/* Modal: Target Audit History (SCRUM-805) */}
      {selectedTargetForAudit && (
        <TargetAuditHistory
          target={selectedTargetForAudit}
          isOpen={Boolean(selectedTargetForAudit)}
          onClose={() => setSelectedTargetForAudit(null)}
        />
      )}

      {/* Modal: Confirm Lock Period */}
      {isLockConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Khoá kỳ Tháng {selectedMonth}/{selectedYear}?
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sau khi khoá, mọi thao tác chỉnh sửa chỉ tiêu sẽ yêu cầu nhập lý do bắt buộc và ghi nhật ký kiểm toán (SCRUM-805).
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLockConfirmOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={lockingPeriod}
                onClick={handleLockPeriod}
                leftIcon={<Lock className="w-4 h-4" />}
              >
                Xác nhận khoá kỳ
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
