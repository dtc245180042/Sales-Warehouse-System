import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Plus,
  Search,
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Building2,
  Calendar,
  XCircle,
  Eye,
  RefreshCw,
  Download,
  Boxes,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { stockTransferService } from '../../services/stockTransferService';
import { StockTransfer, InTransitSummaryItem } from '../../types/StockTransfer';
import { formatNumber, formatDate } from '../../utils/formatters';
import { exportStyledExcel, ExcelColumnConfig, ExcelCellValue, ExcelCellObject } from '../../utils/excelExporter';
import { useToast } from '../../contexts/ToastContext';

const WAREHOUSE_OPTIONS = [
  'Tất cả kho',
  'Kho Tổng Hà Nội',
  'Kho Tổng TP. HCM',
  'Kho Đà Nẵng',
  'Kho Cần Thơ',
];

export const StockTransferList: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [inTransitItems, setInTransitItems] = useState<InTransitSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceWarehouse, setSourceWarehouse] = useState('Tất cả kho');
  const [destWarehouse, setDestWarehouse] = useState('Tất cả kho');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'transfers' | 'in_transit'>('transfers');

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const data = await stockTransferService.getTransfers({
        source_warehouse: sourceWarehouse === 'Tất cả kho' ? undefined : sourceWarehouse,
        destination_warehouse: destWarehouse === 'Tất cả kho' ? undefined : destWarehouse,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() ? search.trim() : undefined,
      });
      setTransfers(data);

      const inTransitData = await stockTransferService.getInTransitSummary(
        sourceWarehouse === 'Tất cả kho' ? undefined : sourceWarehouse
      );
      setInTransitItems(inTransitData);
    } catch (err: any) {
      showToast('Lỗi tải danh sách phiếu chuyển kho: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTransfers();
    }, 200);
    return () => clearTimeout(timer);
  }, [sourceWarehouse, destWarehouse, statusFilter, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransfers();
  };

  // Tính toán số liệu thống kê
  const stats = useMemo(() => {
    const total = transfers.length;
    const inTransit = transfers.filter((t) => t.status === 'in_transit').length;
    const completed = transfers.filter((t) => t.status === 'completed').length;
    const discrepancy = transfers.filter((t) => t.has_discrepancy).length;
    const draft = transfers.filter((t) => t.status === 'draft').length;
    return { total, inTransit, completed, discrepancy, draft };
  }, [transfers]);

  const getStatusBadge = (status: string, hasDiscrepancy?: boolean) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Bản nháp
          </span>
        );
      case 'in_transit':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 animate-pulse">
            <Truck className="w-3.5 h-3.5 text-amber-500" />
            Đang vận chuyển
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Đã nhập kho
            {hasDiscrepancy && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 rounded">
                Lệch
              </span>
            )}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Đã hủy
          </span>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const exportExcel = () => {
    const columns: ExcelColumnConfig[] = [
      { header: 'STT', align: 'center', width: '60px', nowrap: true },
      { header: 'Mã phiếu', align: 'center', width: '150px', nowrap: true },
      { header: 'Kho xuất (Nguồn)', align: 'left', width: '190px' },
      { header: 'Kho nhập (Đích)', align: 'left', width: '190px' },
      { header: 'Trạng thái', align: 'center', width: '160px', nowrap: true },
      { header: 'SL gửi', align: 'right', width: '90px' },
      { header: 'Thực nhận', align: 'right', width: '90px' },
      { header: 'Chênh lệch', align: 'center', width: '100px' },
      { header: 'Lý do giải trình chênh lệch', align: 'left', width: '300px' },
      { header: 'Người lập phiếu', align: 'left', width: '170px' },
      { header: 'Thời gian lập', align: 'center', width: '180px', nowrap: true },
      { header: 'Ghi chú', align: 'left', width: '260px' },
    ];

    let totalTransferQty = 0;
    let totalReceivedQty = 0;
    let totalDiffQty = 0;

    const rows: ExcelCellValue[][] = transfers.map((t, index) => {
      totalTransferQty += t.total_items || 0;
      totalReceivedQty += t.total_received_items || 0;

      const diff = (t.total_received_items || 0) - (t.total_items || 0);
      if (t.status === 'completed' && t.has_discrepancy) {
        totalDiffQty += diff;
      }

      // Format trạng thái tiếng Việt kèm màu nền chuẩn
      let statusObj: ExcelCellObject = { value: t.status, color: '#334155', bgColor: '#f1f5f9', bold: true, nowrap: true };
      switch (t.status) {
        case 'completed':
          statusObj = {
            value: t.has_discrepancy ? 'Đã nhập (Có lệch)' : 'Đã nhập kho đủ',
            color: '#166534',
            bgColor: '#dcfce7',
            bold: true,
            nowrap: true,
          };
          break;
        case 'in_transit':
          statusObj = { value: 'Đang vận chuyển', color: '#9a3412', bgColor: '#ffedd5', bold: true, nowrap: true };
          break;
        case 'draft':
          statusObj = { value: 'Bản nháp', color: '#475569', bgColor: '#f1f5f9', bold: false, nowrap: true };
          break;
        case 'cancelled':
          statusObj = { value: 'Đã hủy', color: '#991b1b', bgColor: '#fee2e2', bold: true, nowrap: true };
          break;
      }

      // Format chênh lệch nổi bật
      let diffCell: ExcelCellValue = { value: '-', align: 'center' };
      if (t.status === 'completed') {
        if (t.has_discrepancy) {
          diffCell = {
            value: `${diff > 0 ? '+' : ''}${diff}`,
            color: '#dc2626',
            bgColor: '#fee2e2',
            bold: true,
            align: 'center',
          };
        } else {
          diffCell = { value: '0 (Đủ)', color: '#16a34a', bold: false, align: 'center' };
        }
      }

      return [
        { value: index + 1, align: 'center', nowrap: true },
        { value: t.code, bold: true, align: 'center', nowrap: true },
        { value: t.source_warehouse, align: 'left' },
        { value: t.destination_warehouse, align: 'left' },
        statusObj,
        { value: t.total_items, align: 'right', bold: true, format: 'number' },
        {
          value: t.status === 'completed' ? t.total_received_items : '-',
          align: 'right',
          format: t.status === 'completed' ? 'number' : 'text',
        },
        diffCell,
        { value: t.discrepancy_reason || '-', align: 'left' },
        { value: t.created_by || 'Thủ kho', align: 'left' },
        { value: formatDate(t.created_at), align: 'center', nowrap: true, format: 'text' },
        { value: t.note || '-', align: 'left' },
      ];
    });

    const summaryRow: ExcelCellValue[] = [
      {
        value: `TỔNG CỘNG (${transfers.length} phiếu)`,
        colSpan: 5,
        bold: true,
        align: 'center',
        bgColor: '#e2e8f0',
      },
      { value: totalTransferQty, align: 'right', bold: true, format: 'number' },
      { value: totalReceivedQty, align: 'right', bold: true, format: 'number' },
      {
        value: `${totalDiffQty > 0 ? '+' : ''}${totalDiffQty}`,
        align: 'center',
        bold: true,
        color: totalDiffQty < 0 ? '#dc2626' : totalDiffQty > 0 ? '#16a34a' : '#0f172a',
      },
      '-',
      '-',
      '-',
      '-',
    ];

    exportStyledExcel({
      filename: `Phieu_Chuyen_Kho_${new Date().toISOString().slice(0, 10)}.xls`,
      title: 'BÁO CÁO DANH SÁCH PHIẾU CHUYỂN KHO NỘI BỘ',
      subtitle: `Kho xuất: ${sourceWarehouse} | Kho nhập: ${destWarehouse} | Trạng thái: ${statusFilter}`,
      columns,
      rows,
      summaryRow,
    });
  };

  return (
    <PageContainer
      title="Chuyển Kho Nội Bộ"
      subtitle="Quản lý phiếu điều chuyển hàng hóa giữa các kho chi nhánh, theo dõi hàng đang trên đường và xử lý chênh lệch kiểm nhận"
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            className="hidden sm:flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 transition-all font-medium"
          >
            <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Xuất Excel (.xls)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTransfers}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/inventory/transfers/create')}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Lập phiếu chuyển kho
          </Button>
        </div>
      }
    >
      {/* 4 Cards thống kê số liệu tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng phiếu điều chuyển</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Toàn bộ lịch sử điều chuyển</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-amber-900/40 rounded-xl p-4 shadow-sm relative overflow-hidden bg-gradient-to-br from-white to-amber-50/20 dark:from-slate-900 dark:to-amber-950/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Đang trên đường vận chuyển</p>
              <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.inTransit}</h3>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">Hàng đã xuất, chờ kho nhận</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Đã nhập kho hoàn tất</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.completed}</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Kho đến đã chốt nhận</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Phiếu có chênh lệch</p>
              <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats.discrepancy}</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Có lý do giải trình hao hụt</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs chuyển đổi giữa danh sách phiếu & danh sách hàng in-transit */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-6">
        <button
          onClick={() => setActiveTab('transfers')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'transfers'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Danh sách phiếu chuyển kho ({transfers.length})
        </button>
        <button
          onClick={() => setActiveTab('in_transit')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'in_transit'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          Hàng đang trên đường ({inTransitItems.length} mặt hàng)
          {inTransitItems.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
          )}
        </button>
      </div>

      {activeTab === 'transfers' ? (
        <>
          {/* Bộ lọc và tìm kiếm tự động theo thời gian thực (Real-time auto-filter) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-sm mb-6">
            <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-3 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm mã phiếu, người lập, ghi chú..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-0.5 rounded-full"
                    title="Xóa tìm kiếm"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="md:col-span-3">
                <select
                  value={sourceWarehouse}
                  onChange={(e) => setSourceWarehouse(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                >
                  <option value="Tất cả kho">Kho xuất: Tất cả</option>
                  {WAREHOUSE_OPTIONS.slice(1).map((wh) => (
                    <option key={`src-${wh}`} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <select
                  value={destWarehouse}
                  onChange={(e) => setDestWarehouse(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                >
                  <option value="Tất cả kho">Kho nhập: Tất cả</option>
                  {WAREHOUSE_OPTIONS.slice(1).map((wh) => (
                    <option key={`dest-${wh}`} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                >
                  <option value="all">Trạng thái: Tất cả</option>
                  <option value="in_transit">Đang vận chuyển</option>
                  <option value="completed">Đã nhận đủ / Hoàn tất</option>
                  <option value="draft">Bản nháp</option>
                  <option value="cancelled">Đã hủy</option>
                </select>

                {(sourceWarehouse !== 'Tất cả kho' || destWarehouse !== 'Tất cả kho' || statusFilter !== 'all' || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSourceWarehouse('Tất cả kho');
                      setDestWarehouse('Tất cả kho');
                      setStatusFilter('all');
                      setSearch('');
                    }}
                    className="shrink-0 px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                    title="Đặt lại bộ lọc về mặc định"
                  >
                    Đặt lại
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Bảng danh sách phiếu chuyển kho */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Mã phiếu</th>
                    <th className="py-3 px-4">Lộ trình điều chuyển</th>
                    <th className="py-3 px-4 text-center">Số lượng</th>
                    <th className="py-3 px-4 text-center">Thực nhận</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-4">Người tạo & Ngày lập</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                          <span>Đang tải danh sách phiếu chuyển kho...</span>
                        </div>
                      </td>
                    </tr>
                  ) : transfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Boxes className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                          <p className="font-medium text-slate-600 dark:text-slate-300">
                            Không tìm thấy phiếu chuyển kho nào
                          </p>
                          <p className="text-xs text-slate-400">
                            Hãy thử thay đổi điều kiện lọc hoặc tạo phiếu chuyển kho mới
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transfers.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        onClick={() => navigate(`/inventory/transfers/${item.code || item.id}`)}
                      >
                        <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400">
                          <div className="flex items-center gap-1.5">
                            <span>{item.code}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {item.source_warehouse}
                            </span>
                            <span className="text-slate-400">➔</span>
                            <span className="font-medium text-indigo-600 dark:text-indigo-400">
                              {item.destination_warehouse}
                            </span>
                          </div>
                          {item.note && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-xs mt-0.5">
                              {item.note}
                            </p>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center font-semibold text-slate-800 dark:text-slate-200">
                          {formatNumber(item.total_items)}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {item.status === 'completed' ? (
                            <span
                              className={`font-semibold ${
                                item.has_discrepancy
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {formatNumber(item.total_received_items)}
                              {item.has_discrepancy && (
                                <span className="text-xs ml-1 font-normal text-rose-500">
                                  ({item.total_received_items - item.total_items > 0 ? '+' : ''}
                                  {item.total_received_items - item.total_items})
                                </span>
                              )}
                            </span>
                          ) : item.status === 'in_transit' ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400 italic">Đang chuyển...</span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {getStatusBadge(item.status, item.has_discrepancy)}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {item.created_by || 'Thủ kho'}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {formatDate(item.created_at)}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/inventory/transfers/${item.id}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Tab thống kê hàng đang trên đường (In-Transit) */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-500" />
                Mặt hàng đang vận chuyển giữa các kho
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Các mặt hàng đã rời kho xuất nhưng chưa được cộng vào kho nhập cho tới khi kho đến kiểm đếm và nhận đủ
              </p>
            </div>
          </div>

          {inTransitItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
              <p className="font-medium text-slate-700 dark:text-slate-300">
                Hiện không có hàng hóa nào đang trên đường vận chuyển
              </p>
              <p className="text-xs text-slate-400">Tất cả các phiếu xuất kho đã được kiểm nhận hoàn tất.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Mã phiếu</th>
                    <th className="py-3 px-4">Sản phẩm</th>
                    <th className="py-3 px-4">Mã SKU</th>
                    <th className="py-3 px-4">Lộ trình (Kho đi ➔ Kho đến)</th>
                    <th className="py-3 px-4 text-center">Số lượng đang chuyển</th>
                    <th className="py-3 px-4">Thời gian xuất kho</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inTransitItems.map((item, idx) => (
                    <tr key={`${item.transfer_id}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400">
                        {item.transfer_code}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {item.product_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{item.sku || '-'}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {item.source_warehouse}
                        </span>{' '}
                        ➔{' '}
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {item.destination_warehouse}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {item.in_transit_quantity} {item.unit}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {item.shipped_at ? formatDate(item.shipped_at) : 'Vừa xuất'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/inventory/transfers/${item.transfer_id}`}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Xác nhận nhận hàng
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
};
