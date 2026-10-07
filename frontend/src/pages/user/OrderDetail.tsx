import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Printer, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Building,
  DollarSign,
  Share2
} from 'lucide-react';
import { mockUserApi } from '../../services/api';
import { UserOrder } from '../../data/mockData';
import { OrderStatusBadge } from '../../components/user/OrderStatus';

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<UserOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await mockUserApi.getOrderById(id);
        if (res.data.success && res.data.data) {
          setOrder(res.data.data);
        }
      } catch (err) {
        console.error('Failed to load order', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-500 text-sm">Đang tải thông tin chi tiết đơn hàng...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-20 text-center max-w-md mx-auto space-y-4">
        <AlertCircle className="w-16 h-16 text-rose-500 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Không tìm thấy đơn hàng</h2>
        <p className="text-slate-500 text-sm">Đơn hàng không tồn tại hoặc bạn không có quyền xem đơn hàng này.</p>
        <button
          onClick={() => navigate('/user/orders')}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium"
        >
          Quay lại danh sách đơn hàng
        </button>
      </div>
    );
  }

  // Calculate status timeline step index
  // Steps: 'created' (always 1) -> 'confirmed' (2) -> 'processing' (3) -> 'completed' (4)
  const timelineSteps = [
    { key: 'created', title: 'Đã tạo đơn', desc: `Tạo bởi ${order.createdByName}` },
    { key: 'confirmed', title: 'Đã xác nhận', desc: 'Kiểm kho & duyệt đơn' },
    { key: 'processing', title: 'Đang xử lý', desc: 'Đóng gói & xuất kho' },
    { key: 'completed', title: 'Hoàn thành', desc: 'Giao hàng thành công' },
  ];

  let currentStepIdx = 1;
  if (order.status === 'confirmed') currentStepIdx = 2;
  else if (order.status === 'processing') currentStepIdx = 3;
  else if (order.status === 'completed') currentStepIdx = 4;
  else if (order.status === 'cancelled') currentStepIdx = -1;

  return (
    <div className="max-w-5xl mx-auto space-y-6 print:m-0 print:p-0">
      {/* Top action bar (hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to="/user/orders"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {order.orderNumber}
              </h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Được tạo vào lúc {order.createdAt}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            In hóa đơn
          </button>
        </div>
      </div>

      {/* Main Order Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-8">
        
        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">
                SP
              </div>
              <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-wide">
                SALE<span className="text-blue-600">PRO</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Hệ thống Quản lý Bán lẻ & Tồn kho Hiện đại
            </p>
            <p className="text-xs text-slate-400">
              Hotline: 1900 6868 | Email: support@salepro.vn
            </p>
          </div>

          <div className="sm:text-right space-y-1">
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Hóa đơn bán hàng
            </div>
            <div className="text-xl font-bold font-mono text-blue-600">
              {order.orderNumber}
            </div>
            <div className="text-xs text-slate-500">
              Ngày tạo: <strong>{order.createdAt}</strong>
            </div>
            <div className="text-xs text-slate-500">
              Nhân viên lập: <strong>{order.createdByName}</strong>
            </div>
          </div>
        </div>

        {/* Customer & Payment Info Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              Thông tin khách hàng
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white">
              {order.customerName}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{order.customerPhone}</span>
            </div>
            {order.customerEmail && (
              <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{order.customerEmail}</span>
              </div>
            )}
            <div className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{order.customerAddress}</span>
            </div>
          </div>

          {/* Payment & Logistics */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              Thanh toán & Giao dịch
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-300">
              Phương thức:{' '}
              <strong className="text-slate-900 dark:text-white">
                {order.paymentMethod === 'cash' ? '💵 Tiền mặt' : order.paymentMethod === 'transfer' ? '🏦 Chuyển khoản' : '📱 Ví điện tử'}
              </strong>
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-300">
              Tình trạng:{' '}
              <span className={`font-semibold ${order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {order.paymentStatus === 'paid' ? '✓ Đã thanh toán đầy đủ' : 'Chưa thanh toán (Công nợ)'}
              </span>
            </div>
            {order.notes && (
              <div className="text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">
                Ghi chú: <em>"{order.notes}"</em>
              </div>
            )}
          </div>
        </div>

        {/* Status Timeline */}
        <div className="py-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">
            Tiến trình đơn hàng
          </h3>

          {order.status === 'cancelled' ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-400 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-bold">Đơn hàng này đã bị hủy</div>
                <div className="text-xs">Đơn đã được hoàn tồn kho tự động trong hệ thống.</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {timelineSteps.map((step, idx) => {
                const stepNum = idx + 1;
                const isPassed = currentStepIdx >= stepNum;
                const isCurrent = currentStepIdx === stepNum;

                return (
                  <div
                    key={step.key}
                    className={`p-3.5 rounded-xl border relative transition-all ${
                      isPassed
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isPassed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        }`}
                      >
                        {isPassed ? '✓' : stepNum}
                      </div>
                      <span className={`text-xs font-bold ${isCurrent ? 'text-blue-600' : isPassed ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {step.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {step.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Items Table */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Danh sách sản phẩm
          </h3>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">Sản phẩm</th>
                  <th className="p-3.5 text-center">Số lượng</th>
                  <th className="p-3.5 text-right">Đơn giá</th>
                  <th className="p-3.5 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {order.items.map((it, idx) => (
                  <tr key={it.productId || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3.5 text-slate-400 text-xs">{idx + 1}</td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {it.productName}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        SKU: {it.sku}
                      </div>
                    </td>
                    <td className="p-3.5 text-center font-medium text-slate-700 dark:text-slate-300">
                      {it.quantity}
                    </td>
                    <td className="p-3.5 text-right text-slate-600 dark:text-slate-300">
                      {it.price.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="p-3.5 text-right font-bold text-slate-900 dark:text-white">
                      {(it.total ?? (it.price * it.quantity)).toLocaleString('vi-VN')}đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing Summary */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-400 space-y-1 max-w-sm">
            <p>• Hàng chính hãng 100%, bảo hành theo tiêu chuẩn nhà sản xuất.</p>
            <p>• Quý khách vui lòng kiểm tra kỹ hóa đơn và sản phẩm khi nhận hàng.</p>
            <p>• Xin cảm ơn quý khách đã tin tưởng và ủng hộ SALEPRO!</p>
          </div>

          <div className="w-full sm:w-80 space-y-2 text-sm bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Tạm tính:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {order.subtotal.toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Giảm giá:</span>
              <span className="font-semibold text-emerald-600">
                -{order.discount.toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Thuế VAT:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                +{order.tax.toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700 flex justify-between items-baseline">
              <span className="font-bold text-slate-900 dark:text-white text-base">
                Tổng cộng:
              </span>
              <span className="text-2xl font-black text-blue-600">
                {order.total.toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OrderDetailPage;
