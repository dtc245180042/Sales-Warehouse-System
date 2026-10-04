import React, { useState, useEffect } from 'react';
import {
  Layers,
  X,
  Lock,
  Copy,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  ShieldCheck,
  Edit,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../common/Button';
import {
  PriceList,
  PriceListVersionHistoryItem,
  priceListService,
  CUSTOMER_GROUPS,
} from '../../services/priceListService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface PriceListDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  priceList: PriceList | null;
  onEdit: (pl: PriceList) => void;
  onClone: (pl: PriceList) => void;
  onApprove: (pl: PriceList) => void;
  onSimulateOrder: (id: number) => void;
}

export const PriceListDetailModal: React.FC<PriceListDetailModalProps> = ({
  isOpen,
  onClose,
  priceList,
  onEdit,
  onClone,
  onApprove,
  onSimulateOrder,
}) => {
  const { role } = useAuth();
  const { showToast } = useToast();

  const [versions, setVersions] = useState<PriceListVersionHistoryItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const canApprove = ['Admin', 'SalesManager', 'Director'].includes(role);

  useEffect(() => {
    if (priceList && isOpen) {
      loadVersions(priceList.id);
    }
  }, [priceList, isOpen]);

  const loadVersions = async (id: number) => {
    setLoadingVersions(true);
    try {
      const data = await priceListService.getVersions(id);
      setVersions(data || []);
    } catch (err) {
      console.error('Failed to load version history:', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  if (!isOpen || !priceList) return null;

  const grp = CUSTOMER_GROUPS.find((g) => g.value === priceList.customer_group);
  const isLocked = priceList.has_orders || priceList.is_locked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {priceList.name}
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  {priceList.code} (v{priceList.version})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Áp dụng cho: <strong>{grp?.label || priceList.customer_group}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {/* Lock Alert Banner */}
          {isLocked ? (
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                <div className="text-purple-900 dark:text-purple-200">
                  <h4 className="font-bold text-sm mb-0.5">BẢNG GIÁ ĐÃ BỊ KHÓA SỬA ĐỔI</h4>
                  <p>
                    Bảng giá này đã phát sinh <strong>{priceList.orders_count} đơn hàng</strong> trong hệ thống.
                    Mọi thao tác sửa đổi hoặc xóa trực tiếp đã bị khóa vĩnh viễn để bảo toàn tính toàn vẹn dữ liệu kế toán.
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onClone(priceList);
                }}
                className="shrink-0 gap-1.5 text-xs shadow-md bg-purple-600 hover:bg-purple-700"
              >
                <Copy className="w-3.5 h-3.5" /> Tạo phiên bản mới (v{priceList.version + 1})
              </Button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Chưa phát sinh đơn hàng nào (Có thể tự do chỉnh sửa hoặc xóa).</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSimulateOrder(priceList.id)}
                className="text-[11px] py-1 text-slate-500 gap-1"
              >
                Mô phỏng phát sinh đơn hàng (Test khóa)
              </Button>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Hiệu lực từ</span>
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                {formatDate(priceList.valid_from)}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Hiệu lực đến</span>
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                {priceList.valid_to ? formatDate(priceList.valid_to) : 'Vô thời hạn'}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Trạng thái</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {priceList.status}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Người phê duyệt</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                {priceList.approved_by_name || 'Chưa duyệt'}
              </span>
            </div>
          </div>

          {/* Version Lineage Tree */}
          {versions.length > 1 && (
            <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
              <div className="flex items-center gap-2 mb-2.5 font-bold text-slate-800 dark:text-slate-200">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                <span>Lịch sử các phiên bản trong chuỗi kế thừa:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {versions.map((v, idx) => {
                  const isCurrent = v.id === priceList.id;
                  return (
                    <React.Fragment key={v.id}>
                      <div
                        className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span>{v.code}</span>
                        <span className="text-[10px] opacity-80">(v{v.version})</span>
                        {v.has_orders && <Lock className="w-3 h-3 text-purple-300 ml-0.5" />}
                      </div>
                      {idx < versions.length - 1 && (
                        <span className="text-slate-400 font-bold">→</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Approval Note if present */}
          {priceList.approval_note && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-700 dark:text-slate-300">Ghi chú phê duyệt: </span>
              <span className="text-slate-600 dark:text-slate-400">{priceList.approval_note}</span>
            </div>
          )}

          {/* Line Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Danh sách mặt hàng & Giá bán ({priceList.items?.length || 0} sản phẩm)
              </h4>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-3">Sản phẩm</th>
                    <th className="py-2.5 px-3">ĐVT</th>
                    <th className="py-2.5 px-3 text-right">Giá niêm yết</th>
                    <th className="py-2.5 px-3 text-right">Giá sàn</th>
                    <th className="py-2.5 px-3 text-right">Giá bán đại lý</th>
                    <th className="py-2.5 px-3 text-center">Chiết khấu</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái sàn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {priceList.items?.map((it) => {
                    const isBelow = it.sale_price < it.floor_price;
                    return (
                      <tr
                        key={it.id || it.product_id}
                        className={isBelow ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}
                      >
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {it.product_name}
                          </span>
                          <span className="block text-[11px] text-slate-400 tabular-nums">
                            {it.product_sku}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{it.unit}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-500 font-medium">
                          {formatCurrency(it.listed_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-rose-600">
                          {formatCurrency(it.floor_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(it.sale_price)}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums font-semibold">
                          {it.discount_percent}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isBelow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              Dưới sàn
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Hợp lệ
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {priceList.status === 'PENDING_APPROVAL' && canApprove && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onApprove(priceList);
                }}
                className="bg-amber-500 hover:bg-amber-600 border-none text-xs gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" /> Xét duyệt bảng giá này
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onClone(priceList);
              }}
              className="text-xs gap-1.5 text-indigo-600 hover:bg-indigo-50 border-indigo-200"
            >
              <Copy className="w-3.5 h-3.5" /> Tạo phiên bản mới
            </Button>
            {!isLocked && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(priceList);
                }}
                className="text-xs gap-1.5"
              >
                <Edit className="w-3.5 h-3.5" /> Chỉnh sửa
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};
