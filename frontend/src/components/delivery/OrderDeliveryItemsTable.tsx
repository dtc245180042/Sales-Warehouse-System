import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Clock,
  HelpCircle,
  Edit2,
  FileSpreadsheet,
} from 'lucide-react';
import { OrderItem } from '../../types/Order';
import { formatCurrency } from '../../utils/formatters';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

interface OrderDeliveryItemsTableProps {
  items: OrderItem[];
  orderTotal?: number;
  hasShortage?: boolean;
  shortageResolution?: string;
  canEdit?: boolean;
  onOpenEditModal?: () => void;
}

export const OrderDeliveryItemsTable: React.FC<OrderDeliveryItemsTableProps> = ({
  items,
  orderTotal,
  hasShortage = false,
  shortageResolution,
  canEdit = false,
  onOpenEditModal,
}) => {
  // Tính toán tổng số lượng đặt, tổng số lượng thực giao và tổng thiếu
  const totalOrdered = items.reduce((sum, it) => sum + it.quantity, 0);
  const totalDelivered = items.reduce(
    (sum, it) => sum + (it.deliveredQuantity !== undefined ? it.deliveredQuantity : it.quantity),
    0
  );
  const totalShortage = totalOrdered - totalDelivered;

  // Lấy danh sách các dòng bị giao thiếu
  const shortageItems = items.filter(
    (it) => it.deliveredQuantity !== undefined && it.deliveredQuantity < it.quantity
  );

  return (
    <div className="space-y-4">
      {/* 1. KHU VỰC THÔNG BÁO GIAO THIẾU NẾU CÓ (SCRUM-696) */}
      {(hasShortage || shortageItems.length > 0) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <span>Phát hiện dòng hàng giao thiếu so với đơn đặt</span>
                  <Badge variant="warning" size="sm">
                    Thiếu {totalShortage} sản phẩm ({shortageItems.length} mặt hàng)
                  </Badge>
                </h4>
                {canEdit && onOpenEditModal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenEditModal}
                    leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                    className="border-amber-300 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  >
                    Chỉnh sửa thực giao
                  </Button>
                )}
              </div>

              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1.5 leading-relaxed">
                Đơn hàng được xuất kho với số lượng thực tế ít hơn số lượng đại lý đặt ban đầu. Vui lòng kiểm tra chi tiết từng dòng bên dưới để đối soát hàng hóa.
              </p>

              {shortageResolution && (
                <div className="mt-3 p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/80 dark:border-amber-800/60 text-xs">
                  <span className="font-bold text-amber-950 dark:text-amber-100">
                    Phương án xử lý từ kho vận & kinh doanh:{' '}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{shortageResolution}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. BẢNG CHI TIẾT DÒNG HÀNG & SỐ LƯỢNG THỰC GIAO */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                Chi Tiết Dòng Hàng & Số Lượng Thực Giao
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                SCRUM-696
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Đối soát giữa số lượng đại lý đặt và số lượng thực tế thủ kho đóng gói & bàn giao
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && onOpenEditModal && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenEditModal}
                leftIcon={<Edit2 className="w-4 h-4" />}
              >
                Cập nhật thực giao
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 min-w-[200px]">Sản phẩm & Quy cách</th>
                <th className="pb-3 text-center">ĐVT</th>
                <th className="pb-3 text-right">Đơn giá</th>
                <th className="pb-3 text-center min-w-[80px]">SL Đặt</th>
                <th className="pb-3 text-center min-w-[120px]">SL Thực Giao</th>
                <th className="pb-3 text-center min-w-[110px]">Tình trạng</th>
                <th className="pb-3 text-right">Thành tiền đặt</th>
                <th className="pb-3 text-right">Thành tiền thực</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it, idx) => {
                const orderedQty = it.quantity;
                const deliveredQty = it.deliveredQuantity !== undefined ? it.deliveredQuantity : orderedQty;
                const isShortage = deliveredQty < orderedQty;
                const diff = orderedQty - deliveredQty;
                const unitPrice = it.price;
                const actualSubtotal = (unitPrice * deliveredQty) - (it.discount || 0);

                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      isShortage
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50/80 dark:hover:bg-amber-950/30'
                        : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Sản phẩm */}
                    <td className="py-3.5 pr-2">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{it.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400 font-mono">SKU: {it.sku}</span>
                      </div>
                      {/* Lý do giao thiếu nếu có */}
                      {isShortage && it.shortageReason && (
                        <div className="mt-1.5 p-2 rounded-lg bg-amber-100/70 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold">Lý do thiếu:</strong> {it.shortageReason}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Đơn vị tính */}
                    <td className="py-3.5 text-center text-slate-500 dark:text-slate-400 font-medium">
                      {it.unit || 'Cái'}
                    </td>

                    {/* Đơn giá */}
                    <td className="py-3.5 text-right font-medium text-slate-700 dark:text-slate-300">
                      {formatCurrency(unitPrice)}
                    </td>

                    {/* Số lượng đặt */}
                    <td className="py-3.5 text-center font-bold text-slate-900 dark:text-slate-100">
                      {orderedQty}
                    </td>

                    {/* Số lượng thực giao */}
                    <td className="py-3.5 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-black text-sm bg-slate-100 dark:bg-slate-800">
                        <span
                          className={
                            isShortage
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {deliveredQty}
                        </span>
                        <span className="text-slate-400 font-normal text-xs">/ {orderedQty}</span>
                      </div>
                    </td>

                    {/* Tình trạng giao */}
                    <td className="py-3.5 text-center">
                      {isShortage ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60">
                            Thiếu {diff} {it.unit || 'cái'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            (Đạt {Math.round((deliveredQty / orderedQty) * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                          <CheckCircle2 className="w-3 h-3" />
                          Đủ 100%
                        </span>
                      )}
                    </td>

                    {/* Thành tiền theo đơn đặt */}
                    <td className="py-3.5 text-right font-medium text-slate-500 line-through">
                      {isShortage ? formatCurrency(it.subtotal) : '-'}
                    </td>

                    {/* Thành tiền thực nhận */}
                    <td className="py-3.5 text-right font-black text-slate-900 dark:text-white">
                      {formatCurrency(actualSubtotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tổng kết đối soát cuối bảng */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <span className="text-slate-400 block mb-1">Tổng SL Hàng Đặt:</span>
            <span className="text-base font-black text-slate-900 dark:text-white">
              {totalOrdered} sản phẩm
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <span className="text-slate-400 block mb-1">Tổng SL Thực Giao:</span>
            <span
              className={`text-base font-black ${
                totalShortage > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {totalDelivered} sản phẩm
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <span className="text-slate-400 block mb-1">Tổng Chênh Lệch Thiếu:</span>
            <span
              className={`text-base font-black ${
                totalShortage > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {totalShortage > 0 ? `-${totalShortage} sản phẩm` : '0 (Đủ hàng)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
