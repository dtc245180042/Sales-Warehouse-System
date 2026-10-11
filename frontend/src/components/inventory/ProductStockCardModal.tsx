import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { stockLedgerService } from '../../services/stockLedgerService';
import { ProductStockCardResponse } from '../../types/StockLedger';
import { History, Package, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

interface ProductStockCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
}

export const ProductStockCardModal: React.FC<ProductStockCardModalProps> = ({
  isOpen,
  onClose,
  productId,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProductStockCardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !productId) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    stockLedgerService
      .getProductStockCard(productId)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        console.error('Lỗi tải thẻ kho:', err);
        setError(err.response?.data?.detail || 'Không thể tải thông tin thẻ kho.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, productId]);

  const renderMovementBadge = (type: string) => {
    switch (type) {
      case 'IN_PURCHASE':
        return <Badge variant="success" size="sm">Nhập hàng NCC</Badge>;
      case 'OUT_SALE':
        return <Badge variant="danger" size="sm">Xuất bán đơn hàng</Badge>;
      case 'IN_PURCHASE_REVERSAL':
        return <Badge variant="warning" size="sm">Hoàn kho điều chỉnh</Badge>;
      case 'TRANSFER_IN':
        return <Badge variant="info" size="sm">Nhập chuyển kho</Badge>;
      case 'TRANSFER_OUT':
        return <Badge variant="info" size="sm">Xuất chuyển kho</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={data ? `Thẻ Kho: ${data.sku} - ${data.product_name}` : 'Thẻ Kho Sản Phẩm'}
      subtitle="Báo cáo số dư 3 cột và lịch sử biến động thẻ kho tập trung (S5-05)"
      maxWidth="4xl"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <p className="text-sm">Đang tải dữ liệu thẻ kho...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm border border-rose-200">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* 3 Cột số dư theo từng kho */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-600" /> Số Dư 3 Cột Theo Từng Kho
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {data.balances.map((b) => (
                <div
                  key={b.warehouse_id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      {b.warehouse_name}
                    </span>
                    {b.is_low_stock && (
                      <Badge variant="warning" size="sm">Tồn thấp</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Thực tế</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                        {formatNumber(b.physical_stock)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-500 block">Giữ chỗ</span>
                      <span className="font-extrabold text-amber-600 text-sm">
                        {formatNumber(b.reserved_stock)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-500 block">Khả dụng</span>
                      <span className="font-extrabold text-emerald-600 text-sm">
                        {formatNumber(b.available_stock)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bảng lịch sử biến động thẻ kho */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4 text-indigo-600" /> Sổ Cái Biến Động Thẻ Kho ({data.entries.total} giao dịch)
            </h4>
            {data.entries.items.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 text-center">Chưa có giao dịch biến động nào được ghi nhận cho mặt hàng này.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Thời gian</th>
                      <th className="py-2.5 px-3">Chứng từ</th>
                      <th className="py-2.5 px-3">Loại biến động</th>
                      <th className="py-2.5 px-3">Kho</th>
                      <th className="py-2.5 px-3 text-right">Số lượng</th>
                      <th className="py-2.5 px-3 text-center">Tồn trước &rarr; sau</th>
                      <th className="py-2.5 px-3">Người thực hiện</th>
                      <th className="py-2.5 px-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.entries.items.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 whitespace-nowrap text-slate-400">
                          {e.created_at ? new Date(e.created_at).toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="py-2 px-3 font-semibold text-indigo-600 whitespace-nowrap">
                          {e.reference_code}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {renderMovementBadge(e.movement_type)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                          {e.warehouse_name}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {e.movement_type.startsWith('OUT_') ? (
                            <span className="text-rose-600 flex items-center justify-end gap-0.5">
                              <ArrowUpRight className="w-3.5 h-3.5" /> -{e.quantity_base}
                            </span>
                          ) : (
                            <span className="text-emerald-600 flex items-center justify-end gap-0.5">
                              <ArrowDownLeft className="w-3.5 h-3.5" /> +{e.quantity_base}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <span className="text-slate-400">{e.previous_physical}</span>
                          <span className="mx-1">&rarr;</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{e.new_physical}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {e.performer_name || 'Hệ thống'}
                        </td>
                        <td className="py-2 px-3 text-slate-500 max-w-xs truncate" title={e.note}>
                          {e.note || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
