import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Package,
  PlusCircle,
  XCircle,
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';

interface LowStockWarningWidgetProps {
  maxItems?: number;
}

export const LowStockWarningWidget: React.FC<LowStockWarningWidgetProps> = ({
  maxItems = 5,
}) => {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    productService
      .getAll()
      .then((prods) => {
        if (!isMounted) return;
        // Filter products whose current stock is at or below minStock
        const underThreshold = prods
          .filter((p) => p.stock <= p.minStock)
          .sort((a, b) => a.stock - b.stock); // Out of stock (0) first
        setItems(underThreshold);
      })
      .catch((err) => {
        console.warn('[LowStockWarningWidget] Error loading products:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const totalUnderThreshold = items.length;
  const outOfStockCount = items.filter((p) => p.stock === 0).length;
  const displayedItems = items.slice(0, maxItems);

  if (loading) {
    return (
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft animate-pulse">
        <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg mb-4" />
        <div className="space-y-3">
          <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
          <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-2xl ${
            totalUnderThreshold > 0
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
          }`}>
            {totalUnderThreshold > 0 ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Cảnh Báo Tồn Kho Dưới Ngưỡng
              </h3>
              {totalUnderThreshold > 0 && (
                <Badge variant={outOfStockCount > 0 ? 'danger' : 'warning'} size="sm" dot>
                  {totalUnderThreshold} SKU cần nhập
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi các mặt hàng chạm hoặc vượt dưới định mức tồn an toàn (SCRUM-604)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/inventory?status=under_threshold">
            <Button
              variant="outline"
              size="sm"
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              className="!text-xs !py-1.5"
            >
              Xem sổ tồn kho
            </Button>
          </Link>
          <Link to="/inventory/stock-in">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
              className="!text-xs !py-1.5"
            >
              Nhập hàng
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      {totalUnderThreshold === 0 ? (
        <div className="py-8 text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Tồn kho ổn định
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Hiện không có SKU nào chạm hoặc dưới ngưỡng tối thiểu. Toàn bộ kho đang trong định mức an toàn.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
          {displayedItems.map((prod) => {
            const isOut = prod.stock === 0;
            return (
              <div
                key={prod.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 rounded-xl px-2 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {prod.image ? (
                    <img
                      src={prod.image}
                      alt={prod.name}
                      className="w-10 h-10 rounded-xl object-cover bg-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 truncate">
                    <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                      {prod.name}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">
                        {prod.sku}
                      </span>
                      <span>•</span>
                      <span>{prod.category}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      {isOut ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span
                        className={`font-black text-xs sm:text-sm ${
                          isOut
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        Còn {prod.stock} {prod.unit}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Ngưỡng tối thiểu: <span className="font-semibold">{prod.minStock}</span>
                    </div>
                  </div>

                  <Link to="/inventory/stock-in">
                    <Button variant="ghost" size="sm" className="!text-xs !py-1 !px-2.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40">
                      Tạo phiếu nhập
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}

          {totalUnderThreshold > maxItems && (
            <div className="pt-3 text-center">
              <Link
                to="/inventory?status=under_threshold"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                Xem thêm {totalUnderThreshold - maxItems} sản phẩm khác dưới ngưỡng
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
