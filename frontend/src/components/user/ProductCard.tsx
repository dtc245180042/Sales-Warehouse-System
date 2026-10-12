import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Check, AlertTriangle, XCircle } from 'lucide-react';
import { ProductItem } from '../../data/mockData';
import { useUserCart } from '../../contexts/UserCartContext';
import { useToast } from '../../contexts/ToastContext';

interface ProductCardProps {
  product: ProductItem;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart } = useUserCart();
  const { showToast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (product.stock <= 0) {
      showToast('Sản phẩm đã hết hàng trong kho.', 'warning');
      return;
    }

    setIsAdding(true);
    try {
      await addToCart(product, 1);
      setJustAdded(true);
      showToast(`Đã thêm "${product.name}" vào giỏ hàng`, 'success');
      setTimeout(() => setJustAdded(false), 1500);
    } catch (err: any) {
      showToast(err.message || 'Không thể thêm sản phẩm', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 10;

  return (
    <div className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-soft hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-300 flex flex-col overflow-hidden relative">
      {/* Top Badges & Category */}
      <div className="p-4 pb-0 flex items-center justify-between gap-2">
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
          {product.category}
        </span>
        {isOutOfStock ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-rose-50 text-rose-600 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
            <XCircle className="w-3 h-3" />
            HẾT HÀNG
          </span>
        ) : isLowStock ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3" />
            Còn {product.stock}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
            Còn {product.stock}
          </span>
        )}
      </div>

      {/* Product Information */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="text-slate-400 text-[11px] font-mono mb-1">
            <span>{product.code}</span>
          </div>

          <Link to={`/user/products/${product.id}`} className="block">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              {product.name}
            </h4>
          </Link>
        </div>

        {/* Price & Action */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400">
              {formatVND(product.price)}
            </div>
            {product.originalPrice && (
              <div className="text-[11px] text-slate-400 line-through">
                {formatVND(product.originalPrice)}
              </div>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock || isAdding}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
              isOutOfStock
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                : justAdded
                ? 'bg-emerald-600 text-white shadow-emerald-500/25'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25 active:scale-95'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-4 h-4" />
                <span>Đã thêm</span>
              </>
            ) : isOutOfStock ? (
              <span>Hết hàng</span>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                <span className="hidden sm:inline">Thêm giỏ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
