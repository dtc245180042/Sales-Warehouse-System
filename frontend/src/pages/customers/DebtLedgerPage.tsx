import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link, useParams } from 'react-router-dom';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  RefreshCw,
  Search,
  Building2,
  Phone,
  MapPin,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  FileText,
  CheckCircle2,
  Clock,
  RotateCcw,
  Receipt,
  Users,
  ChevronRight,
  ChevronDown,
  X,
  Check,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { customerDebtLedgerService } from '../../services/customerDebtLedgerService';
import { customerService } from '../../services/customerService';
import {
  CustomerDebtLedgerResponse,
  CustomerDebtLedgerOverviewItem,
} from '../../types/debtLedger';
import { Customer } from '../../types/Customer';
import { useToast } from '../../contexts/ToastContext';

export const DebtLedgerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: paramCustomerId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const queryCustomerId = searchParams.get('customerId') || paramCustomerId || '';

  // Tab: 'single' (Sổ chi tiết 1 đại lý) | 'overview' (Tổng quan tất cả đại lý)
  const [activeTab, setActiveTab] = useState<'single' | 'overview'>('single');

  // Danh sách đại lý phục vụ selector (khởi tạo RAM cache tức thì 0ms theo AGENTS.md)
  const [agencyOptions, setAgencyOptions] = useState<
    { id: string; code: string; name: string; phone?: string; closing_balance?: number; transactions_count?: number }[]
  >(() => {
    try {
      const cached = customerService.getCached();
      if (cached && cached.length > 0) {
        return cached.map((c) => ({
          id: c.id,
          code: c.code || c.id,
          name: c.name || c.id,
          phone: c.phone,
          closing_balance: c.currentDebt || c.current_debt || 0,
          transactions_count: c.totalOrders || 0,
        }));
      }
    } catch {}
    return [];
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(queryCustomerId || '');

  // Bộ lọc khoảng thời gian
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7days' | 'month' | 'quarter' | 'year'>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Dữ liệu Sổ chi tiết
  const [ledgerData, setLedgerData] = useState<CustomerDebtLedgerResponse | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Dữ liệu Tổng quan tất cả đại lý
  const [overviewItems, setOverviewItems] = useState<CustomerDebtLedgerOverviewItem[]>([]);
  const [totalClosingDebt, setTotalClosingDebt] = useState(0);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewSearch, setOverviewSearch] = useState('');

  // Trạng thái xuất file
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // 1. Tải danh sách đại lý ban đầu (tải nhanh qua customerService <20ms, sau đó làm giàu dữ liệu qua SWR)
  useEffect(() => {
    let isMounted = true;
    const fetchAgencies = async () => {
      try {
        // Tải nhanh danh sách toàn bộ đại lý từ customerService
        const customers = await customerService.getAll();
        if (!isMounted) return;

        if (customers && customers.length > 0) {
          const baseOptions = customers.map((c) => ({
            id: c.id,
            code: c.code || c.id,
            name: c.name || c.id,
            phone: c.phone,
            closing_balance: c.currentDebt || c.current_debt || 0,
            transactions_count: c.totalOrders || 0,
          }));
          setAgencyOptions(baseOptions);

          setSelectedCustomerId((prev) => {
            if (queryCustomerId) return queryCustomerId;
            if (prev && baseOptions.some((o) => o.id === prev)) return prev;
            return '';
          });
        }

        // Tải thêm thông tin công nợ tổng hợp ngầm (SWR) không làm đơ selector
        customerDebtLedgerService
          .getOverview('', undefined, undefined, 1, 200, false)
          .then((overviewRes) => {
            if (!isMounted || !overviewRes?.items?.length) return;
            setOverviewItems(overviewRes.items);
            setTotalClosingDebt(overviewRes.total_closing_debt || 0);

            const overviewMap = new Map(overviewRes.items.map((i) => [i.customer_id, i]));
            setAgencyOptions((prev) =>
              prev.map((opt) => {
                const ov = overviewMap.get(opt.id);
                if (ov) {
                  return {
                    ...opt,
                    name: ov.customer_name || opt.name,
                    code: ov.customer_code || opt.code,
                    closing_balance: ov.closing_balance,
                    transactions_count: ov.transactions_count,
                  };
                }
                return opt;
              })
            );
          })
          .catch((e) => console.warn('Không thể tải overview phụ trợ:', e));
      } catch (err) {
        console.warn('Lỗi khi tải danh sách đại lý:', err);
      }
    };
    fetchAgencies();
    return () => {
      isMounted = false;
    };
  }, [queryCustomerId]);

  // Cập nhật selectedCustomerId nếu queryCustomerId thay đổi
  useEffect(() => {
    if (queryCustomerId && queryCustomerId !== selectedCustomerId) {
      setSelectedCustomerId(queryCustomerId);
      setActiveTab('single');
    }
  }, [queryCustomerId]);

  // Đồng bộ agencyOptions khi ledgerData của đại lý hiện tại có kết quả
  useEffect(() => {
    if (ledgerData?.customer) {
      const cust = ledgerData.customer;
      setAgencyOptions((prev) => {
        const idx = prev.findIndex((o) => o.id === cust.customer_id);
        if (idx === -1) {
          return [
            {
              id: cust.customer_id,
              code: cust.customer_code || cust.customer_id,
              name: cust.customer_name || cust.customer_id,
              phone: cust.phone || undefined,
              closing_balance: ledgerData.closing_balance,
              transactions_count: ledgerData.total_items,
            },
            ...prev,
          ];
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          name: cust.customer_name || updated[idx].name,
          code: cust.customer_code || updated[idx].code,
          phone: cust.phone || updated[idx].phone,
          closing_balance: ledgerData.closing_balance,
          transactions_count: ledgerData.total_items,
        };
        return updated;
      });
    }
  }, [ledgerData]);

  // 2. Hàm đặt khoảng thời gian theo preset
  const applyDatePreset = (preset: 'all' | 'today' | '7days' | 'month' | 'quarter' | 'year') => {
    setDatePreset(preset);
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      const todayStr = toYMD(now);
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === '7days') {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 7);
      setFromDate(toYMD(past7));
      setToDate(toYMD(now));
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(toYMD(firstDay));
      setToDate(toYMD(now));
    } else if (preset === 'quarter') {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const firstDayQ = new Date(now.getFullYear(), quarterMonth, 1);
      setFromDate(toYMD(firstDayQ));
      setToDate(toYMD(now));
    } else if (preset === 'year') {
      const firstDayY = new Date(now.getFullYear(), 0, 1);
      setFromDate(toYMD(firstDayY));
      setToDate(toYMD(now));
    }
  };

  // 3. Tải sổ chi tiết công nợ cho đại lý được chọn
  const fetchLedger = useCallback(
    async (force = false) => {
      if (!selectedCustomerId) return;
      setLoadingLedger(true);
      try {
        const data = await customerDebtLedgerService.getLedger(
          selectedCustomerId,
          fromDate || undefined,
          toDate || undefined,
          force
        );
        setLedgerData(data);
      } catch (err: any) {
        showToast(err.message || 'Không thể tải sổ chi tiết công nợ', 'error');
      } finally {
        setLoadingLedger(false);
      }
    },
    [selectedCustomerId, fromDate, toDate, showToast]
  );

  // 4. Tải danh sách tổng quan
  const fetchOverview = useCallback(
    async (force = false) => {
      setLoadingOverview(true);
      try {
        const res = await customerDebtLedgerService.getOverview(
          overviewSearch || undefined,
          fromDate || undefined,
          toDate || undefined,
          1,
          100,
          force
        );
        setOverviewItems(res.items || []);
        setTotalClosingDebt(res.total_closing_debt || 0);
      } catch (err: any) {
        showToast(err.message || 'Không thể tải tổng quan công nợ', 'error');
      } finally {
        setLoadingOverview(false);
      }
    },
    [overviewSearch, fromDate, toDate, showToast]
  );

  useEffect(() => {
    if (activeTab === 'single') {
      fetchLedger();
    } else {
      fetchOverview();
    }
  }, [activeTab, fetchLedger, fetchOverview]);

  // Xử lý chọn đại lý
  const handleSelectCustomer = (cId: string) => {
    setSelectedCustomerId(cId);
    if (cId) {
      setSearchParams({ customerId: cId });
    } else {
      setSearchParams({});
      setLedgerData(null);
    }
  };

  // Combobox tìm kiếm & chọn đại lý (vừa gõ vừa chọn)
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchText, setCustomerSearchText] = useState('');

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Đồng bộ text trong ô nhập khi chọn đại lý hoặc tải dữ liệu
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerSearchText('');
      return;
    }
    const found = agencyOptions.find((a) => a.id === selectedCustomerId);
    if (found) {
      setCustomerSearchText(found.code ? `[${found.code}] ${found.name || found.id}` : found.name || found.id);
    } else if (ledgerData?.customer?.customer_id === selectedCustomerId) {
      const code = ledgerData.customer.customer_code;
      const name = ledgerData.customer.customer_name || selectedCustomerId;
      setCustomerSearchText(code ? `[${code}] ${name}` : name);
    } else {
      setCustomerSearchText(selectedCustomerId);
    }
  }, [selectedCustomerId, agencyOptions, ledgerData]);

  // Danh sách đại lý được lọc theo từ khoá gõ
  const filteredAgencies = useMemo(() => {
    if (!customerSearchText.trim()) return agencyOptions;
    const kw = customerSearchText.toLowerCase();
    const cleanKw = kw.replace(/^\[.*?\]\s*/, '').trim() || kw;
    return agencyOptions.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(cleanKw)) ||
        (c.code && c.code.toLowerCase().includes(cleanKw)) ||
        (c.id && c.id.toLowerCase().includes(cleanKw)) ||
        (c.phone && c.phone.includes(cleanKw))
    );
  }, [agencyOptions, customerSearchText]);

  // Xử lý phím Enter trong ô nhập
  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const kw = customerSearchText.trim().toLowerCase();
      const cleanKw = kw.replace(/^\[.*?\]\s*/, '').trim() || kw;

      // 1. Khớp chính xác mã hoặc tên
      const exact = agencyOptions.find(
        (c) =>
          c.code.toLowerCase() === cleanKw ||
          c.id.toLowerCase() === cleanKw ||
          c.name.toLowerCase() === cleanKw
      );
      if (exact) {
        handleSelectCustomer(exact.id);
        setCustomerSearchText(exact.code ? `[${exact.code}] ${exact.name || exact.id}` : exact.name || exact.id);
        setIsCustomerDropdownOpen(false);
        return;
      }

      // 2. Chọn kết quả đầu tiên nếu có
      if (filteredAgencies.length > 0) {
        const first = filteredAgencies[0];
        handleSelectCustomer(first.id);
        setCustomerSearchText(first.code ? `[${first.code}] ${first.name || first.id}` : first.name || first.id);
        setIsCustomerDropdownOpen(false);
        return;
      }

      // 3. Tự do nhập mã/tên bất kỳ
      if (customerSearchText.trim()) {
        const customId = cleanKw || customerSearchText.trim();
        handleSelectCustomer(customId);
        setIsCustomerDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsCustomerDropdownOpen(false);
    }
  };

  // 5. Thao tác xuất Excel (SCRUM-847)
  const handleExportExcel = async () => {
    if (!selectedCustomerId || !ledgerData) return;
    setExportingExcel(true);
    try {
      await customerDebtLedgerService.downloadExcel(
        selectedCustomerId,
        fromDate || undefined,
        toDate || undefined,
        ledgerData.customer.customer_name
      );
      showToast('Xuất file Excel thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xuất file Excel', 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  // 6. Thao tác xuất PDF (SCRUM-846)
  const handleExportPdf = async () => {
    if (!selectedCustomerId || !ledgerData) return;
    setExportingPdf(true);
    try {
      await customerDebtLedgerService.downloadPdf(
        selectedCustomerId,
        fromDate || undefined,
        toDate || undefined,
        ledgerData.customer.customer_name
      );
      showToast('Xuất file PDF thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xuất file PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  // 7. Thao tác in ấn trực tiếp
  const handlePrint = () => {
    if (!selectedCustomerId) return;
    customerDebtLedgerService.openPrintWindow(
      selectedCustomerId,
      fromDate || undefined,
      toDate || undefined
    );
  };

  return (
    <PageContainer
      title="Sổ Chi Tiết Công Nợ Đại Lý"
      subtitle="Quản lý và đối chiếu chi tiết số dư nợ luỹ kế, phát sinh tăng giảm theo từng hóa đơn và phiếu thu"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === 'single') fetchLedger(true);
              else fetchOverview(true);
              showToast('Đã làm mới dữ liệu từ máy chủ', 'info');
            }}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loadingLedger || loadingOverview ? 'animate-spin' : ''}`} />}
          >
            Làm mới
          </Button>

          {activeTab === 'single' && ledgerData && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            >
              {exportingExcel ? 'Đang xuất Excel...' : 'Xuất Excel'}
            </Button>
          )}
        </div>
      }
    >
      {/* Tab Switcher */}
      <div className="mb-6 flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('single')}
          className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'single'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Sổ Chi Tiết Đại Lý</span>
          {activeTab === 'single' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Tổng Quan Công Nợ Toàn Hệ Thống</span>
          {activeTab === 'overview' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
          )}
        </button>
      </div>

      {/* FILTER TOOLBAR: Khoảng thời gian & Preset buttons (SCRUM-848) */}
      <div className="p-4 sm:p-5 mb-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Selector Đại lý (khi ở tab single) - Combobox vừa nhập vừa lựa chọn */}
          {activeTab === 'single' ? (
            <div className="flex-1 max-w-lg relative" ref={customerDropdownRef}>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                Chọn Đại Lý / Khách Hàng
              </label>

              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="input-customer-debt"
                  type="text"
                  placeholder="Nhập tên, mã đại lý hoặc SĐT để tìm..."
                  value={customerSearchText}
                  onChange={(e) => {
                    setCustomerSearchText(e.target.value);
                    setIsCustomerDropdownOpen(true);
                  }}
                  onFocus={(e) => {
                    setIsCustomerDropdownOpen(true);
                    e.target.select();
                  }}
                  onKeyDown={handleCustomerInputKeyDown}
                  className="w-full pl-10 pr-16 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all shadow-sm"
                />

                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {customerSearchText && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerSearchText('');
                        handleSelectCustomer('');
                        setIsCustomerDropdownOpen(true);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title="Xóa tìm kiếm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                    title="Mở danh sách"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isCustomerDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Danh sách gợi ý thả xuống */}
              {isCustomerDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto z-50 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAgencies.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        Không tìm thấy đại lý nào khớp với "<strong>{customerSearchText}</strong>"
                      </p>
                      {customerSearchText.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const customId = customerSearchText.trim();
                            handleSelectCustomer(customId);
                            setIsCustomerDropdownOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1.5 mx-auto"
                        >
                          <Search className="w-3.5 h-3.5" />
                          <span>Xem sổ cho mã: "{customerSearchText.trim()}"</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Cho phép chọn nhanh mã vừa gõ nếu khác mã có sẵn */}
                      {customerSearchText.trim() &&
                        !filteredAgencies.some(
                          (a) =>
                            a.id.toLowerCase() === customerSearchText.trim().toLowerCase() ||
                            a.code.toLowerCase() === customerSearchText.trim().toLowerCase()
                        ) && (
                          <div
                            onClick={() => {
                              const customId = customerSearchText.trim();
                              handleSelectCustomer(customId);
                              setIsCustomerDropdownOpen(false);
                            }}
                            className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-semibold border-b border-indigo-100 dark:border-indigo-900/50"
                          >
                            <div className="flex items-center gap-2">
                              <Search className="w-3.5 h-3.5 text-indigo-600" />
                              <span>
                                Tra cứu trực tiếp mã: <strong>"{customerSearchText.trim()}"</strong>
                              </span>
                            </div>
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 rounded font-mono">
                              Enter ↵
                            </span>
                          </div>
                        )}

                      {filteredAgencies.map((c) => {
                        const isSelected = selectedCustomerId === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              handleSelectCustomer(c.id);
                              setCustomerSearchText(c.code ? `[${c.code}] ${c.name || c.id}` : c.name || c.id);
                              setIsCustomerDropdownOpen(false);
                            }}
                            className={`p-3 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 font-bold text-indigo-700 dark:text-indigo-300'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {c.name || c.id}
                                </span>
                                {c.code && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
                                    {c.code}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                                {c.phone && <span>SĐT: {c.phone}</span>}
                                {c.transactions_count !== undefined && c.transactions_count > 0 && (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    {c.transactions_count} chứng từ
                                  </span>
                                )}
                                {c.closing_balance !== undefined && c.closing_balance !== 0 && (
                                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                                    Dư nợ: {formatCurrency(c.closing_balance)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {isSelected && (
                              <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold shrink-0">
                                <Check className="w-4 h-4" />
                                <span className="text-[11px]">Đang chọn</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 max-w-md">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                Tìm kiếm đại lý
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Nhập tên đại lý, mã hoặc số điện thoại..."
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchOverview()}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Quick Preset Buttons */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
              Mốc thời gian nhanh
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'today', label: 'Hôm nay' },
                { id: '7days', label: '7 ngày qua' },
                { id: 'month', label: 'Tháng này' },
                { id: 'year', label: 'Năm nay' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDatePreset(p.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    datePreset === p.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Inputs & Submit */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Từ ngày:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset('all');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Đến ngày:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset('all');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {activeTab === 'single' ? (
        /* ============================================================== */
        /* TAB 1: SỔ CHI TIẾT 1 ĐẠI LÝ (SCRUM-843, SCRUM-845, SCRUM-848)   */
        /* ============================================================== */
        loadingLedger ? (
          <div className="py-20 flex justify-center">
            <Loading text="Đang tổng hợp sổ chi tiết công nợ..." />
          </div>
        ) : ledgerData ? (
          <div className="space-y-6">
            {/* THÔNG TIN ĐẠI LÝ & TÌNH TRẠNG HẠN MỨC */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-md shrink-0">
                    {(ledgerData.customer.customer_name || 'DL').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {ledgerData.customer.customer_name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                        {ledgerData.customer.customer_code}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-indigo-500" />
                        {ledgerData.customer.phone || 'Chưa cập nhật SĐT'}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                        {ledgerData.customer.address || 'Chưa có địa chỉ'}
                      </span>
                      {ledgerData.customer.tax_code && (
                        <span>MST: {ledgerData.customer.tax_code}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                  <Link
                    to={`/customers/${ledgerData.customer.customer_id}`}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    Xem hồ sơ đại lý <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* 4 THẺ TÓM TẮT SỐ LIỆU TÀI CHÍNH KẾ TOÁN (KPIs) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. SỐ DƯ ĐẦU KỲ */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Số Dư Nợ Đầu Kỳ</span>
                  <Clock className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-xl font-black text-slate-800 dark:text-slate-100">
                  {formatCurrency(ledgerData.opening_balance)}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {ledgerData.from_date ? `Tính đến trước ngày ${ledgerData.from_date}` : 'Gốc đầu kỳ khởi tạo'}
                </p>
              </div>

              {/* 2. TỔNG PHÁT SINH TĂNG */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Phát Sinh Tăng (Nợ)
                  </span>
                  <TrendingUp className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400">
                  +{formatCurrency(ledgerData.total_increase)}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Hóa đơn bán hàng phát sinh trong kỳ
                </p>
              </div>

              {/* 3. TỔNG PHÁT SINH GIẢM */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Phát Sinh Giảm (Có)
                  </span>
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  -{formatCurrency(ledgerData.total_decrease)}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Thu tiền & giảm trừ do trả hàng
                </p>
              </div>

              {/* 4. SỐ DƯ NỢ CUỐI KỲ */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-800/80 dark:to-indigo-950/40 border border-indigo-200 dark:border-indigo-800 shadow-card">
                <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                  <span className="text-xs font-black uppercase tracking-wider">Số Dư Nợ Cuối Kỳ</span>
                  <Receipt className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-xl font-black text-indigo-700 dark:text-indigo-300">
                  {formatCurrency(ledgerData.closing_balance)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-indigo-600/80 dark:text-indigo-300/80">
                  <span>Hạn mức: {formatCurrency(ledgerData.customer.credit_limit)}</span>
                  <span className="font-bold">
                    {ledgerData.customer.credit_limit > 0
                      ? `${Math.min(100, Math.round((ledgerData.closing_balance / ledgerData.customer.credit_limit) * 100))}%`
                      : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* BẢNG SỔ CHI TIẾT CÔNG NỢ 3 CỘT TIỀN (SCRUM-843, SCRUM-845) */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Bảng Kê Chứng Từ Chi Tiết & Số Dư Luỹ Kế
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Toàn bộ phát sinh tăng giảm được sắp xếp theo thời gian kèm số dư nợ luỹ kế sau mỗi bút toán
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {ledgerData.total_items} chứng từ
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 text-center w-12">STT</th>
                      <th className="py-3 px-3 w-32">Ngày CT</th>
                      <th className="py-3 px-3 w-36">Số hiệu CT</th>
                      <th className="py-3 px-3 w-32">Loại CT</th>
                      <th className="py-3 px-3">Diễn giải giao dịch</th>
                      <th className="py-3 px-3 w-28 text-center">Mã tham chiếu</th>
                      <th className="py-3 px-3 text-right w-36 text-rose-600 dark:text-rose-400">
                        Tăng (Nợ)
                      </th>
                      <th className="py-3 px-3 text-right w-36 text-emerald-600 dark:text-emerald-400">
                        Giảm (Có)
                      </th>
                      <th className="py-3 px-3 text-right w-40 text-indigo-600 dark:text-indigo-400 font-black">
                        Số Dư Luỹ Kế
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {/* Dòng Số dư đầu kỳ */}
                    <tr className="bg-slate-50/80 dark:bg-slate-800/40 font-bold text-xs">
                      <td className="py-2.5 px-3 text-center text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-slate-400">-</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] uppercase font-bold">
                          Đầu kỳ
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-indigo-700 dark:text-indigo-300 italic font-semibold">
                        SỐ DƯ NỢ ĐẦU KỲ
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-slate-200">
                        {formatCurrency(ledgerData.opening_balance)}
                      </td>
                    </tr>

                    {/* Các dòng giao dịch trong kỳ */}
                    {ledgerData.items.map((item, idx) => {
                      const isInvoice = item.document_type === 'INVOICE';
                      const isPayment = item.document_type === 'PAYMENT';
                      const isCreditNote = item.document_type === 'CREDIT_NOTE';

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-3 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {formatDateTime(item.date)}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                            {isInvoice ? (
                              <Link
                                to={`/invoices`}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                              >
                                {item.document_code}
                              </Link>
                            ) : isPayment ? (
                              <Link
                                to={`/payments`}
                                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                              >
                                {item.document_code}
                              </Link>
                            ) : (
                              <Link
                                to={`/credit-notes`}
                                className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                              >
                                {item.document_code}
                              </Link>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              variant={isInvoice ? 'primary' : isPayment ? 'success' : 'warning'}
                              size="sm"
                            >
                              {item.document_type_label}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-slate-700 dark:text-slate-200 font-medium">
                            {item.description || '-'}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-500 font-mono text-xs">
                            {item.reference_code || '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                            {item.increase_amount > 0 ? `+${formatCurrency(item.increase_amount)}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {item.decrease_amount > 0 ? `-${formatCurrency(item.decrease_amount)}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-indigo-700 dark:text-indigo-300">
                            {formatCurrency(item.running_balance)}
                          </td>
                        </tr>
                      );
                    })}

                    {ledgerData.items.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                          Không có phát sinh giao dịch nào trong khoảng thời gian đã chọn.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Dòng Tổng kết Footer */}
                  <tfoot>
                    {/* Hàng Tổng cộng phát sinh */}
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold">
                      <td colSpan={6} className="py-3 px-3 text-right text-slate-700 dark:text-slate-200 uppercase text-xs">
                        Tổng cộng phát sinh trong kỳ:
                      </td>
                      <td className="py-3 px-3 text-right font-black text-rose-600 dark:text-rose-400">
                        +{formatCurrency(ledgerData.total_increase)}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                        -{formatCurrency(ledgerData.total_decrease)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400">-</td>
                    </tr>

                    {/* Hàng Số dư nợ cuối kỳ */}
                    <tr className="border-t border-slate-200 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950/40 font-black text-sm">
                      <td colSpan={6} className="py-3.5 px-3 text-right text-indigo-900 dark:text-indigo-200 uppercase">
                        SỐ DƯ NỢ CUỐI KỲ PHẢI THU:
                      </td>
                      <td colSpan={2}></td>
                      <td className="py-3.5 px-3 text-right text-base text-indigo-700 dark:text-indigo-300">
                        {formatCurrency(ledgerData.closing_balance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Chưa chọn đại lý"
            description="Vui lòng chọn một đại lý từ thanh công cụ bên trên để xem sổ chi tiết công nợ."
          />
        )
      ) : (
        /* ============================================================== */
        /* TAB 2: TỔNG QUAN CÔNG NỢ TOÀN HỆ THỐNG                          */
        /* ============================================================== */
        loadingOverview ? (
          <div className="py-20 flex justify-center">
            <Loading text="Đang tải tổng quan công nợ các đại lý..." />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Banner tổng dư nợ toàn hệ thống */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase font-bold text-indigo-200 tracking-wider">
                  Tổng Dư Nợ Phải Thu Toàn Hệ Thống
                </span>
                <h3 className="text-2xl sm:text-3xl font-black mt-1">
                  {formatCurrency(totalClosingDebt)}
                </h3>
                <p className="text-xs text-indigo-100/80 mt-1">
                  Tổng hợp từ {overviewItems.length} đại lý đối tác có hoạt động
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-bold uppercase text-[11px]">
                      <th className="pb-3 px-3">Mã ĐL</th>
                      <th className="pb-3 px-3">Tên Đại Lý</th>
                      <th className="pb-3 px-3 text-right">Hạn Mức</th>
                      <th className="pb-3 px-3 text-right">Dư Nợ Đầu Kỳ</th>
                      <th className="pb-3 px-3 text-right text-rose-500">Phát Sinh Tăng</th>
                      <th className="pb-3 px-3 text-right text-emerald-500">Phát Sinh Giảm</th>
                      <th className="pb-3 px-3 text-right font-black">Dư Nợ Cuối Kỳ</th>
                      <th className="pb-3 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overviewItems.map((item) => (
                      <tr
                        key={item.customer_id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-3 px-3 font-mono font-bold text-slate-600 dark:text-slate-300">
                          {item.customer_code || item.customer_id}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                          {item.customer_name}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-300">
                          {formatCurrency(item.credit_limit)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-500">
                          {formatCurrency(item.opening_balance)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                          {item.total_increase > 0 ? `+${formatCurrency(item.total_increase)}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.total_decrease > 0 ? `-${formatCurrency(item.total_decrease)}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(item.closing_balance)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(item.customer_id);
                              setSearchParams({ customerId: item.customer_id });
                              setActiveTab('single');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors inline-flex items-center gap-1"
                          >
                            <span>Xem sổ</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {overviewItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400 italic">
                          Không tìm thấy đại lý nào phù hợp với bộ lọc tìm kiếm.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </PageContainer>
  );
};

export default DebtLedgerPage;
