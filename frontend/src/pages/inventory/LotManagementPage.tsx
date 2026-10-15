import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Search,
  Filter,
  Plus,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Warehouse,
  Sparkles,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { lotService } from '../../services/lotService';
import { ProductLot, FEFOSuggestionResponse } from '../../types/ProductLot';
import { useToast } from '../../contexts/ToastContext';

export const LotManagementPage: React.FC = () => {
  const { showToast } = useToast();
  const [lots, setLots] = useState<ProductLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // FEFO Test Modal state
  const [isFefoModalOpen, setIsFefoModalOpen] = useState(false);
  const [fefoQty, setFefoQty] = useState<number>(30);
  const [fefoResult, setFefoResult] = useState<FEFOSuggestionResponse | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Add Lot Modal
  const [isAddLotOpen, setIsAddLotOpen] = useState(false);
  const [newLotNumber, setNewLotNumber] = useState('');
  const [newMfgDate, setNewMfgDate] = useState('2026-01-01');
  const [newExpDate, setNewExpDate] = useState('2027-01-01');
  const [newQty, setNewQty] = useState(100);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await lotService.getLots();
      setLots(data);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải danh sách lô hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredLots = useMemo(() => {
    return lots.filter((lot) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        lot.lot_number.toLowerCase().includes(q) ||
        (lot.product_name && lot.product_name.toLowerCase().includes(q)) ||
        (lot.sku && lot.sku.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'ALL' || lot.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [lots, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = lots.length;
    const active = lots.filter((l) => l.status === 'ACTIVE').length;
    const nearExpiry = lots.filter((l) => l.status === 'NEAR_EXPIRY').length;
    const expired = lots.filter((l) => l.status === 'EXPIRED').length;
    return { total, active, nearExpiry, expired };
  }, [lots]);

  const handleTestFEFO = async () => {
    try {
      setIsSuggesting(true);
      const res = await lotService.getFEFOSuggestions('PRD-001', 1, fefoQty);
      setFefoResult(res);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAddLot = async () => {
    if (!newLotNumber.trim()) {
      showToast('Vui lòng nhập số lô', 'warning');
      return;
    }
    try {
      await lotService.createLot({
        lot_number: newLotNumber,
        product_id: 'PRD-001',
        warehouse_id: 1,
        mfg_date: newMfgDate,
        exp_date: newExpDate,
        initial_quantity: newQty,
        remaining_quantity: newQty,
        status: 'ACTIVE',
      });
      showToast(`Tạo lô ${newLotNumber} thành công!`, 'success');
      setIsAddLotOpen(false);
      setNewLotNumber('');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <PageContainer
      title="Quản Lý Lô Hàng & Hạn Sử Dụng"
      subtitle="Theo dõi số lô, hạn sử dụng, cảnh báo cận date và thuật toán gợi ý xuất hàng FEFO"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={<Sparkles className="w-4 h-4 text-indigo-500" />}
            onClick={() => {
              setIsFefoModalOpen(true);
              handleTestFEFO();
            }}
          >
            Thử nghiệm FEFO
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddLotOpen(true)}
          >
            Thêm lô hàng mới
          </Button>
        </div>
      }
    >
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng số lô hàng</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lô còn hạn sử dụng</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.active}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cảnh báo cận date</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {stats.nearExpiry}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lô quá hạn (Chặn xuất)</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{stats.expired}</p>
          </div>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo số lô, tên sản phẩm, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'ALL', label: 'Tất cả lô' },
            { id: 'ACTIVE', label: 'Còn hạn' },
            { id: 'NEAR_EXPIRY', label: 'Cận date' },
            { id: 'EXPIRED', label: 'Đã hết hạn' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Table of Lots */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
              <tr>
                <th className="py-3.5 px-4">Số lô (Lot Number)</th>
                <th className="py-3.5 px-4">Sản phẩm</th>
                <th className="py-3.5 px-4">Kho hàng</th>
                <th className="py-3.5 px-4">Ngày sản xuất</th>
                <th className="py-3.5 px-4">Hạn sử dụng</th>
                <th className="py-3.5 px-4 text-right">Tồn hiện tại / Ban đầu</th>
                <th className="py-3.5 px-4">Trạng thái HSD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Đang tải danh sách lô hàng...
                  </td>
                </tr>
              ) : filteredLots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Không tìm thấy lô hàng nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredLots.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {item.lot_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {item.product_name || item.product_id}
                      </p>
                      <p className="text-[10px] text-slate-400">SKU: {item.sku || 'SKU-01'}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {item.warehouse_name || `Kho #${item.warehouse_id}`}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">{item.mfg_date}</td>
                    <td className="py-3.5 px-4 font-semibold text-xs text-slate-900 dark:text-white">
                      {item.exp_date}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.remaining_quantity}
                      </span>
                      <span className="text-slate-400 text-xs"> / {item.initial_quantity}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {item.status === 'ACTIVE' && (
                        <Badge variant="success" dot>
                          Còn hạn sử dụng
                        </Badge>
                      )}
                      {item.status === 'NEAR_EXPIRY' && (
                        <Badge variant="warning" dot>
                          Cảnh báo cận date
                        </Badge>
                      )}
                      {item.status === 'EXPIRED' && (
                        <Badge variant="danger" dot>
                          Đã quá hạn (Chặn)
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL THỬ NGHIỆM GỢI Ý XUẤT FEFO (S6-04)                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isFefoModalOpen}
        onClose={() => setIsFefoModalOpen(false)}
        title="Thử nghiệm thuật toán gợi ý lô FEFO"
        subtitle="Hệ thống tự động ưu tiên các lô có HSD gần nhất còn tồn đủ số lượng"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
            <span className="font-medium text-slate-700 dark:text-slate-300">Số lượng cần xuất:</span>
            <input
              type="number"
              min={1}
              value={fefoQty}
              onChange={(e) => setFefoQty(parseInt(e.target.value) || 1)}
              className="w-24 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-right font-bold"
            />
            <Button
              variant="secondary"
              onClick={handleTestFEFO}
              isLoading={isSuggesting}
            >
              Phân bổ lại
            </Button>
          </div>

          {fefoResult && (
            <div className="space-y-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Kết quả phân bổ lô xuất tự động:
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Số lô gợi ý</th>
                      <th className="py-2.5 px-3">Hạn sử dụng</th>
                      <th className="py-2.5 px-3 text-right">Tồn khả dụng</th>
                      <th className="py-2.5 px-3 text-right">Số lượng trích xuất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fefoResult.suggestions.map((sug) => (
                      <tr key={sug.lot_id}>
                        <td className="py-2.5 px-3 font-mono font-semibold text-indigo-600">
                          {sug.lot_number}
                        </td>
                        <td className="py-2.5 px-3">{sug.exp_date}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {sug.available_quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                          {sug.allocated_quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 5. MODAL THÊM LÔ HÀNG MỚI                                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddLotOpen}
        onClose={() => setIsAddLotOpen(false)}
        title="Khai báo lô hàng mới vào kho"
        subtitle="Tạo mới số lô và hạn sử dụng theo từng đợt nhập hàng"
        maxWidth="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsAddLotOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleAddLot}>
              Lưu lô hàng
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Số lô (Lot Number):
            </label>
            <input
              type="text"
              value={newLotNumber}
              onChange={(e) => setNewLotNumber(e.target.value)}
              placeholder="VD: LOT-2026-B1"
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ngày sản xuất:
              </label>
              <input
                type="date"
                value={newMfgDate}
                onChange={(e) => setNewMfgDate(e.target.value)}
                className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hạn sử dụng:
              </label>
              <input
                type="date"
                value={newExpDate}
                onChange={(e) => setNewExpDate(e.target.value)}
                className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Số lượng nhập ban đầu:
            </label>
            <input
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(parseInt(e.target.value) || 1)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
