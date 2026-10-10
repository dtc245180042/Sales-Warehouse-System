import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Calendar,
  DollarSign,
  TrendingUp,
  History,
  Lock,
  Edit3,
  CheckCircle,
  AlertTriangle,
  X,
  CreditCard,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Loading } from '../common/Loading';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDate, formatCurrencyInput } from '../../utils/formatters';
import { creditService } from '../../services/creditService';
import {
  CustomerCreditProfile,
  CustomerCreditHistory,
  CreditProfileUpdatePayload,
} from '../../types/CreditProfile';

interface Props {
  customerId: string;
  customerName: string;
}

const ALLOWED_ROLES = ['Admin', 'SalesManager', 'Accountant', 'Director', 'Manager'];

export const CreditLimitManager: React.FC<Props> = ({ customerId, customerName }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CustomerCreditProfile | null>(null);
  const [histories, setHistories] = useState<CustomerCreditHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Form states
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [maxDebtDays, setMaxDebtDays] = useState<number>(0);
  const [limitInput, setLimitInput] = useState<string>('');
  const [daysInput, setDaysInput] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Kiểm tra quyền sửa
  const userRole = user?.role || '';
  const canEdit = ALLOWED_ROLES.some(
    (r) => r.toLowerCase() === userRole.toLowerCase() || (user?.roles || []).some((ur) => ur.toLowerCase() === r.toLowerCase())
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profData, histData] = await Promise.all([
        creditService.getProfile(customerId),
        creditService.getHistory(customerId),
      ]);
      setProfile(profData);
      setHistories(histData);
      if (profData) {
        setCreditLimit(profData.creditLimit || 0);
        setMaxDebtDays(profData.maxDebtDays || 0);
      }
    } catch (err: any) {
      console.error('[CreditLimitManager] Lỗi tải dữ liệu công nợ:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) {
      fetchData();
    }
  }, [customerId]);

  const handleOpenModal = () => {
    if (!profile) return;
    const curLimit = profile.creditLimit || 0;
    const curDays = profile.maxDebtDays || 0;
    setCreditLimit(curLimit);
    setMaxDebtDays(curDays);
    setLimitInput(curLimit > 0 ? formatCurrencyInput(curLimit) : '');
    setDaysInput(curDays > 0 ? String(curDays) : '');
    setReason('');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleQuickAmount = (amount: number) => {
    setCreditLimit(amount);
    setLimitInput(amount > 0 ? formatCurrencyInput(amount) : '0');
  };

  const handleQuickDays = (days: number) => {
    setMaxDebtDays(days);
    setDaysInput(days > 0 ? String(days) : '0');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (creditLimit < 0) {
      setErrorMsg('Hạn mức công nợ không được là số âm.');
      return;
    }
    if (creditLimit > 10_000_000_000) {
      setErrorMsg('Hạn mức công nợ tối đa cho phép là 10.000.000.000 đ (10 tỷ).');
      return;
    }
    if (maxDebtDays < 0 || maxDebtDays > 365) {
      setErrorMsg('Số ngày nợ tối đa phải từ 0 đến 365 ngày.');
      return;
    }
    const cleanReason = reason.trim();
    if (!cleanReason || cleanReason.length < 5) {
      setErrorMsg('Bắt buộc nhập lý do điều chỉnh hạn mức (tối thiểu 5 ký tự).');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreditProfileUpdatePayload = {
        credit_limit: creditLimit,
        max_debt_days: maxDebtDays,
        reason: cleanReason,
      };
      const updated = await creditService.updateProfile(customerId, payload);
      setProfile(updated);
      setSuccessMsg('Điều chỉnh hạn mức công nợ đại lý thành công!');
      setShowModal(false);
      // Tải lại lịch sử
      const histData = await creditService.getHistory(customerId);
      setHistories(histData);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Có lỗi xảy ra khi lưu hạn mức.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Tính tỷ lệ sử dụng hạn mức
  const limit = profile?.creditLimit || 0;
  const debt = profile?.currentDebt || 0;
  const available = profile?.availableCredit ?? Math.max(0, limit - debt);
  const usedPercent = limit > 0 ? Math.min(100, Math.round((debt / limit) * 100)) : debt > 0 ? 100 : 0;

  let progressColor = 'bg-emerald-500';
  if (usedPercent >= 90) progressColor = 'bg-rose-500';
  else if (usedPercent >= 70) progressColor = 'bg-amber-500';

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
        <Loading text="Đang tải dữ liệu hạn mức công nợ..." />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Hạn Mức Công Nợ & Thời Hạn Thanh Toán
            </h3>
            {limit === 0 ? (
              <Badge variant="warning" size="sm">
                Chưa cấp hạn mức nợ (Bắt buộc thanh toán 100%)
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                Đã kích hoạt hạn mức
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quy định số tiền nợ tối đa và số ngày cho phép nợ đối với đại lý này khi xuất kho
          </p>
        </div>

        <div>
          {canEdit ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Edit3 className="w-4 h-4" />}
              onClick={handleOpenModal}
            >
              Điều chỉnh hạn mức
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs">
              <Lock className="w-3.5 h-3.5" />
              <span>Chỉ Kế toán & Quản lý mới có quyền sửa</span>
            </div>
          )}
        </div>
      </div>

      {/* Thông báo thành công */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid 4 Chỉ số KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Hạn mức công nợ */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Hạn Mức Công Nợ
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-white mt-2">
            {formatCurrency(limit)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {limit > 0 ? 'Mức trần được nợ tối đa' : 'Thanh toán 100% trước khi xuất'}
          </span>
        </div>

        {/* 2. Dư nợ đã xuất */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Dư Nợ Đã Xuất
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-2">
            {formatCurrency(debt)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {usedPercent}% hạn mức đã dùng
          </span>
        </div>

        {/* 3. Hạn mức còn lại */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Hạn Mức Còn Lại
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-lg font-black mt-2 ${available > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {formatCurrency(available)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Khả dụng cho các đơn xuất mới
          </span>
        </div>

        {/* 4. Thời hạn nợ tối đa */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Thời Hạn Nợ Tối Đa
            </span>
            <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-black text-slate-900 dark:text-white mt-2">
            {profile?.maxDebtDays ?? 0} <span className="text-xs font-normal text-slate-400">ngày</span>
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {profile?.maxDebtDays === 0
              ? 'Không cho phép nợ qua ngày'
              : `Tính theo ngày lịch kể từ ngày xuất hàng`}
          </span>
        </div>
      </div>

      {/* Thanh đo tỷ lệ sử dụng hạn mức */}
      {limit > 0 && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-center text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
            <span>Tỷ lệ sử dụng hạn mức tín dụng</span>
            <span className="font-bold">{usedPercent}% ({formatCurrency(debt)} / {formatCurrency(limit)})</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} transition-all duration-500`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Nhật ký Lịch sử Thay đổi (Append-Only) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-indigo-500" />
            Lịch Sử Điều Chỉnh Hạn Mức ({histories.length})
          </h4>
          <span className="text-[11px] text-slate-400">Ghi nhận minh bạch mọi lần cập nhật</span>
        </div>

        {histories.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            Chưa có lịch sử điều chỉnh hạn mức công nợ cho đại lý này.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                    <th className="py-2.5 px-3 font-semibold">Hạn mức (Cũ → Mới)</th>
                    <th className="py-2.5 px-3 font-semibold">Thời hạn nợ</th>
                    <th className="py-2.5 px-3 font-semibold">Người điều chỉnh</th>
                    <th className="py-2.5 px-3 font-semibold">Lý do thay đổi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {histories.map((h) => {
                    const isLimitIncreased = h.newCreditLimit >= h.oldCreditLimit;
                    return (
                      <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {formatDate(h.createdAt || (h as any).created_at)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 line-through">
                              {formatCurrency(h.oldCreditLimit)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className={`font-bold ${isLimitIncreased ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {formatCurrency(h.newCreditLimit)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">{h.oldMaxDebtDays}d</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {h.newMaxDebtDays} ngày
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
                          {h.changedBy}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={h.reason}>
                          {h.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Điều Chỉnh Hạn Mức */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Điều Chỉnh Hạn Mức Công Nợ
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Đại lý: <span className="font-semibold text-slate-700 dark:text-slate-200">{customerName}</span>
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Ô nhập hạn mức tiền */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Hạn Mức Công Nợ Tối Đa (VNĐ) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={limitInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                      setLimitInput(raw ? formatCurrencyInput(raw) : '');
                      const num = raw === '' ? 0 : Number(raw);
                      if (num <= 10000000000) {
                        setCreditLimit(num);
                      }
                    }}
                    onFocus={(e) => {
                      if (limitInput === '0') {
                        setLimitInput('');
                      } else {
                        e.target.select();
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 pr-32"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-semibold pointer-events-none">
                    {formatCurrency(creditLimit)}
                  </span>
                </div>

                {/* Phím bấm chọn nhanh số tiền */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 self-center mr-1">Gợi ý nhanh:</span>
                  {[0, 20_000_000, 50_000_000, 100_000_000, 200_000_000, 500_000_000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleQuickAmount(amt)}
                      className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
                    >
                      {amt === 0 ? '0 đ' : `${amt / 1_000_000}M`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ô nhập số ngày nợ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Số Ngày Nợ Tối Đa (Ngày Lịch) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={daysInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                      setDaysInput(raw);
                      const num = raw === '' ? 0 : Number(raw);
                      if (num <= 365) {
                        setMaxDebtDays(num);
                      }
                    }}
                    onFocus={(e) => {
                      if (daysInput === '0') {
                        setDaysInput('');
                      } else {
                        e.target.select();
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 pointer-events-none">
                    ngày
                  </span>
                </div>

                {/* Phím bấm chọn nhanh số ngày nợ */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 self-center mr-1">Gợi ý nhanh:</span>
                  {[0, 15, 30, 45, 60].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => handleQuickDays(days)}
                      className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
                    >
                      {days === 0 ? '0 ngày' : `${days} ngày`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Đơn hàng đã xuất kho vượt quá số ngày này sẽ bị hệ thống tự động khóa xuất hàng tiếp theo.
                </p>
              </div>

              {/* Ô nhập lý do thay đổi */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Lý Do Điều Chỉnh <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {reason.trim().length}/5 ký tự tối thiểu
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ví dụ: Nâng hạn mức phục vụ cao điểm vụ mùa theo đề xuất của Giám đốc kinh doanh..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  disabled={submitting}
                >
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
