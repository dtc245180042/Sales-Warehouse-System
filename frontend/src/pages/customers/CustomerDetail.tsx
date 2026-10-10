import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Receipt,
  Eye,
  Lock,
  Unlock,
  AlertTriangle,
  History,
  ShieldAlert,
  UserCheck,
  CreditCard,
  Edit3,
  Calendar,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { Modal } from '../../components/common/Modal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { orderService } from '../../services/orderService';
import { customerLockService, CustomerLockStatus, CustomerLockHistoryItem } from '../../services/customerLockService';
import { creditService } from '../../services/creditService';
import { CustomerCreditProfile } from '../../types/CreditProfile';
import { Customer } from '../../types/Customer';
import { Order } from '../../types/Order';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // SC-226 & S4-02: Hồ sơ hạn mức công nợ
  const [creditProfile, setCreditProfile] = useState<CustomerCreditProfile | null>(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState<number>(0);
  const [maxDebtDaysInput, setMaxDebtDaysInput] = useState<number>(30);
  const [creditReasonInput, setCreditReasonInput] = useState<string>('');
  const [submittingCredit, setSubmittingCredit] = useState(false);

  // SC-228 Trạng thái khoá & lịch sử
  const [lockStatus, setLockStatus] = useState<CustomerLockStatus | null>(null);
  const [lockHistory, setLockHistory] = useState<CustomerLockHistoryItem[]>([]);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [submittingLock, setSubmittingLock] = useState(false);

  // Quyền: Kế toán công nợ và Admin
  const canManageLock =
    user?.role === 'Accountant' ||
    user?.role === 'Admin' ||
    user?.role?.includes('Accountant') ||
    user?.role?.includes('Admin');

  const fetchLockData = async (customerId: string) => {
    try {
      const [statusData, historyData] = await Promise.all([
        customerLockService.getStatus(customerId),
        customerLockService.getHistory(customerId),
      ]);
      setLockStatus(statusData);
      setLockHistory(historyData);
    } catch (err) {
      console.warn('[CustomerDetail] Error fetching lock status:', err);
    }
  };

  const fetchCreditData = async (customerId: string, fallbackCustomer?: Customer) => {
    try {
      const cp = await creditService.getProfile(customerId);
      setCreditProfile(cp);
      setCreditLimitInput(cp.creditLimit);
      setMaxDebtDaysInput(cp.maxDebtDays);
    } catch (err) {
      console.warn('[CustomerDetail] Error fetching credit profile, using customer defaults:', err);
      const defaultLimit = fallbackCustomer?.creditLimit || 50000000;
      const defaultDebt = fallbackCustomer?.currentDebt || 0;
      const defaultDays = fallbackCustomer?.maxDebtDays || 30;
      const fallbackProfile: CustomerCreditProfile = {
        id: 0,
        customerId: customerId,
        creditLimit: defaultLimit,
        maxDebtDays: defaultDays,
        currentDebt: defaultDebt,
        availableCredit: Math.max(0, defaultLimit - defaultDebt),
        hasOverdue: false,
        overdueDays: 0,
        isBlocked: false,
      };
      setCreditProfile(fallbackProfile);
      setCreditLimitInput(defaultLimit);
      setMaxDebtDaysInput(defaultDays);
    }
  };

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const found = await customerService.getById(id);
        if (found) {
          setCustomer(found);
          const allOrders = await orderService.getAll();
          const matchOrders = allOrders.filter(
            (o) => o.customerId === found.id || o.customerName === found.name
          );
          setCustomerOrders(matchOrders);
          await Promise.all([fetchLockData(found.id), fetchCreditData(found.id, found)]);
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const handleCreditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    const cleanReason = creditReasonInput.trim();
    if (!cleanReason || cleanReason.length < 3) {
      showToast('Bắt buộc nhập lý do điều chỉnh hạn mức (tối thiểu 3 ký tự)', 'warning');
      return;
    }

    try {
      setSubmittingCredit(true);
      const updated = await creditService.updateProfile(customer.id, {
        credit_limit: Number(creditLimitInput),
        max_debt_days: Number(maxDebtDaysInput),
        reason: cleanReason,
      });
      setCreditProfile(updated);
      showToast(`Đã cập nhật hạn mức công nợ cho đại lý '${customer.name}' thành công!`, 'success');
      setIsCreditModalOpen(false);
      setCreditReasonInput('');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi cập nhật hạn mức công nợ', 'error');
    } finally {
      setSubmittingCredit(false);
    }
  };

  const handleLockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    const cleanReason = lockReason.trim();
    if (!cleanReason || cleanReason.length < 3) {
      showToast('Bắt buộc nhập lý do khoá giao dịch (tối thiểu 3 ký tự)', 'warning');
      return;
    }

    try {
      setSubmittingLock(true);
      const res = await customerLockService.lock(customer.id, cleanReason);
      setLockStatus(res);
      setCustomer((prev) => (prev ? { ...prev, status: 'locked' } : null));
      showToast(`Đã khoá giao dịch đại lý '${customer.name}' thành công!`, 'success');
      setIsLockModalOpen(false);
      setLockReason('');
      await fetchLockData(customer.id);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi khoá giao dịch đại lý', 'error');
    } finally {
      setSubmittingLock(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    try {
      setSubmittingLock(true);
      const res = await customerLockService.unlock(customer.id, unlockReason);
      setLockStatus(res);
      setCustomer((prev) => (prev ? { ...prev, status: 'active' } : null));
      showToast(`Đã mở khoá giao dịch cho đại lý '${customer.name}' thành công!`, 'success');
      setIsUnlockModalOpen(false);
      setUnlockReason('');
      await fetchLockData(customer.id);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi mở khoá giao dịch', 'error');
    } finally {
      setSubmittingLock(false);
    }
  };

  if (loading) return <Loading text="Đang tải dữ liệu khách hàng..." />;
  if (!customer) {
    return (
      <EmptyState
        title="Không tìm thấy khách hàng"
        description="Mã khách hàng không tồn tại."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/customers')}
      />
    );
  }

  const isLocked = Boolean(lockStatus?.isLocked || customer.status === 'locked');

  return (
    <PageContainer
      title={customer.name}
      subtitle={`Mã đại lý: ${customer.code} • Nhóm: ${customer.customer_group || customer.customerGroup || 'RETAIL'} • Phụ trách: ${customer.assignedStaffName || customer.assigned_sales_rep || 'Chưa phân công'}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/customers">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách đại lý
            </Button>
          </Link>

          {/* Nút Khoá / Mở khoá giao dịch (SC-228) */}
          {canManageLock && (
            <>
              {isLocked ? (
                <Button
                  id="btn-unlock-customer"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUnlockModalOpen(true)}
                  className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  leftIcon={<Unlock className="w-4 h-4 text-emerald-600" />}
                >
                  Mở khoá giao dịch
                </Button>
              ) : (
                <Button
                  id="btn-lock-customer"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLockModalOpen(true)}
                  className="border-rose-500 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  leftIcon={<Lock className="w-4 h-4 text-rose-600" />}
                >
                  Khoá giao dịch
                </Button>
              )}
            </>
          )}

          {/* Nút Tạo đơn bán hàng - Bị vô hiệu hoá nếu đại lý đang bị khoá */}
          {isLocked ? (
            <div title="Đại lý đang bị khoá giao dịch. Không thể tạo đơn mới.">
              <Button
                variant="primary"
                size="sm"
                disabled
                className="opacity-50 cursor-not-allowed bg-slate-400 dark:bg-slate-700 hover:bg-slate-400"
                leftIcon={<Lock className="w-4 h-4" />}
              >
                Đã khoá tạo đơn
              </Button>
            </div>
          ) : (
            <Link to={`/orders/create?customerId=${customer.id}`}>
              <Button variant="primary" size="sm" leftIcon={<ShoppingBag className="w-4 h-4" />}>
                Tạo đơn hàng
              </Button>
            </Link>
          )}
        </div>
      }
    >
      {/* Banner cảnh báo đại lý bị khoá (SC-228) */}
      {isLocked && (
        <div
          id="locked-warning-banner"
          className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-3.5 shadow-sm"
        >
          <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm">
            <h4 className="font-bold text-rose-900 dark:text-rose-100 flex items-center gap-2">
              ĐẠI LÝ ĐANG BỊ KHOÁ GIAO DỊCH
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900/60 font-semibold text-rose-800 dark:text-rose-200">
                Dừng bán hàng ngay
              </span>
            </h4>
            <p className="mt-1 text-rose-700 dark:text-rose-300">
              <strong className="font-semibold">Lý do khoá:</strong>{' '}
              {lockStatus?.lockReason || 'Chưa cập nhật lý do cụ thể'}
            </p>
            {lockStatus?.lockedAt && (
              <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                Khoá lúc: {lockStatus.lockedAt} {lockStatus.lockedBy ? `bởi ${lockStatus.lockedBy}` : ''}
              </p>
            )}
            <p className="mt-2 text-xs text-rose-600/90 dark:text-rose-400/90 italic">
              * Quy định: Mọi kênh đặt hàng (POS, API, Portal) đều bị chặn tạo đơn mới. Các đơn hàng cũ đang xử lý dở vẫn được phép tiếp tục hoàn tất.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card text-center">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-4 shadow-md text-white ${
                isLocked
                  ? 'bg-gradient-to-tr from-rose-500 to-red-600'
                  : 'bg-gradient-to-tr from-indigo-500 to-violet-600'
              }`}
            >
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{customer.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{customer.code}</p>

            <div className="mt-3 flex justify-center gap-2">
              {isLocked ? (
                <Badge variant="danger" size="sm" dot>
                  Đã khoá giao dịch
                </Badge>
              ) : (
                <Badge variant={customer.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
                  {customer.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}
                </Badge>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-left space-y-3 text-xs">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{customer.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{customer.email || 'Chưa cập nhật'}</span>
              </div>
              <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>{customer.address || 'Chưa có địa chỉ'}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Tổng Đơn</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {customer.totalOrders}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Đã Chi Tiêu</span>
              <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(customer.totalSpent)}
              </p>
            </div>
          </div>

          {/* Hồ Sơ Hạn Mức Tín Dụng & Công Nợ Đại Lý (SC-226 & S4-02) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Hạn Mức Công Nợ & Tín Dụng
                </h4>
              </div>
              {canManageLock && (
                <button
                  type="button"
                  onClick={() => setIsCreditModalOpen(true)}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Thiết lập</span>
                </button>
              )}
            </div>

            {creditProfile ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">Hạn Mức Được Cấp</span>
                  <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(creditProfile.creditLimit)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Dư Nợ Hiện Tại</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(creditProfile.currentDebt)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Khả Dụng Còn Lại</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(creditProfile.availableCredit ?? Math.max(0, creditProfile.creditLimit - creditProfile.currentDebt))}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs px-1 text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Số ngày nợ tối đa:
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {creditProfile.maxDebtDays > 0 ? `${creditProfile.maxDebtDays} ngày` : 'Thanh toán ngay (0 ngày)'}
                  </span>
                </div>

                {/* Progress bar mức sử dụng hạn mức */}
                {creditProfile.creditLimit > 0 && (
                  <div className="pt-1">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Mức sử dụng hạn mức</span>
                      <span className="font-bold">
                        {Math.min(100, Math.round((creditProfile.currentDebt / creditProfile.creditLimit) * 100))}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          creditProfile.currentDebt > creditProfile.creditLimit
                            ? 'bg-rose-500'
                            : (creditProfile.currentDebt / creditProfile.creditLimit) > 0.8
                            ? 'bg-amber-500'
                            : 'bg-indigo-600'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(0, (creditProfile.currentDebt / creditProfile.creditLimit) * 100))}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Đang tải hồ sơ hạn mức...</p>
            )}
          </div>

          {/* Lịch sử khoá / mở giao dịch (SC-228 Subtask 2) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Lịch Sử Khoá / Mở Giao Dịch
              </h4>
            </div>

            {lockHistory.length > 0 ? (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {lockHistory.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                          h.action === 'lock'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {h.action === 'lock' ? 'KHOÁ GIAO DỊCH' : 'MỞ GIAO DỊCH'}
                      </span>
                      <span className="text-[11px] text-slate-400">{h.createdAt}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-medium">{h.reason}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Người thực hiện: <span className="font-semibold text-slate-600 dark:text-slate-300">{h.actorName || h.actorUsername}</span>
                      {h.actorRole ? ` (${h.actorRole})` : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Chưa có lịch sử thay đổi trạng thái giao dịch.</p>
            )}
          </div>
        </div>

        {/* Right Column: Order History of this customer (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lịch Sử Đơn Hàng Của Khách
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Các đơn hàng đã phát sinh tại quầy và online (Đơn dở vẫn xử lý được khi bị khoá)
                </p>
              </div>
              <Receipt className="w-5 h-5 text-indigo-500" />
            </div>

            {customerOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="pb-3">Mã đơn</th>
                      <th className="pb-3">Thời gian</th>
                      <th className="pb-3">Tổng tiền</th>
                      <th className="pb-3">Trạng thái</th>
                      <th className="pb-3 text-right">Xem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 font-semibold text-indigo-600 dark:text-indigo-400">
                          {o.code}
                        </td>
                        <td className="py-3 text-slate-500">{formatDate(o.createdAt)}</td>
                        <td className="py-3 font-bold text-slate-900 dark:text-white">
                          {formatCurrency(o.total)}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              o.status === 'completed'
                                ? 'success'
                                : o.status === 'shipping'
                                ? 'info'
                                : o.status === 'confirmed'
                                ? 'primary'
                                : o.status === 'pending'
                                ? 'warning'
                                : 'danger'
                            }
                            size="sm"
                            dot
                          >
                            {o.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            to={`/orders/${o.id}`}
                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Chưa có đơn hàng nào"
                description="Khách hàng này chưa phát sinh giao dịch trong hệ thống."
              />
            )}
          </div>
        </div>
      </div>

      {/* Modal Khoá giao dịch đại lý (SC-228 Subtask 4) */}
      <Modal
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        title="Khoá Giao Dịch Đại Lý"
        maxWidth="md"
      >
        <form onSubmit={handleLockSubmit} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lưu ý quan trọng:</p>
              <p className="mt-0.5">
                Khi khoá, hệ thống sẽ dừng bán ngay cho đại lý này. Mọi kênh tạo đơn mới (POS, Cổng đại lý, API) đều bị từ chối. Các đơn hàng đang xử lý dở vẫn được phép tiếp tục.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do khoá giao dịch * (Bắt buộc)
            </label>
            <textarea
              id="txt-lock-reason"
              rows={3}
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="Nhập lý do chi tiết (Ví dụ: Đại lý nợ quá hạn 90 ngày, có dấu hiệu mất khả năng thanh toán...)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
              required
            />
            <span className="text-[11px] text-slate-400">Tối thiểu 3 ký tự. Thông tin sẽ được lưu vết kiểm soát.</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsLockModalOpen(false)}
              disabled={submittingLock}
            >
              Hủy bỏ
            </Button>
            <Button
              id="btn-confirm-lock"
              type="submit"
              variant="danger"
              size="sm"
              disabled={submittingLock || lockReason.trim().length < 3}
              leftIcon={<Lock className="w-4 h-4" />}
            >
              {submittingLock ? 'Đang xử lý...' : 'Xác nhận khoá giao dịch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Mở khoá giao dịch đại lý (SC-228 Subtask 4) */}
      <Modal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        title="Mở Khoá Giao Dịch Đại Lý"
        maxWidth="md"
      >
        <form onSubmit={handleUnlockSubmit} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Khôi phục quyền đặt hàng:</p>
              <p className="mt-0.5">
                Sau khi mở khoá, đại lý này sẽ có thể tiếp tục tạo đơn hàng mới trên toàn bộ hệ thống.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do / Ghi chú mở khoá (Tùy chọn)
            </label>
            <textarea
              id="txt-unlock-reason"
              rows={3}
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Ví dụ: Đại lý đã hoàn tất thanh toán số dư nợ quá hạn đợt 1..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsUnlockModalOpen(false)}
              disabled={submittingLock}
            >
              Hủy bỏ
            </Button>
            <Button
              id="btn-confirm-unlock"
              type="submit"
              variant="primary"
              size="sm"
              disabled={submittingLock}
              className="bg-emerald-600 hover:bg-emerald-700"
              leftIcon={<Unlock className="w-4 h-4" />}
            >
              {submittingLock ? 'Đang xử lý...' : 'Xác nhận mở khoá'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Thiết Lập Hạn Mức Công Nợ & Số Ngày Nợ (SC-226 / S4-02) */}
      <Modal
        isOpen={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        title="Thiết Lập Hạn Mức Tín Dụng & Công Nợ"
        maxWidth="md"
      >
        <form onSubmit={handleCreditSubmit} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
            <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Quy chuẩn hạn mức đại lý (SC-226):</p>
              <p className="mt-0.5">
                Thiết lập hạn mức công nợ và số ngày nợ tối đa cho phép. Các thay đổi sẽ được lưu vào lịch sử kiểm toán của hệ thống.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hạn mức công nợ tối đa (VNĐ) *
            </label>
            <input
              type="number"
              min="0"
              step="1000000"
              value={creditLimitInput}
              onChange={(e) => setCreditLimitInput(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Ví dụ: 50000000"
              required
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Hiện tại: {formatCurrency(creditLimitInput)}
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
              Lý do điều chỉnh hạn mức * (Bắt buộc)
            </label>
            <textarea
              rows={2}
              value={creditReasonInput}
              onChange={(e) => setCreditReasonInput(e.target.value)}
              placeholder="Ví dụ: Nâng hạn mức công nợ theo hợp đồng phân phối mới quý 4..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreditModalOpen(false)}
              disabled={submittingCredit}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={submittingCredit || creditReasonInput.trim().length < 3}
              leftIcon={<CreditCard className="w-4 h-4" />}
            >
              {submittingCredit ? 'Đang lưu...' : 'Lưu hạn mức công nợ'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
