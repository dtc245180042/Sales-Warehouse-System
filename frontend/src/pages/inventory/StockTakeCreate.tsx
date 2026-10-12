import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ClipboardCheck,
  ArrowLeft,
  Warehouse,
  Layers,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Boxes,
  HelpCircle,
  Eye,
  Sparkles,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useToast } from '../../contexts/ToastContext';
import { stockTakeService } from '../../services/stockTakeService';
import { categoryService } from '../../services/categoryService';
import { useAuth } from '../../contexts/AuthContext';
import { StockTakeScope, StockTakePreviewItem } from '../../types/StockTake';
import { Category } from '../../types/Category';
import { formatNumber } from '../../utils/formatters';

export const StockTakeCreate: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const userWarehouse = (user as any)?.assigned_warehouse || (user as any)?.location || 'Kho Tổng Hà Nội';
  const [warehouses, setWarehouses] = useState<string[]>([userWarehouse]);
  const [warehouse, setWarehouse] = useState<string>(userWarehouse);
  const [scopeType, setScopeType] = useState<StockTakeScope>('WAREHOUSE');
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [note, setNote] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [previewItems, setPreviewItems] = useState<StockTakePreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchPreview, setSearchPreview] = useState<string>('');

  // Tải danh sách kho thực tế từ hệ thống
  useEffect(() => {
    stockTakeService
      .getStockTakes()
      .then((takes) => {
        const distinct = Array.from(new Set(takes.map((t) => t.warehouse).filter(Boolean)));
        if (!distinct.includes(userWarehouse)) {
          distinct.unshift(userWarehouse);
        }
        if (distinct.length > 0) {
          setWarehouses(distinct);
          if (!distinct.includes(warehouse)) {
            setWarehouse(distinct[0]);
          }
        }
      })
      .catch(() => {});
  }, [userWarehouse]);

  // Tải danh sách nhóm hàng
  useEffect(() => {
    categoryService
      .getList()
      .then((cats: Category[]) => {
        setCategories(cats);
        if (cats.length > 0 && !categoryId) {
          setCategoryId(cats[0].id);
        }
      })
      .catch(() => {
        // Fallback default categories
      });
  }, []);

  // Tải preview danh sách sản phẩm snapshot
  useEffect(() => {
    let isCancelled = false;
    const loadPreview = async () => {
      setPreviewLoading(true);
      try {
        const data = await stockTakeService.getProductsPreview({
          warehouse,
          scope_type: scopeType,
          category_id: scopeType === 'CATEGORY' ? categoryId : undefined,
        });
        if (!isCancelled) {
          setPreviewItems(data);
        }
      } catch (err: any) {
        if (!isCancelled) {
          showToast(err.message || 'Không thể tải danh sách xem trước', 'error');
        }
      } finally {
        if (!isCancelled) {
          setPreviewLoading(false);
        }
      }
    };

    loadPreview();
    return () => {
      isCancelled = true;
    };
  }, [warehouse, scopeType, categoryId]);

  const filteredPreview = previewItems.filter(
    (it) =>
      !searchPreview ||
      it.name.toLowerCase().includes(searchPreview.toLowerCase()) ||
      (it.sku && it.sku.toLowerCase().includes(searchPreview.toLowerCase()))
  );

  const totalSnapshotQty = previewItems.reduce(
    (acc, it) => acc + (it.system_quantity || 0),
    0
  );

  const handleCreate = async () => {
    if (previewItems.length === 0) {
      showToast('Phạm vi đã chọn không có sản phẩm nào để kiểm kê.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const created = await stockTakeService.createStockTake({
        warehouse,
        scope_type: scopeType,
        category_id: scopeType === 'CATEGORY' ? categoryId : undefined,
        note: note.trim() || undefined,
      });

      showToast(`Đã lập phiếu kiểm kê ${created.code} thành công và snapshot tồn sổ!`, 'success');
      navigate(`/inventory/stock-takes/${created.code || created.id}`);
    } catch (err: any) {
      showToast(err.message || 'Không thể khởi tạo phiếu kiểm kê.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Lập Phiếu Kiểm Kê Kho"
      subtitle="Khởi tạo đợt kiểm kê, chốt snapshot tồn sổ theo kho hoặc theo nhóm hàng"
    >
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link
            to="/inventory/stock-takes"
            className="hover:text-teal-600 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Kiểm kê kho
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">
            Lập phiếu kiểm kê mới
          </span>
        </div>

        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <ClipboardCheck className="w-7 h-7 text-teal-600" />
              Lập Phiếu Kiểm Kê Kho Hàng
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Khởi tạo đợt kiểm kê, hệ thống sẽ snapshot (đóng băng) số tồn sổ tại thời điểm này.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/inventory/stock-takes')}
              disabled={submitting}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={submitting || previewLoading || previewItems.length === 0}
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {submitting ? 'Đang tạo...' : 'Khởi Tạo Phiếu Kiểm Kê'}
            </Button>
          </div>
        </div>

        {/* Form Config Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Warehouse className="w-4 h-4 text-teal-600" />
                Cấu Hình Đợt Kiểm Kê
              </h2>

              {/* Chọn kho hàng */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Kho hàng kiểm kê <span className="text-rose-500">*</span>
                </label>
                <select
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-slate-900 dark:text-white"
                >
                  {warehouses.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phạm vi kiểm kê */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Phạm vi kiểm kê <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScopeType('WAREHOUSE')}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-medium text-left flex flex-col gap-1 transition-all ${
                      scopeType === 'WAREHOUSE'
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="font-semibold flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5" />
                      Toàn Kho
                    </span>
                    <span className="text-[11px] opacity-75">
                      Kiểm đếm toàn bộ sản phẩm
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScopeType('CATEGORY')}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-medium text-left flex flex-col gap-1 transition-all ${
                      scopeType === 'CATEGORY'
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="font-semibold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Theo Nhóm
                    </span>
                    <span className="text-[11px] opacity-75">
                      Theo ngành / nhóm hàng
                    </span>
                  </button>
                </div>
              </div>

              {/* Dropdown nhóm hàng khi chọn CATEGORY */}
              {scopeType === 'CATEGORY' && (
                <div className="space-y-1.5 animate-fadeIn">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Chọn nhóm ngành hàng <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={categoryId || ''}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-slate-900 dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Ghi chú */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ghi chú đợt kiểm kê
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Kiểm kê định kỳ tháng 10/2026, kiểm kê bàn giao ca..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              {/* Information Alert */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg flex items-start gap-2 text-amber-800 dark:text-amber-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Cơ chế Snapshot:</strong> Số lượng tồn sổ sẽ được đóng băng cố định làm căn cứ so sánh, không bị ảnh hưởng nếu phát sinh nhập/xuất kho sau thời điểm lập phiếu.
                </span>
              </div>
            </div>
          </div>

          {/* Preview Table Card (Right 2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Eye className="w-4 h-4 text-teal-600" />
                    Xem Trước Danh Sách Snapshot Tồn Sổ
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {previewItems.length} sản phẩm sẽ được nạp vào đợt kiểm kê • Tổng tồn sổ:{' '}
                    <strong>{formatNumber(totalSnapshotQty)} cái</strong>
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchPreview}
                    onChange={(e) => setSearchPreview(e.target.value)}
                    placeholder="Lọc sản phẩm..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <div className="max-h-[460px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">STT</th>
                        <th className="py-2.5 px-3 font-semibold">Mã SKU</th>
                        <th className="py-2.5 px-3 font-semibold">Tên Sản Phẩm</th>
                        <th className="py-2.5 px-3 font-semibold">Nhóm Ngành</th>
                        <th className="py-2.5 px-3 font-semibold text-center">ĐVT</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Tồn Sổ (Snapshot)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewLoading ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            Đang tải dữ liệu sản phẩm...
                          </td>
                        </tr>
                      ) : filteredPreview.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            Không tìm thấy sản phẩm nào trong phạm vi này.
                          </td>
                        </tr>
                      ) : (
                        filteredPreview.map((item, idx) => (
                          <tr
                            key={item.product_id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-teal-600 dark:text-teal-400">
                              {item.sku || 'N/A'}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                              {item.name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {item.category}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-500">
                              {item.unit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                              {formatNumber(item.system_quantity)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom action trigger */}
              <div className="pt-2 flex justify-end">
                <Button
                  variant="primary"
                  onClick={handleCreate}
                  disabled={submitting || previewLoading || previewItems.length === 0}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {submitting ? 'Đang tạo...' : 'Xác Nhận Lập Phiếu & Snapshot'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
