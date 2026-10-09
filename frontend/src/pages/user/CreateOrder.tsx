import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShoppingBag, 
  User, 
  CreditCard, 
  ClipboardCheck, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  DollarSign,
  Smartphone,
  Building,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  PackageCheck,
  Package,
} from 'lucide-react';
import { useUserCart } from '../../contexts/UserCartContext';
import { mockUserApi } from '../../services/api';
import { PaymentMethod } from '../../data/mockData';

const STEPS = [
  { id: 1, label: 'Sản phẩm', icon: ShoppingBag },
  { id: 2, label: 'Khách hàng', icon: User },
  { id: 3, label: 'Thanh toán', icon: CreditCard },
  { id: 4, label: 'Kiểm tra', icon: ClipboardCheck },
];

export const CreateOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, subtotal, discount, tax, total, clearCart } = useUserCart();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdOrder, setCreatedOrder] = useState<{ id: string; total: number; orderNumber: string } | null>(null);

  // Customer form state
  const [customerInfo, setCustomerInfo] = useState({
    name: 'Nguyễn Văn B',
    phone: '0901234567',
    email: 'customer@gmail.com',
    address: '123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    notes: 'Giao giờ hành chính, gọi trước khi giao'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Payment form state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidStatus, setPaidStatus] = useState<'paid' | 'unpaid'>('paid');

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!customerInfo.name.trim()) errs.name = 'Vui lòng nhập tên khách hàng';
    if (!customerInfo.phone.trim()) {
      errs.phone = 'Vui lòng nhập số điện thoại';
    } else if (!/^(0|\+84)[3|5|7|8|9][0-9]{8}$/.test(customerInfo.phone.trim())) {
      errs.phone = 'Số điện thoại không đúng định dạng (VD: 0901234567)';
    }
    if (customerInfo.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email.trim())) {
      errs.email = 'Email không hợp lệ';
    }
    if (!customerInfo.address.trim()) errs.address = 'Vui lòng nhập địa chỉ giao hàng';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (items.length === 0) {
        alert('Giỏ hàng chưa có sản phẩm nào. Vui lòng thêm sản phẩm trước khi tạo đơn.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (validateStep2()) {
        setCurrentStep(3);
      }
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleConfirmOrder = async () => {
    setIsSubmitting(true);
    try {
      const orderPayload = {
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        customerEmail: customerInfo.email,
        customerAddress: customerInfo.address,
        items: items.map(item => ({
          productId: item.product.id,
          productName: item.product.name,
          sku: item.product.sku,
          image: item.product.image,
          price: item.product.price,
          quantity: item.quantity,
          total: item.product.price * item.quantity
        })),
        subtotal,
        discount,
        tax,
        total,
        paymentMethod,
        paymentStatus: paidStatus,
        notes: customerInfo.notes
      };

      const res = await mockUserApi.createOrder(orderPayload);
      if (res.data.success && res.data.data) {
        setCreatedOrder({
          id: res.data.data.id,
          orderNumber: res.data.data.orderNumber,
          total: res.data.data.total
        });
        clearCart();
        setCurrentStep(5); // Success step
      }
    } catch (err) {
      console.error('Order creation error:', err);
      alert('Không thể tạo đơn hàng. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 5: Success Screen
  if (currentStep === 5 && createdOrder) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/50 rounded-3xl p-8 sm:p-10 text-center shadow-xl shadow-emerald-500/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
          
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-12 h-12" />
          </div>

          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
            ✓ Tạo đơn hàng thành công!
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            Đơn hàng đã được lưu vào hệ thống và sẵn sàng để đóng gói, xử lý giao hàng.
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 mb-8 text-left border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">Mã đơn hàng:</span>
              <span className="font-bold text-lg text-blue-600 font-mono">
                {createdOrder.orderNumber}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">Khách hàng:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {customerInfo.name} ({customerInfo.phone})
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">Phương thức:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {paymentMethod === 'cash' ? 'Tiền mặt' : paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Ví điện tử'}
              </span>
            </div>
            <div className="pt-3 border-t border-dashed border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
              <span className="font-bold text-slate-800 dark:text-slate-200">Tổng tiền:</span>
              <span className="text-2xl font-black text-emerald-600">
                {createdOrder.total.toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate(`/user/orders/${createdOrder.id}`)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all"
            >
              [ XEM ĐƠN HÀNG ]
            </button>
            <button
              onClick={() => {
                setCreatedOrder(null);
                setCurrentStep(1);
                navigate('/user/products');
              }}
              className="px-6 py-3 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-all"
            >
              Tạo đơn hàng mới
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Tạo đơn bán hàng
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Quy trình 4 bước tạo và xuất hóa đơn bán lẻ cho khách hàng
        </p>
      </div>

      {/* Stepper Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                    : isCompleted
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {isCompleted ? '✓' : step.id}
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider font-semibold opacity-70">
                    Bước {step.id}
                  </div>
                  <div className="font-semibold text-sm truncate">
                    {step.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        {/* Step 1: Review selected products */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                Bước 1: Chọn và kiểm tra sản phẩm bán
              </h2>
              <Link
                to="/user/products"
                className="text-sm font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                + Thêm sản phẩm từ kho
              </Link>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12">
                <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-4">Chưa có sản phẩm nào trong giỏ hàng để tạo đơn</p>
                <Link
                  to="/user/products"
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
                >
                  Duyệt danh mục sản phẩm
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {items.map((item) => (
                    <div key={item.product.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      {item.product.image ? (
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-14 h-14 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {item.product.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          SKU: {item.product.sku} | Đơn giá: {item.product.price.toLocaleString('vi-VN')}đ
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          x{item.quantity} {item.product.unit}
                        </div>
                        <div className="text-sm font-bold text-blue-600">
                          {(item.product.price * item.quantity).toLocaleString('vi-VN')}đ
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex flex-wrap justify-between items-center text-sm gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Tổng cộng {items.length} mặt hàng:
                  </span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {subtotal.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Customer Information */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Bước 2: Nhập thông tin khách hàng
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Điền thông tin người mua để in hóa đơn và lưu trữ bảo hành
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên khách hàng <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                      errors.name ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                    }`}
                  />
                </div>
                {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    placeholder="0901234567"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                      errors.phone ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                    }`}
                  />
                </div>
                {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    placeholder="customer@example.com"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                      errors.email ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                    }`}
                  />
                </div>
                {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Địa chỉ nhận hàng <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerInfo.address}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                    placeholder="Số nhà, tên đường, phường, quận..."
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                      errors.address ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                    }`}
                  />
                </div>
                {errors.address && <p className="text-xs text-rose-500 mt-1">{errors.address}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Ghi chú đơn hàng
                </label>
                <textarea
                  rows={2}
                  value={customerInfo.notes}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                  placeholder="Ghi chú thêm về vận chuyển hoặc yêu cầu hóa đơn..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Payment Method */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                Bước 3: Chọn phương thức thanh toán
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Lựa chọn hình thức thu tiền từ khách hàng
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Cash */}
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 ${
                  paymentMethod === 'cash'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-base">
                    Tiền mặt
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Thanh toán trực tiếp tại quầy hoặc khi nhận hàng (COD)
                  </div>
                </div>
              </button>

              {/* Transfer */}
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 ${
                  paymentMethod === 'transfer'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Building className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-base">
                    Chuyển khoản
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Chuyển khoản qua số tài khoản ngân hàng của cửa hàng
                  </div>
                </div>
              </button>

              {/* E-wallet */}
              <button
                type="button"
                onClick={() => setPaymentMethod('ewallet')}
                className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 ${
                  paymentMethod === 'ewallet'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-base">
                    Ví điện tử
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Momo, VNPay, ZaloPay quét mã QR tức thì
                  </div>
                </div>
              </button>
            </div>

            {/* Payment Status option */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Trạng thái thanh toán của đơn
                </div>
                <div className="text-xs text-slate-400">
                  Đánh dấu nếu khách đã thanh toán ngay lúc này
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaidStatus('paid')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    paidStatus === 'paid'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  ✓ Đã thanh toán
                </button>
                <button
                  type="button"
                  onClick={() => setPaidStatus('unpaid')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    paidStatus === 'unpaid'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Chưa thanh toán (Công nợ / COD)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review and Confirm */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-blue-600" />
                Bước 4: Kiểm tra và duyệt thông tin đơn hàng
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Vui lòng rà soát lại thông tin sản phẩm và khách hàng trước khi bấm xác nhận
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer recap */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl space-y-2 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold uppercase text-slate-400">Thông tin người nhận</div>
                <div className="font-semibold text-slate-900 dark:text-white">{customerInfo.name}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">SĐT: {customerInfo.phone}</div>
                {customerInfo.email && <div className="text-sm text-slate-600 dark:text-slate-300">Email: {customerInfo.email}</div>}
                <div className="text-sm text-slate-600 dark:text-slate-300">Địa chỉ: {customerInfo.address}</div>
                {customerInfo.notes && (
                  <div className="text-xs text-slate-500 italic pt-1">Ghi chú: "{customerInfo.notes}"</div>
                )}
              </div>

              {/* Payment recap */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl space-y-2 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold uppercase text-slate-400">Phương thức thanh toán</div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {paymentMethod === 'cash' ? '💵 Tiền mặt' : paymentMethod === 'transfer' ? '🏦 Chuyển khoản ngân hàng' : '📱 Ví điện tử'}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Tình trạng:{' '}
                  <span className={`font-semibold ${paidStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {paidStatus === 'paid' ? 'Đã thanh toán đủ' : 'Chưa thanh toán (Thu sau)'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 pt-2">
                  Nhân viên phụ trách: <strong>Nguyễn Văn A (Mã: NV-0824)</strong>
                </div>
              </div>
            </div>

            {/* Products table preview */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="p-3">Sản phẩm</th>
                    <th className="p-3 text-center">Số lượng</th>
                    <th className="p-3 text-right">Đơn giá</th>
                    <th className="p-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it) => (
                    <tr key={it.product.id}>
                      <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                        {it.product.name}
                        <span className="block text-xs text-slate-400">{it.product.sku}</span>
                      </td>
                      <td className="p-3 text-center text-slate-600 dark:text-slate-400">
                        {it.quantity} {it.product.unit}
                      </td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                        {it.product.price.toLocaleString('vi-VN')}đ
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                        {(it.product.price * it.quantity).toLocaleString('vi-VN')}đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial summary */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 max-w-sm ml-auto text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tạm tính:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{subtotal.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Giảm giá:</span>
                <span className="font-semibold text-emerald-600">-{discount.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Thuế VAT (8%):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">+{tax.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
                <span className="font-bold text-slate-900 dark:text-white">Tổng cộng:</span>
                <span className="text-xl font-black text-blue-600">{total.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          </div>
        )}

        {/* Step Buttons: [ QUAY LẠI ] [ XÁC NHẬN / TIẾP TỤC ] */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800 mt-6">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              QUAY LẠI
            </button>
          ) : (
            <Link
              to="/user/cart"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              QUAY LẠI GIỎ HÀNG
            </Link>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              disabled={items.length === 0}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all"
            >
              TIẾP TỤC
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmOrder}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-7 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN ĐẶT HÀNG'}
              <CheckCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateOrderPage;
