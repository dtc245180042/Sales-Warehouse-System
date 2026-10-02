import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Check } from 'lucide-react';
import { ProductItem } from '../../data/mockData';
import { useUserCart } from '../../contexts/UserCartContext';
import { useToast } from '../../contexts/ToastContext';

interface ProductTableProps {
  products: ProductItem[];
}

export const ProductTable: React.FC<ProductTableProps> = ({ products }) => {
  const { addToCart } = useUserCart();
  const { showToast } = useToast();
  const [addingId, setAddingId] = useState<string | null>(null);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const handleAdd = async (product: ProductItem) => {
    if (product.stock <= 0) {
      showToast('Sản phẩm đã hết hàng trong kho.', 'warning');
      return;
    }
    setAddingId(product.id);
    try {
      await addToCart(product, 1);
      showToast(`Đã thêm "${product.name}" vào giỏ hàng`, 'success');
    } finally {
      setTimeout(() => setAddingId(null), 1000);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-3.5 px-4">Sản phẩm</th>
              <th className="py-3.5 px-4">Mã SP</th>
              <th className="py-3.5 px-4">Danh mục</th>
              <th className="py-3.5 px-4 text-right">Đơn giá</th>
              <th className="py-3.5 px-4 text-center">Tồn kho</th>
              <th className="py-3.5 px-4 text-center">Trạng thái</th>
              <th className="py-3.5 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-sm">
            {products.map((p) => {
              const isOutOfStock = p.stock <= 0;
              const isLowStock = p.stock > 0 && p.stock <= 10;
              const isAdded = addingId === p.id;

              return (
                <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <Link
                          to={`/user/products/${p.id}`}
                          className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 line-clamp-1"
                        >
                          {p.name}
                        </Link>
                        <span className="text-[11px] text-slate-400 block sm:hidden font-mono mt-0.5">
                          {p.code}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 font-semibold">{p.code}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                      {p.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-black text-indigo-600 dark:text-indigo-400">
                    {formatVND(p.price)}
                  </td>
                  <td className="py-3 px-4 text-center font-bold">
                    <span className={isOutOfStock ? 'text-rose-500' : isLowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {isOutOfStock ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                        Hết hàng
                      </span>
                    ) : isLowStock ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                        Sắp hết
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                        Sẵn sàng
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleAdd(p)}
                        disabled={isOutOfStock}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isOutOfStock
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                            : isAdded
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                        }`}
                      >
                        {isAdded ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{isAdded ? 'Đã thêm' : 'Thêm giỏ'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
