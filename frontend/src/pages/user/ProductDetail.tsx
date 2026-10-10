import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShoppingCart,
  Check,
  Package,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  Plus,
  Minus,
} from 'lucide-react';
import { api } from '../../services/api';
import { ProductItem } from '../../data/mockData';
import { useUserCart } from '../../contexts/UserCartContext';
import { useToast } from '../../contexts/ToastContext';

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useUserCart();
  const { showToast } = useToast();

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const data = await api.products.getById(id);
        setProduct(data);
      } catch (err: any) {
        showToast(err.message || 'Không tìm thấy sản phẩm', 'error');
        navigate('/user/products');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProduct();
  }, [id, navigate, showToast]);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const handleAddToCart = async () => {
    if (!product) return;
    if (product.stock <= 0) {
      showToast('Sản phẩm đã hết hàng trong kho.', 'warning');
      return;
    }
    if (quantity > product.stock) {
      showToast(`Kho chỉ còn ${product.stock} sản phẩm.`, 'warning');
      return;
    }

    setIsAdding(true);
    try {
      await addToCart(product, quantity);
      setJustAdded(true);
      showToast(`Đã thêm ${quantity} "${product.name}" vào giỏ hàng`, 'success');
      setTimeout(() => setJustAdded(false), 1500);
    } catch (err: any) {
      showToast(err.message || 'Lỗi thêm sản phẩm', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    await handleAddToCart();
    navigate('/user/cart');
  };

  if (isLoading || !product) {
    return (
      <div className="p-12 text-center animate-pulse space-y-4">
        <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto" />
        <p className="text-xs text-slate-400">Đang tải thông tin sản phẩm...</p>
      </div>
    );
  }

  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 10;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Back button */}
      <div>
        <Link
          to="/user/products"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh mục sản phẩm</span>
        </Link>
      </div>

      {/* Main Product Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-soft grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Big Product Image */}
        <div className="lg:col-span-6 relative aspect-square sm:aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800 group">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
              <Package className="w-16 h-16 stroke-[1.2]" />
            </div>
          )}

          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <span className="px-3 py-1 rounded-xl text-xs font-bold bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 backdrop-blur-md shadow-md border border-slate-200/50">
              {product.category}
            </span>
          </div>
        </div>

        {/* Right: Product Info & Actions */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mb-2">
              <span>Mã SP: <strong className="text-slate-700 dark:text-slate-300">{product.code}</strong></span>
              <span>•</span>
              <span className="text-amber-500 font-bold">★ {product.rating} (Đã bán {product.soldCount})</span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight">
              {product.name}
            </h1>
          </div>

          {/* Pricing Section */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex items-baseline gap-3">
            <span className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
              {formatVND(product.price)}
            </span>
            {product.originalPrice && (
              <span className="text-sm text-slate-400 line-through">
                {formatVND(product.originalPrice)}
              </span>
            )}
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold ml-auto">
              Đơn vị: {product.unit}
            </span>
          </div>

          {/* Stock Condition */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tình trạng kho:
            </span>
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                <XCircle className="w-4 h-4" />
                HẾT HÀNG TRONG KHO
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4" />
                Chỉ còn {product.stock} sản phẩm
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <Package className="w-4 h-4" />
                Còn {product.stock} sản phẩm sẵn sàng
              </span>
            )}
          </div>

          {/* Product Description */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Mô tả chi tiết sản phẩm
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              {product.description}
            </p>
          </div>

          {/* Quantity Selector & Purchase Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Số lượng:
              </span>
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || isOutOfStock}
                  className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min="1"
                  max={product.stock}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setQuantity(Math.min(product.stock, Math.max(1, val)));
                  }}
                  disabled={isOutOfStock}
                  className="w-14 text-center text-sm font-bold bg-transparent text-slate-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  disabled={quantity >= product.stock || isOutOfStock}
                  className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={isOutOfStock || isAdding}
                className={`py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                  isOutOfStock
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                    : justAdded
                    ? 'bg-emerald-600 text-white shadow-emerald-500/25'
                    : 'bg-white dark:bg-slate-800 border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 active:scale-95'
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Đã thêm vào giỏ</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    <span>Thêm vào giỏ hàng</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBuyNow}
                disabled={isOutOfStock || isAdding}
                className="py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-500/25 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Xem giỏ & Tiến hành đặt</span>
              </button>
            </div>
          </div>

          {/* Features Highlights */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 space-y-1">
              <ShieldCheck className="w-4 h-4 text-indigo-500 mx-auto" />
              <span className="font-semibold block">Chính hãng 100%</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 space-y-1">
              <Truck className="w-4 h-4 text-emerald-500 mx-auto" />
              <span className="font-semibold block">Giao nhanh tại kho</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 space-y-1">
              <RotateCcw className="w-4 h-4 text-amber-500 mx-auto" />
              <span className="font-semibold block">Bảo hành tiêu chuẩn</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export { ProductDetail as ProductDetailPage };
export default ProductDetail;
