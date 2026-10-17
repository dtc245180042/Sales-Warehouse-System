import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Clock,
  Play,
  RefreshCw,
  Save,
  History,
  Users,
  TrendingDown,
  FileCheck2,
  Info,
  DollarSign,
  ChevronRight,
  ShieldCheck,
  Search,
  Filter,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDate, formatCurrencyInput, parseSafeDate } from '../../utils/formatters';
import { debtRiskService } from '../../services/debtRiskService';
import {
  DebtRiskConfig,
  DebtRiskAction,
  DebtRiskLevel,
  CustomerDebtFlag,
  CustomerDebtFlagHistoryItem,
  DebtRiskOverviewSummary,
  DailyEvaluationJobResponse,
} from '../../types/DebtRisk';

const getRiskLevelBadge = (level: string) => {
  switch (level) {
    case 'HIGH_RISK':
      return {
        label: 'Quá hạn & Vượt mức',
        className: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200',
      };
    case 'OVERDUE':
      return {
        label: 'Nợ quá hạn',
        className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
      };
    case 'LIMIT_EXCEEDED':
      return {
        label: 'Vượt hạn mức',
        className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
      };
    case 'WARNING':
      return {
        label: 'Cảnh báo (>80%)',
        className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
      };
    case 'SAFE':
    default:
      return {
        label: 'An toàn',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
      };
  }
};

const getEventTypeLabel = (type: string) => {
  switch (type) {
    case 'FLAGGED':
      return 'Gắn cờ rủi ro';
    case 'UNFLAGGED':
      return 'Hạ cờ / An toàn';
    case 'AUTO_LOCKED':
      return 'Tự động khóa bán';
    case 'AUTO_UNLOCKED':
      return 'Tự động mở khóa';
    case 'REEVALUATED':
      return 'Đánh giá lại';
    case 'CONFIG_CHANGED':
      return 'Thay đổi cấu hình';
    default:
      return type || 'Biến động';
  }
};

const getSourceLabel = (src: string) => {
  switch (src) {
    case 'PAYMENT_TRIGGER':
    case 'PAYMENT_HOOK':
      return 'Ghi nhận thanh toán';
    case 'DAILY_JOB':
      return 'Quét tự động hàng ngày';
    case 'MANUAL':
    case 'MANUAL_REEVALUATE':
      return 'Thao tác thủ công';
    case 'CONFIG_UPDATE':
      return 'Cập nhật cấu hình';
    case 'TEST_BEFORE_PAY':
      return 'Kiểm tra trước thanh toán';
    default:
      return src || 'Hệ thống';
  }
};

const renderLogTimestamp = (dateString?: string | null) => {
  const d = parseSafeDate(dateString);
  if (!d) return <span className="text-slate-400 font-mono text-xs">—</span>;

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  const isToday = d.getDate() === 16 && d.getMonth() === 9 && d.getFullYear() === 2026;
  const isYesterday = d.getDate() === 15 && d.getMonth() === 9 && d.getFullYear() === 2026;

  return (
    <div>
      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-mono text-xs">
        <Clock className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <span>{hours}:{minutes}:{seconds}</span>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
        <span>{day}/{month}/{year}</span>
        {isToday && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Hôm nay
          </span>
        )}
        {isYesterday && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Hôm qua
          </span>
        )}
      </div>
    </div>
  );
};

export const DebtRiskConfigPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTabParam = searchParams.get('tab');
  const activeTab: 'config' | 'flagged' | 'history' =
    currentTabParam === 'flagged' || currentTabParam === 'history' ? currentTabParam : 'config';

  const setActiveTab = (tab: 'config' | 'flagged' | 'history') => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'config') {
          next.delete('tab');
        } else {
          next.set('tab', tab);
        }
        return next;
      },
      { replace: true }
    );
  };

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningJob, setIsRunningJob] = useState(false);
  const [jobResultModalOpen, setJobResultModalOpen] = useState(false);
  const [jobResult, setJobResult] = useState<DailyEvaluationJobResponse | null>(null);

  // Cấu hình form state
  const [config, setConfig] = useState<DebtRiskConfig | null>(null);
  const [autoFlagEnabled, setAutoFlagEnabled] = useState(true);
  const [actionOnOverdue, setActionOnOverdue] = useState<DebtRiskAction>('BLOCK');
  const [actionOnCreditLimitExceeded, setActionOnCreditLimitExceeded] = useState<DebtRiskAction>('REQUIRE_APPROVAL');
  const [gracePeriodDays, setGracePeriodDays] = useState<number>(0);
  const [gracePeriodInput, setGracePeriodInput] = useState<string>('0');
  const [minDebtToFlag, setMinDebtToFlag] = useState<number>(0);
  const [minDebtInput, setMinDebtInput] = useState<string>('0');
  const [autoLockOnFlag, setAutoLockOnFlag] = useState(true);
  const [description, setDescription] = useState('');

  // Dữ liệu thống kê & danh sách
  const [summary, setSummary] = useState<DebtRiskOverviewSummary | null>(null);
  const [flaggedCustomers, setFlaggedCustomers] = useState<CustomerDebtFlag[]>([]);
  const [histories, setHistories] = useState<CustomerDebtFlagHistoryItem[]>([]);
  const [searchFlagged, setSearchFlagged] = useState('');
  const [filterRiskLevel, setFilterRiskLevel] = useState<string>('ALL');

  // Bộ lọc Nhật ký kiểm toán
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [historyEventTypeFilter, setHistoryEventTypeFilter] = useState<string>('ALL');

  // Kiểm tra quyền: Cho phép tất cả nhân sự nội bộ (Admin, Quản lý, Kế toán, Sales Rep, Thủ kho...) thao tác cấu hình
  const roleLower = String(user?.role || '').toLowerCase();
  const canEditConfig = !roleLower.includes('customer') && !roleLower.includes('khach_hang');


  const loadData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const [cfg, sum, flags, hist] = await Promise.all([
        debtRiskService.getConfig(forceRefresh),
        debtRiskService.getSummary(forceRefresh),
        debtRiskService.getFlags(),
        debtRiskService.getAllHistories({ limit: 200 }),
      ]);

      setConfig(cfg);
      setAutoFlagEnabled(cfg.autoFlagEnabled);
      setActionOnOverdue(cfg.actionOnOverdue);
      setActionOnCreditLimitExceeded(cfg.actionOnCreditLimitExceeded);
      setGracePeriodDays(cfg.gracePeriodDays);
      setGracePeriodInput(String(cfg.gracePeriodDays ?? 0));
      setMinDebtToFlag(cfg.minDebtToFlag);
      setMinDebtInput(formatCurrencyInput(cfg.minDebtToFlag ?? 0));
      setAutoLockOnFlag(cfg.autoLockOnFlag);
      setDescription(cfg.description || '');

      setSummary(sum);
      setFlaggedCustomers(flags);
      setHistories(hist);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tải dữ liệu cấu hình rủi ro công nợ';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditConfig) {
      showToast('Bạn không có quyền sửa cấu hình rủi ro công nợ.', 'error');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await debtRiskService.updateConfig({
        auto_flag_enabled: autoFlagEnabled,
        action_on_overdue: actionOnOverdue,
        action_on_credit_limit_exceeded: actionOnCreditLimitExceeded,
        grace_period_days: Number(gracePeriodDays),
        min_debt_to_flag: Number(minDebtToFlag),
        auto_lock_on_flag: autoLockOnFlag,
        description: description.trim() || undefined,
      });

      setConfig(updated);
      showToast('Đã lưu cấu hình quy tắc xử lý rủi ro công nợ thành công!', 'success');
      loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu cấu hình';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleMasterSwitch = async (checked: boolean) => {
    setAutoFlagEnabled(checked);
    try {
      setIsSaving(true);
      const updated = await debtRiskService.updateConfig({
        auto_flag_enabled: checked,
        action_on_overdue: actionOnOverdue,
        action_on_credit_limit_exceeded: actionOnCreditLimitExceeded,
        grace_period_days: Number(gracePeriodDays),
        min_debt_to_flag: Number(minDebtToFlag),
        auto_lock_on_flag: autoLockOnFlag,
        description: description.trim() || undefined,
      });

      setConfig(updated);
      setAutoFlagEnabled(updated.autoFlagEnabled);
      showToast(
        checked
          ? 'Đã BẬT hệ thống tự động gắn cờ rủi ro công nợ!'
          : 'Đã TẮT hệ thống tự động gắn cờ rủi ro công nợ!',
        'success'
      );
      loadData(true);
    } catch (err: unknown) {
      setAutoFlagEnabled(!checked);
      const msg = err instanceof Error ? err.message : 'Không thể thay đổi trạng thái tự động gắn cờ';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunDailyJobNow = async () => {
    try {
      setIsRunningJob(true);
      const result = await debtRiskService.runDailyJob();
      setJobResult(result);
      setJobResultModalOpen(true);
      showToast('Tác vụ đánh giá công nợ đã hoàn thành!', 'success');
      loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi thực thi tác vụ quét rủi ro';
      showToast(msg, 'error');
    } finally {
      setIsRunningJob(false);
    }
  };

  const handleReevaluateCustomer = async (customerId: string) => {
    try {
      const updated = await debtRiskService.reevaluate(customerId);
      showToast(`Đã đánh giá lại đại lý ${customerId}: ${updated.riskLevel}`, 'info');
      loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể đánh giá lại';
      showToast(msg, 'error');
    }
  };

  const filteredFlagged = flaggedCustomers.filter((item) => {
    const matchesSearch =
      !searchFlagged ||
      (item.customer_id || '').toLowerCase().includes(searchFlagged.toLowerCase()) ||
      (item.customer_name || '').toLowerCase().includes(searchFlagged.toLowerCase());

    const matchesLevel =
      filterRiskLevel === 'ALL' || item.risk_level === filterRiskLevel;

    return matchesSearch && matchesLevel;
  });

  const filteredHistories = histories.filter((item) => {
    // 1. Lọc theo từ khóa tìm kiếm (đại lý hoặc nguyên nhân)
    if (searchHistory.trim()) {
      const q = searchHistory.toLowerCase();
      const matchCust =
        (item.customer_name || '').toLowerCase().includes(q) ||
        (item.customer_id || '').toLowerCase().includes(q);
      const matchReason = (item.reason || '').toLowerCase().includes(q);
      if (!matchCust && !matchReason) return false;
    }

    // 2. Lọc theo loại sự kiện
    if (historyEventTypeFilter !== 'ALL' && item.event_type !== historyEventTypeFilter) {
      return false;
    }

    return true;
  });

  if (loading && !config) {
    return (
      <PageContainer title="Cấu hình Quy tắc Rủi ro & Chặn bán Công nợ">
        <div className="flex justify-center items-center py-20">
          <Loading />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Cấu hình Quy tắc Rủi ro & Chặn bán Công nợ"
      subtitle="Tự động kiểm soát rủi ro, phân loại và khóa bán đại lý theo chính sách công nợ"
      actions={
        <Button
          variant="primary"
          size="md"
          onClick={handleRunDailyJobNow}
          disabled={isRunningJob}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20"
        >
          <Play className={`w-4 h-4 mr-2 ${isRunningJob ? 'animate-spin' : ''}`} />
          {isRunningJob ? 'Đang quét...' : '⚡ Chạy quét công nợ ngay'}
        </Button>
      }
      breadcrumbs={[
        { label: 'Cài đặt hệ thống', path: '/settings' },
        {
          label:
            activeTab === 'flagged'
              ? 'Đại lý bị gắn cờ'
              : activeTab === 'history'
              ? 'Nhật ký Cảnh báo & Khóa/Mở bán'
              : 'Cấu hình Cảnh báo & Khóa bán',
          path: `/settings/debt-risk${activeTab !== 'config' ? `?tab=${activeTab}` : ''}`,
        },
      ]}
    >
      <div className="space-y-6 w-full pb-8">
        {/* Overview KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng đại lý</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  {summary.total_customers}
                </span>
                <Users className="w-5 h-5 text-slate-400" />
              </div>
              <span className="text-[11px] text-slate-400 mt-1">Toàn bộ danh bạ</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 shadow-sm flex flex-col justify-between hover:border-emerald-300 dark:hover:border-emerald-700 transition">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">An toàn</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {summary.safe_count}
                </span>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1">Đúng hạn & trong mức</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 shadow-sm flex flex-col justify-between hover:border-amber-300 dark:hover:border-amber-700 transition">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Bị gắn cờ rủi ro</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {flaggedCustomers.filter((f) => f.is_flagged).length}
                </span>
                <ShieldAlert className="w-5 h-5 text-amber-500" />
              </div>
              <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1">Quá hạn hoặc vượt mức</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 shadow-sm flex flex-col justify-between hover:border-rose-300 dark:hover:border-rose-700 transition">
              <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">Nợ quá hạn</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {summary.overdue_count + summary.high_risk_count}
                </span>
                <Clock className="w-5 h-5 text-rose-500" />
              </div>
              <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1">Quá ngày nợ cho phép</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-red-300 dark:border-red-900 shadow-sm bg-red-50/20 dark:bg-red-950/20 flex flex-col justify-between hover:border-red-400 dark:hover:border-red-700 transition">
              <span className="text-xs text-red-700 dark:text-red-400 font-bold">Khóa bán (Chặn đơn)</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-red-600 dark:text-red-400">
                  {summary.blocked_count}
                </span>
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1">Từ chối tạo đơn mới</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 shadow-sm bg-purple-50/20 dark:bg-purple-950/20 flex flex-col justify-between hover:border-purple-300 dark:hover:border-purple-700 transition">
              <span className="text-xs text-purple-700 dark:text-purple-400 font-bold">Cần duyệt đơn</span>
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {summary.requires_approval_count}
                </span>
                <FileCheck2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-1">Chuyển sang chờ duyệt</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <nav className="flex space-x-6">
            <button
              onClick={() => setActiveTab('config')}
              className={`pb-4 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'config'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Cấu hình Cảnh báo & Khóa bán</span>
            </button>

            <button
              onClick={() => setActiveTab('flagged')}
              className={`pb-4 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'flagged'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Đại lý bị gắn cờ ({flaggedCustomers.filter((f) => f.is_flagged).length})</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`pb-4 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'history'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Nhật ký Cảnh báo & Khóa/Mở bán</span>
            </button>
          </nav>
        </div>

        {/* TAB 1: FORM CẤU HÌNH QUY TẮC CHẶN BÁN */}
        {activeTab === 'config' && (
          <form onSubmit={handleSaveConfig} className="space-y-6">
            {/* Switch Master: Tự động gắn cờ */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Kích hoạt hệ thống Tự động Gắn cờ Rủi ro
                  </h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${autoFlagEnabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                    {autoFlagEnabled ? 'Đang Bật' : 'Đang Tắt'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                  Khi bật, hệ thống sẽ tự động quét hóa đơn quá hạn và đơn hàng vượt hạn mức để gắn cờ rủi ro sau mỗi
                  lần ghi nhận thanh toán và qua tác vụ quét hàng ngày.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFlagEnabled}
                  onChange={(e) => handleToggleMasterSwitch(e.target.checked)}
                  disabled={!canEditConfig || isSaving}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Quy tắc 1: Khi Nợ Quá Hạn */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-4">
                <Clock className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Quy tắc xử lý khi Đại lý có Nợ Quá Hạn
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Áp dụng khi đại lý có hóa đơn chưa thanh toán vượt quá số ngày nợ cho phép (sau khi cộng số ngày ân hạn).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Option 1: BLOCK */}
                <div
                  onClick={() => canEditConfig && setActionOnOverdue('BLOCK')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col justify-between ${
                    actionOnOverdue === 'BLOCK'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 shadow-md shadow-rose-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
                        <Ban className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Nghiêm ngặt</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      🔒 Khóa Bán Hoàn Toàn
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Từ chối tạo đơn mới. Nút tạo đơn bị vô hiệu hóa kèm cảnh báo đỏ. Nhân viên không thể gửi đơn cho đến
                      khi nợ quá hạn được thanh toán.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {actionOnOverdue === 'BLOCK' ? '✓ Đang áp dụng' : 'Bấm để chọn'}
                  </div>
                </div>

                {/* Option 2: REQUIRE_APPROVAL */}
                <div
                  onClick={() => canEditConfig && setActionOnOverdue('REQUIRE_APPROVAL')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col justify-between ${
                    actionOnOverdue === 'REQUIRE_APPROVAL'
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-md shadow-amber-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Linh hoạt</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      📝 Chuyển Sang Chờ Duyệt
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Vẫn cho phép tạo đơn nhưng trạng thái tự động chuyển sang "Chờ duyệt" (pending_approval). Bắt buộc
                      Quản lý kinh doanh phê duyệt ngoại lệ mới được xuất kho.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {actionOnOverdue === 'REQUIRE_APPROVAL' ? '✓ Đang áp dụng' : 'Bấm để chọn'}
                  </div>
                </div>

                {/* Option 3: WARNING_ONLY */}
                <div
                  onClick={() => canEditConfig && setActionOnOverdue('WARNING_ONLY')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col justify-between ${
                    actionOnOverdue === 'WARNING_ONLY'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-md shadow-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                        <Info className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Nhắc nhở</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      ⚠️ Chỉ Cảnh Báo
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Hiển thị thông báo nhắc nhở nợ quá hạn trên màn hình tạo đơn và hồ sơ đại lý, nhưng vẫn cho phép
                      tạo đơn bình thường không chặn.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    {actionOnOverdue === 'WARNING_ONLY' ? '✓ Đang áp dụng' : 'Bấm để chọn'}
                  </div>
                </div>
              </div>
            </div>

            {/* Quy tắc 2: Khi Vượt Hạn Mức Tiền */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-4">
                <TrendingDown className="w-5 h-5 text-purple-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Quy tắc xử lý khi Vượt Hạn Mức Tiền
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Áp dụng khi tổng công nợ hiện tại cộng giá trị đơn mới vượt quá hạn mức tiền được cấp cho đại lý.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Option 1: BLOCK */}
                <div
                  onClick={() => canEditConfig && setActionOnCreditLimitExceeded('BLOCK')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col justify-between ${
                    actionOnCreditLimitExceeded === 'BLOCK'
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 shadow-md shadow-rose-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
                        <Ban className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Nghiêm ngặt</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      🔒 Khóa Bán Hoàn Toàn
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Chặn tạo đơn ngay khi tổng nợ vượt hạn mức. Bắt buộc thu bớt nợ cũ hoặc thanh toán đơn mới trước
                      khi chốt.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {actionOnCreditLimitExceeded === 'BLOCK' ? '✓ Đang áp dụng' : 'Bấm để chọn'}
                  </div>
                </div>

                {/* Option 2: REQUIRE_APPROVAL */}
                <div
                  onClick={() => canEditConfig && setActionOnCreditLimitExceeded('REQUIRE_APPROVAL')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col justify-between ${
                    actionOnCreditLimitExceeded === 'REQUIRE_APPROVAL'
                      ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-md shadow-amber-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Khuyên dùng</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      📝 Chuyển Sang Chờ Duyệt
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Đơn hàng vượt hạn mức chuyển sang trạng thái "Chờ duyệt" (pending_approval). Hệ thống ghi rõ số tiền
                      vượt để Quản lý kinh doanh duyệt.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {actionOnCreditLimitExceeded === 'REQUIRE_APPROVAL' ? '✓ Đang áp dụng' : 'Bấm để chọn'}
                  </div>
                </div>

                {/* Option 3: WARNING_ONLY */}
                <div
                  onClick={() => canEditConfig && setActionOnCreditLimitExceeded('WARNING_ONLY')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col justify-between ${
                    actionOnCreditLimitExceeded === 'WARNING_ONLY'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-md shadow-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                        <Info className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Nhắc nhở</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      ⚠️ Chỉ Cảnh Báo
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Hiển thị cảnh báo số tiền vượt hạn mức trên luồng tạo đơn để nhân viên kinh doanh biết, nhưng không
                      chặn tạo đơn.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    {actionOnCreditLimitExceeded === 'WARNING_ONLY' ? '✓ Đang áp dụng' : 'Bấm để chọn'}
                  </div>
                </div>
              </div>
            </div>

            {/* Tham số chi tiết: Ân hạn & Ngưỡng nợ */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                Tham Số Điều Kiện Bổ Sung
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Số ngày ân hạn quá hạn
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={gracePeriodInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                        setGracePeriodInput(raw);
                        const num = raw === '' ? 0 : Math.min(30, parseInt(raw, 10));
                        setGracePeriodDays(num);
                      }}
                      onFocus={(e) => {
                        if (e.target.value === '0') {
                          e.target.select();
                        }
                      }}
                      onBlur={() => {
                        if (!gracePeriodInput || gracePeriodInput.trim() === '') {
                          setGracePeriodInput('0');
                          setGracePeriodDays(0);
                        } else {
                          const num = Math.min(30, parseInt(gracePeriodInput, 10) || 0);
                          setGracePeriodInput(String(num));
                          setGracePeriodDays(num);
                        }
                      }}
                      disabled={!canEditConfig}
                      placeholder="0"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 font-semibold pr-14"
                    />
                    <span className="absolute right-4 top-2.5 text-xs text-slate-400 font-medium pointer-events-none select-none">
                      ngày
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Số ngày cho phép trễ hạn trước khi hệ thống chính thức tính là nợ quá hạn (mặc định 0 ngày = tính ngay).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ngưỡng số nợ tối thiểu để kích hoạt gắn cờ (VNĐ)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={minDebtInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                        setMinDebtInput(raw ? formatCurrencyInput(raw) : '');
                        const num = raw === '' ? 0 : Number(raw);
                        setMinDebtToFlag(num);
                      }}
                      onFocus={(e) => {
                        if (e.target.value === '0') {
                          e.target.select();
                        }
                      }}
                      onBlur={() => {
                        if (!minDebtInput || minDebtInput.trim() === '') {
                          setMinDebtInput('0');
                          setMinDebtToFlag(0);
                        } else {
                          setMinDebtInput(formatCurrencyInput(minDebtToFlag));
                        }
                      }}
                      disabled={!canEditConfig}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 font-semibold pr-14"
                    />
                    <span className="absolute right-4 top-2.5 text-xs text-slate-400 font-medium pointer-events-none select-none">
                      VNĐ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tránh gắn cờ các khoản nợ tiền lẻ làm tròn không đáng kể (mặc định 0 đ).
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ghi chú / Mô tả cấu hình
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!canEditConfig}
                    placeholder="Mô tả lý do hoặc căn cứ chính sách rủi ro công nợ của doanh nghiệp..."
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Nút Submit */}
            {canEditConfig && (
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 shadow-lg shadow-blue-500/20"
                >
                  <Save className={`w-4 h-4 mr-2 ${isSaving ? 'animate-spin' : ''}`} />
                  {isSaving ? 'Đang lưu cấu hình...' : 'Lưu Thay Đổi Quy Tắc'}
                </Button>
              </div>
            )}
          </form>
        )}

        {/* TAB 2: DANH SÁCH ĐẠI LÝ BỊ GẮN CỜ */}
        {activeTab === 'flagged' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Filter toolbar */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm đại lý theo mã hoặc tên..."
                  value={searchFlagged}
                  onChange={(e) => setSearchFlagged(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={filterRiskLevel}
                  onChange={(e) => setFilterRiskLevel(e.target.value)}
                  className="px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none"
                >
                  <option value="ALL">Tất cả cấp độ rủi ro</option>
                  <option value="HIGH_RISK">🔴 Quá hạn & Vượt mức</option>
                  <option value="OVERDUE">⏰ Nợ quá hạn</option>
                  <option value="LIMIT_EXCEEDED">📉 Vượt hạn mức</option>
                  <option value="SAFE">🟢 An toàn</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800 uppercase font-bold tracking-wider text-xs">
                  <tr>
                    <th className="py-3.5 px-6">Đại lý</th>
                    <th className="py-3.5 px-6">Trạng thái rủi ro</th>
                    <th className="py-3.5 px-6">Hạn mức cấp</th>
                    <th className="py-3.5 px-6">Dư nợ hiện tại</th>
                    <th className="py-3.5 px-6">Quá hạn</th>
                    <th className="py-3.5 px-6">Hành vi áp dụng</th>
                    <th className="py-3.5 px-6 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredFlagged.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Không có đại lý nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredFlagged.map((item) => {
                      const badge = getRiskLevelBadge(item.risk_level);
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                            item.is_blocked ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''
                          }`}
                        >
                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {item.customer_name || item.customer_id}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">{item.customer_id}</div>
                          </td>

                          <td className="py-4 px-6">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-xs border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>

                          <td className="py-4 px-6 font-semibold text-slate-800 dark:text-slate-200">
                            {formatCurrency(item.credit_limit)}
                          </td>

                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {formatCurrency(item.total_debt)}
                            </div>
                            {item.excess_amount > 0 && (
                              <span className="block text-xs text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                                (Vượt {formatCurrency(item.excess_amount)})
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-6">
                            {item.max_overdue_days > 0 ? (
                              <div className="text-rose-600 dark:text-rose-400 font-bold">
                                {item.max_overdue_days} ngày
                                <span className="block text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                  {formatCurrency(item.overdue_amount)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium">Đúng hạn</span>
                            )}
                          </td>

                          <td className="py-4 px-6">
                            {item.is_blocked ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900 font-bold text-xs">
                                <Ban className="w-3.5 h-3.5 text-red-600" />
                                <span>Khóa bán (Chặn đơn)</span>
                              </span>
                            ) : item.requires_approval ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 font-bold text-xs">
                                <FileCheck2 className="w-3.5 h-3.5 text-amber-600" />
                                <span>Cần duyệt đơn</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-xs">Cho phép</span>
                            )}
                          </td>

                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleReevaluateCustomer(item.customer_id)}
                              className="px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-xs font-bold transition"
                              title="Đánh giá lại ngay"
                            >
                              <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                              Đánh giá lại
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: NHẬT KÝ KIỂM TOÁN CÔNG NỢ */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Header info */}
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Nhật Ký Biến Động Cờ Rủi Ro & Khóa/Mở Bán
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bảng lưu trữ Append-Only bất biến phục vụ kiểm toán tài chính và theo dõi các lần gắn cờ / giải tỏa nợ.
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Hiển thị <span className="font-bold text-slate-900 dark:text-slate-100">{filteredHistories.length}</span> / {histories.length} bản ghi
              </span>
            </div>

            {/* Filter Toolbar cho Tab 3 */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div className="relative w-full lg:w-96">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo đại lý, mã hoặc lý do..."
                  value={searchHistory}
                  onChange={(e) => setSearchHistory(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                {/* Bộ lọc Loại sự kiện */}
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs shadow-sm">
                  <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-xs whitespace-nowrap">Sự kiện:</span>
                  <select
                    value={historyEventTypeFilter}
                    onChange={(e) => setHistoryEventTypeFilter(e.target.value)}
                    className="bg-transparent text-slate-900 dark:text-slate-100 font-bold focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="ALL">Tất cả sự kiện</option>
                    <option value="AUTO_LOCKED">🔒 Tự động khóa bán</option>
                    <option value="AUTO_UNLOCKED">🔓 Tự động mở khóa</option>
                    <option value="FLAGGED">🚩 Gắn cờ rủi ro</option>
                    <option value="UNFLAGGED">✅ Hạ cờ / An toàn</option>
                    <option value="CONFIG_CHANGED">⚙️ Thay đổi cấu hình</option>
                    <option value="REEVALUATED">🔄 Đánh giá lại</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800 uppercase font-bold tracking-wider text-xs">
                  <tr>
                    <th className="py-3.5 px-6">Thời gian</th>
                    <th className="py-3.5 px-6">Đại lý</th>
                    <th className="py-3.5 px-6">Sự kiện</th>
                    <th className="py-3.5 px-6">Thay đổi rủi ro</th>
                    <th className="py-3.5 px-6">Chi tiết nguyên nhân</th>
                    <th className="py-3.5 px-6">Nguồn kích hoạt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredHistories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Không có bản ghi biến động nào phù hợp với bộ lọc tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredHistories.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 px-6 whitespace-nowrap">
                          {renderLogTimestamp(h.createdAt || h.created_at)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {h.customer_name || h.customer_id}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{h.customer_id}</div>
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-xs border ${
                              h.event_type === 'AUTO_LOCKED' || h.event_type === 'FLAGGED'
                                ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                                : h.event_type === 'AUTO_UNLOCKED' || h.event_type === 'UNFLAGGED'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                                : h.event_type === 'REEVALUATED'
                                ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {getEventTypeLabel(h.event_type)}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400 font-medium">
                              {h.previous_risk_level ? getRiskLevelBadge(h.previous_risk_level).label : 'Chưa có'}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {getRiskLevelBadge(h.new_risk_level).label}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-700 dark:text-slate-300 max-w-md text-xs leading-relaxed">
                          {h.reason}
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {getSourceLabel(h.source)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL KẾT QUẢ CHẠY QUÉT HÀNG NGÀY */}
      {jobResult && (
        <Modal
          isOpen={jobResultModalOpen}
          onClose={() => setJobResultModalOpen(false)}
          title="Kết quả thực thi tác vụ quét rủi ro công nợ"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500">Đại lý đã quét</span>
                <span className="block text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {jobResult.total_customers_scanned}
                </span>
              </div>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800">
                <span className="text-xs text-rose-600">Đang bị gắn cờ</span>
                <span className="block text-xl font-black text-rose-600 mt-1">
                  {jobResult.total_flagged}
                </span>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800">
                <span className="text-xs text-red-600">Bị khóa bán</span>
                <span className="block text-xl font-black text-red-600 mt-1">
                  {jobResult.total_blocked}
                </span>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
                <span className="text-xs text-amber-600">Chuyển duyệt</span>
                <span className="block text-xl font-black text-amber-600 mt-1">
                  {jobResult.total_require_approval}
                </span>
              </div>
            </div>

            {jobResult.details && jobResult.details.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Danh sách đại lý vi phạm mới được gắn cờ:
                </h4>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl">
                  {jobResult.details.map((d, i) => (
                    <div key={i} className="p-2.5 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 mr-2">
                          {d.customer_name || d.customer_id}
                        </span>
                        <span className="text-slate-500 text-[11px]">{d.reason}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                        {d.risk_level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t">
              <Button variant="primary" onClick={() => setJobResultModalOpen(false)}>
                Đã hiểu
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  );
};
