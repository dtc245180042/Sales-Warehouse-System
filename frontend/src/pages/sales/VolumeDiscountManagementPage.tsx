import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit,
  Power,
  Calendar,
  Tag,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatDate } from '../../utils/formatters';
import {
  VolumeDiscountPolicy,
  VolumeDiscountPolicyCreate,
  VolumeDiscountTierPayload,
  volumeDiscountService,
} from '../../services/volumeDiscountService';

export const VolumeDiscountManagementPage: React.FC = () => {
  const { role } = useAuth();
  const { showToast } = useToast();

  const isSalesManagerOrAdmin = role === 'Admin' || role === 'SalesManager' || role === 'Director';

  const [policies, setPolicies] = useState<VolumeDiscountPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<VolumeDiscountPolicy | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [appliedScope, setAppliedScope] = useState<'ALL_PRODUCTS' | 'CATEGORY' | 'PRODUCT'>('ALL_PRODUCTS');
  const [customerGroup, setCustomerGroup] = useState('ALL');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [tiers, setTiers] = useState<VolumeDiscountTierPayload[]>([
    { min_quantity: 1, max_quantity: 4, discount_type: 'PERCENT', discount_value: 0 },
    { min_quantity: 5, max_quantity: 9, discount_type: 'PERCENT', discount_value: 3 },
    { min_quantity: 10, max_quantity: null, discount_type: 'PERCENT', discount_value: 5 },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const data = await volumeDiscountService.getAll();
      setPolicies(data);
    } catch (err: any) {
      showToast(err.message || 'Không thể tải danh sách chính sách chiết khấu', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      const q = search.toLowerCase().trim();
      const matchSearch = !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
      const matchScope = scopeFilter === 'ALL' || p.applied_scope === scopeFilter;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && p.is_active) ||
        (statusFilter === 'INACTIVE' && !p.is_active);
      return matchSearch && matchScope && matchStatus;
    });
  }, [policies, search, scopeFilter, statusFilter]);

  const handleOpenCreate = () => {
    if (!isSalesManagerOrAdmin) {
      showToast('Chỉ Quản lý kinh doanh mới có quyền khai báo chính sách.', 'error');
      return;
    }
    setEditingPolicy(null);
    setCode(`CKSL-${Date.now().toString().slice(-6)}`);
    setName('');
    setDescription('');
    setAppliedScope('ALL_PRODUCTS');
    setCustomerGroup('ALL');
    setValidFrom(new Date().toISOString().split('T')[0]);
    setValidTo('');
    setIsActive(true);
    setTiers([
      { min_quantity: 1, max_quantity: 4, discount_type: 'PERCENT', discount_value: 0 },
      { min_quantity: 5, max_quantity: 9, discount_type: 'PERCENT', discount_value: 3 },
      { min_quantity: 10, max_quantity: null, discount_type: 'PERCENT', discount_value: 5 },
    ]);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (p: VolumeDiscountPolicy) => {
    if (!isSalesManagerOrAdmin) {
      showToast('Chỉ Quản lý kinh doanh mới có quyền sửa chính sách.', 'error');
      return;
    }
    setEditingPolicy(p);
    setCode(p.code);
    setName(p.name);
    setDescription(p.description || '');
    setAppliedScope(p.applied_scope);
    setCustomerGroup(p.customer_group || 'ALL');
    setValidFrom(p.valid_from ? p.valid_from.split('T')[0] : '');
    setValidTo(p.valid_to ? p.valid_to.split('T')[0] : '');
    setIsActive(p.is_active);
    setTiers(
      p.tiers && p.tiers.length > 0
        ? p.tiers.map((t) => ({
            min_quantity: t.min_quantity,
            max_quantity: t.max_quantity,
            discount_type: t.discount_type || 'PERCENT',
            discount_value: Number(t.discount_value),
          }))
        : [{ min_quantity: 1, max_quantity: null, discount_type: 'PERCENT', discount_value: 0 }]
    );
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleToggleStatus = async (p: VolumeDiscountPolicy) => {
    if (!isSalesManagerOrAdmin) {
      showToast('Bạn không có quyền thay đổi trạng thái chính sách.', 'error');
      return;
    }
    try {
      await volumeDiscountService.update(p.id, { is_active: !p.is_active });
      showToast(`Đã ${!p.is_active ? 'kích hoạt' : 'ngừng áp dụng'} chính sách ${p.code}`, 'success');
      fetchPolicies();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi cập nhật trạng thái', 'error');
    }
  };

  const handleDeletePolicy = async (p: VolumeDiscountPolicy) => {
    if (!isSalesManagerOrAdmin) {
      showToast('Bạn không có quyền xóa chính sách.', 'error');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa chính sách "${p.name}" (${p.code})?`)) {
      return;
    }
    try {
      await volumeDiscountService.delete(p.id);
      showToast('Đã xóa chính sách chiết khấu thành công!', 'success');
      fetchPolicies();
    } catch (err: any) {
      showToast(err.message || 'Không thể xóa chính sách (có thể đã phát sinh đơn hàng)', 'error');
    }
  };

  const handleAddTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newMin = lastTier ? (lastTier.max_quantity ? lastTier.max_quantity + 1 : lastTier.min_quantity + 10) : 1;
    const newDiscount = lastTier ? Math.min(100, Number(lastTier.discount_value) + 2) : 5;

    // Cập nhật max_quantity của tier liền trước nếu đang là null
    const updated = [...tiers];
    if (lastTier && lastTier.max_quantity === null) {
      updated[updated.length - 1] = {
        ...lastTier,
        max_quantity: newMin - 1,
      };
    }

    updated.push({
      min_quantity: newMin,
      max_quantity: null,
      discount_type: 'PERCENT',
      discount_value: newDiscount,
    });
    setTiers(updated);
  };

  const handleRemoveTier = (idx: number) => {
    if (tiers.length <= 1) {
      showToast('Chính sách phải có ít nhất một mốc chiết khấu', 'warning');
      return;
    }
    setTiers(tiers.filter((_, i) => i !== idx));
  };

  const handleTierChange = (index: number, field: keyof VolumeDiscountTierPayload, val: any) => {
    const updated = [...tiers];
    updated[index] = {
      ...updated[index],
      [field]: val === '' ? null : Number(val),
    };
    setTiers(updated);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Vui lòng nhập tên chính sách.');
      return;
    }
    if (!validFrom) {
      setFormError('Vui lòng chọn ngày bắt đầu hiệu lực.');
      return;
    }

    // Validation các bậc sản lượng
    const sortedTiers = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
    for (let i = 0; i < sortedTiers.length; i++) {
      const t = sortedTiers[i];
      if (t.min_quantity <= 0) {
        setFormError(`Bậc ${i + 1}: Số lượng tối thiểu phải > 0.`);
        return;
      }
      if (t.max_quantity !== null && t.max_quantity < t.min_quantity) {
        setFormError(`Bậc ${i + 1}: Số lượng tối đa (${t.max_quantity}) nhỏ hơn số lượng tối thiểu (${t.min_quantity}).`);
        return;
      }
      if (t.discount_value < 0 || t.discount_value > 100) {
        setFormError(`Bậc ${i + 1}: Chiết khấu (%) phải trong khoảng từ 0 đến 100.`);
        return;
      }
      if (i < sortedTiers.length - 1) {
        const next = sortedTiers[i + 1];
        if (t.max_quantity === null) {
          setFormError(`Bậc ${i + 1} không giới hạn số lượng trên, không thể có thêm bậc kế tiếp.`);
          return;
        }
        if (t.max_quantity >= next.min_quantity) {
          setFormError(`Bậc [${t.min_quantity}-${t.max_quantity}] chồng lấn với bậc kế tiếp từ ${next.min_quantity}.`);
          return;
        }
      }
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload: VolumeDiscountPolicyCreate = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        applied_scope: appliedScope,
        target_id: null,
        customer_group: customerGroup,
        valid_from: new Date(validFrom).toISOString(),
        valid_to: validTo ? new Date(validTo).toISOString() : null,
        is_active: isActive,
        tiers: sortedTiers,
      };

      if (editingPolicy) {
        await volumeDiscountService.update(editingPolicy.id, payload);
        showToast('Cập nhật chính sách chiết khấu thành công!', 'success');
      } else {
        await volumeDiscountService.create(payload);
        showToast('Khai báo chính sách chiết khấu mới thành công!', 'success');
      }
      setIsFormOpen(false);
      fetchPolicies();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi lưu chính sách lên máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Quản Lý Chính Sách Chiết Khấu Sản Lượng"
      subtitle="Khai báo các ngưỡng sản lượng bậc thang để tự động chiết khấu giá bán cho đại lý (SCRUM-347)"
      breadcrumbs={[
        { label: 'Bán hàng', path: '/orders' },
        { label: 'Bảng giá & Chiết khấu', path: '/price-lists' },
        { label: 'Chiết khấu sản lượng' },
      ]}
      actions={
        isSalesManagerOrAdmin ? (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleOpenCreate}
            className="shadow-sm"
          >
            Khai Báo Chính Sách Mới
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Banner kiểm tra quyền hạn */}
        {!isSalesManagerOrAdmin && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <h4 className="font-bold text-amber-900 dark:text-amber-100">Chế độ xem chỉ đọc</h4>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                Bạn đang đăng nhập với vai trò không phải Quản lý kinh doanh. Bạn chỉ có thể tra cứu thông tin chính sách, không thể thêm hoặc sửa đổi (Mã lỗi RBAC HTTP 403).
              </p>
            </div>
          </div>
        )}

        {/* Thống kê nhanh */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Tổng số chính sách</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{policies.length}</h3>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Đang áp dụng</p>
              <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {policies.filter((p) => p.is_active).length}
              </h3>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Ngừng áp dụng</p>
              <h3 className="text-lg font-bold text-slate-600 dark:text-slate-400">
                {policies.filter((p) => !p.is_active).length}
              </h3>
            </div>
          </div>
        </div>

        {/* Thanh tìm kiếm & bộ lọc */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center gap-3 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo mã hoặc tên chính sách chiết khấu..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">Tất cả phạm vi</option>
              <option value="ALL_PRODUCTS">Toàn bộ danh mục</option>
              <option value="CATEGORY">Theo nhóm hàng</option>
              <option value="PRODUCT">Sản phẩm chỉ định</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang áp dụng</option>
              <option value="INACTIVE">Ngừng áp dụng</option>
            </select>

            <Button variant="secondary" onClick={fetchPolicies} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
              Tải lại
            </Button>
          </div>
        </div>

        {/* Bảng danh sách chính sách */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">Mã & Tên chính sách</th>
                  <th className="p-3.5">Phạm vi</th>
                  <th className="p-3.5">Hiệu lực</th>
                  <th className="p-3.5">Các mốc bậc chiết khấu</th>
                  <th className="p-3.5 text-center">Trạng thái</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Đang tải danh sách chính sách chiết khấu...
                    </td>
                  </tr>
                ) : filteredPolicies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Không tìm thấy chính sách chiết khấu sản lượng nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredPolicies.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded text-[11px]">
                          {p.code}
                        </span>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 mt-1">{p.name}</h4>
                        {p.description && <p className="text-[11px] text-slate-400 truncate max-w-xs">{p.description}</p>}
                      </td>

                      <td className="p-3.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {p.applied_scope === 'ALL_PRODUCTS'
                            ? 'Toàn bộ danh mục'
                            : p.applied_scope === 'CATEGORY'
                            ? 'Theo nhóm hàng'
                            : 'Theo sản phẩm'}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">Đại lý: {p.customer_group || 'Tất cả'}</p>
                      </td>

                      <td className="p-3.5 font-mono text-[11px]">
                        <div>Từ: {formatDate(p.valid_from)}</div>
                        <div className="text-slate-400">Đến: {p.valid_to ? formatDate(p.valid_to) : 'Vô thời hạn'}</div>
                      </td>

                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {p.tiers && p.tiers.length > 0 ? (
                            p.tiers.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded-md bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold border border-indigo-100 dark:border-indigo-900"
                              >
                                ≥{t.min_quantity} sp: <strong>{t.discount_value}%</strong>
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">Chưa cấu hình</span>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            p.is_active
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {p.is_active ? 'Đang áp dụng' : 'Ngừng áp dụng'}
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isSalesManagerOrAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(p)}
                                title={p.is_active ? 'Ngừng áp dụng' : 'Kích hoạt lại'}
                                className={`p-1.5 rounded-lg border transition ${
                                  p.is_active
                                    ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEdit(p)}
                                title="Sửa chính sách"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeletePolicy(p)}
                                title="Xóa chính sách"
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL THÊM / SỬA CHÍNH SÁCH */}
      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          title={editingPolicy ? `Sửa Chính Sách ${editingPolicy.code}` : 'Khai Báo Chính Sách Chiết Khấu Mới'}
          maxWidth="lg"
        >
          <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã chính sách *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  disabled={!!editingPolicy}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên chính sách *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Chiết khấu sản lượng Q4 - Thiết bị mạng"
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phạm vi áp dụng</label>
                <select
                  value={appliedScope}
                  onChange={(e) => setAppliedScope(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="ALL_PRODUCTS">Toàn bộ danh mục</option>
                  <option value="CATEGORY">Theo nhóm hàng</option>
                  <option value="PRODUCT">Sản phẩm chỉ định</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ngày bắt đầu *</label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ngày kết thúc</label>
                <input
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            {/* BẢNG CÁC BẬC THANG SỐ LƯỢNG */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-2 bg-slate-50/50 dark:bg-slate-850">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Các mốc bậc thang chiết khấu (Số lượng tăng dần, không chồng lấn)
                </span>
                <button
                  type="button"
                  onClick={handleAddTier}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Thêm bậc</span>
                </button>
              </div>

              <div className="space-y-2">
                {tiers.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2"
                  >
                    <span className="font-bold text-slate-400 text-[11px] w-5 text-center">{idx + 1}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Từ:</span>
                        <input
                          type="number"
                          min="1"
                          value={t.min_quantity}
                          onChange={(e) => handleTierChange(idx, 'min_quantity', e.target.value)}
                          className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-center font-bold"
                        />
                        <span className="text-slate-500">sp</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Đến:</span>
                        <input
                          type="number"
                          placeholder="Trở lên"
                          value={t.max_quantity === null || t.max_quantity === undefined ? '' : t.max_quantity}
                          onChange={(e) => handleTierChange(idx, 'max_quantity', e.target.value)}
                          className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-center"
                        />
                        <span className="text-slate-500">sp</span>
                      </div>

                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-slate-500">Chiết khấu:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={t.discount_value}
                          onChange={(e) => handleTierChange(idx, 'discount_value', e.target.value)}
                          className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-center font-extrabold text-emerald-600"
                        />
                        <span className="font-bold">%</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveTier(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
                Hủy
              </Button>
              <Button variant="primary" type="submit" isLoading={isSubmitting}>
                {editingPolicy ? 'Lưu Thay Đổi' : 'Tạo Chính Sách'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </PageContainer>
  );
};

export default VolumeDiscountManagementPage;
