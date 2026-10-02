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
      {/* Top Image & Badges */}
      <Link to={`/user/products/${product.id}`} className="relative block overflow-hidden bg-slate-100 dark:bg-slate-800 aspect-4/3">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Stock Badge */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {isOutOfStock ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase bg-rose-600 text-white shadow-md">
              <XCircle className="w-3 h-3" />
              HẾT HÀNG
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500 text-white shadow-md">
              <AlertTriangle className="w-3 h-3" />
              Chỉ còn {product.stock}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500 text-white shadow-md">
              Còn {product.stock} cái
            </span>
          )}
        </div>

        {/* Category tag */}
        <div className="absolute bottom-3 left-3">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
            {product.category}
          </span>
        </div>
      </Link>

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
