import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Trash2, 
  ShoppingBag, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Minus, 
  Tag, 
  ShieldCheck, 
  CheckCircle2,
  AlertCircle,
  Package,
} from 'lucide-react';
import { useUserCart } from '../../contexts/UserCartContext';
import { Modal } from '../../components/user/Modal';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    items, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    subtotal, 
    discount, 
    tax, 
    total, 
    itemCount,
    setDiscount
  } = useUserCart();

  const [couponCode, setCouponCode] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponCode.trim().toUpperCase();
    if (!code) return;

    if (code === 'SALE10' || code === 'SALEPRO') {
      const discountVal = Math.min(Math.round(subtotal * 0.1), 500000);
      setDiscount(discountVal);
      setCouponMsg({
        type: 'success',
        text: `Đã áp dụng mã giảm giá 10% (-${discountVal.toLocaleString('vi-VN')}đ)`
      });
    } else if (code === 'VIP50K') {
      setDiscount(50000);
      setCouponMsg({
        type: 'success',
        text: 'Đã áp dụng mã giảm giá 50.000đ'
      });
    } else {
      setCouponMsg({
        type: 'error',
        text: 'Mã giảm giá không hợp lệ hoặc đã hết lượt sử dụng.'
      });
    }
  };

  const handleConfirmDeleteItem = () => {
    if (itemToDelete) {
      removeItem(itemToDelete.id);
      setItemToDelete(null);
    }
  };

  const handleConfirmClear = () => {
    clearCart();
    setShowClearModal(false);
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
          <ShoppingBag className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Giỏ hàng của bạn đang trống
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8">
          Chưa có sản phẩm nào được chọn. Hãy duyệt danh mục sản phẩm và thêm sản phẩm vào giỏ để tạo đơn hàng.
        </p>
        <Link
          to="/user/products"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          Tiếp tục chọn sản phẩm
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-blue-600" />
            Giỏ hàng bán hàng
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Đang có <span className="font-semibold text-blue-600">{itemCount}</span> mặt hàng trong giỏ
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/user/products"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Chọn thêm sản phẩm
          </Link>
          <button
            onClick={() => setShowClearModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-sm font-medium transition-colors border border-rose-200 dark:border-rose-900/50"
          >
            <Trash2 className="w-4 h-4" />
            Xóa toàn bộ
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Item List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const lineTotal = item.product.price * item.quantity;
                const isOutOfStock = item.product.stock <= 0;

                return (
                  <div 
                    key={item.product.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Image */}
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      {item.product.image ? (
                        <img 
                          src={item.product.image} 
                          alt={item.product.name}
                          className="w-full h-full object-cover" 
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-400" />
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {item.product.sku}
                        </span>
                        <span className="text-xs text-slate-400">
                          {item.product.category}
                        </span>
                      </div>
                      <Link 
                        to={`/user/products/${item.product.id}`}
                        className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 text-base line-clamp-1 mt-1"
                      >
                        {item.product.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-3 text-sm">
                        <span className="text-slate-500 dark:text-slate-400">
                          Đơn giá: <strong className="text-slate-800 dark:text-slate-200">{item.product.price.toLocaleString('vi-VN')}đ</strong>
                        </span>
                        <span className="text-xs text-slate-400">|</span>
                        <span className={`text-xs ${item.product.stock < 10 ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
                          Kho: {item.product.stock} {item.product.unit}
                        </span>
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-l-lg transition-colors"
                          title="Giảm"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={item.product.stock}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            updateQuantity(item.product.id, val);
                          }}
                          className="w-12 h-8 text-center text-sm font-semibold bg-transparent border-x border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          disabled={item.quantity >= item.product.stock}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-r-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Tăng"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Line Total & Delete */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-800">
                      <div className="text-right">
                        <div className="text-base font-bold text-blue-600">
                          {lineTotal.toLocaleString('vi-VN')}đ
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Thành tiền
                        </div>
                      </div>

                      <button
                        onClick={() => setItemToDelete({ id: item.product.id, name: item.product.name })}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Xóa mặt hàng"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Các sản phẩm trong giỏ đã được tự động kiểm tra đối chiếu tồn kho thực tế. Nhân viên vui lòng kiểm tra kỹ đơn giá và số lượng trước khi tiến hành thanh toán.
            </p>
          </div>
        </div>

        {/* Checkout Summary Card */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-5">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg pb-3 border-b border-slate-100 dark:border-slate-800">
              Tóm tắt đơn hàng
            </h3>

            {/* Discount Code Form */}
            <form onSubmit={handleApplyCoupon} className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
                Mã ưu đãi / Chiết khấu (thử 'SALE10' hoặc 'VIP50K')
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nhập mã giảm giá..."
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm uppercase rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Áp dụng
                </button>
              </div>
              {couponMsg && (
                <p className={`text-xs flex items-center gap-1 ${couponMsg.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {couponMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {couponMsg.text}
                </p>
              )}
            </form>

            {/* Totals Breakdown */}
            <div className="space-y-3 pt-2 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tạm tính:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {subtotal.toLocaleString('vi-VN')}đ
                </span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Giảm giá:</span>
                <span className="font-semibold text-emerald-600">
                  -{discount.toLocaleString('vi-VN')}đ
                </span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Thuế VAT (8%):</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  +{tax.toLocaleString('vi-VN')}đ
                </span>
              </div>

              <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-3 flex justify-between items-baseline">
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  Tổng cộng:
                </span>
                <span className="text-2xl font-black text-blue-600">
                  {total.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            {/* Checkout Action Button */}
            <button
              onClick={() => navigate('/user/orders/create')}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              TIẾN HÀNH THANH TOÁN
              <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-[11px] text-center text-slate-400">
              Nhấn tiến hành thanh toán để điền thông tin khách hàng và chọn phương thức thanh toán.
            </p>
          </div>
        </div>
      </div>

      {/* Delete Item Confirmation Modal */}
      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title="Xác nhận xóa sản phẩm"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Bạn có chắc chắn muốn xóa mặt hàng <strong className="text-slate-900 dark:text-white">{itemToDelete?.name}</strong> khỏi giỏ hàng?
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setItemToDelete(null)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmDeleteItem}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium"
            >
              Xác nhận xóa
            </button>
          </div>
        </div>
      </Modal>

      {/* Clear Cart Confirmation Modal */}
      <Modal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        title="Xóa toàn bộ giỏ hàng"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Bạn có chắc chắn muốn làm trống toàn bộ giỏ hàng? Tất cả các sản phẩm đã chọn sẽ bị xóa.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowClearModal(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmClear}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium"
            >
              Xác nhận xóa hết
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CartPage;
