import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  Receipt,
  Eye,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { orderService } from '../../services/orderService';
import { Customer } from '../../types/Customer';
import { Order } from '../../types/Order';

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const found = await customerService.getById(id);
        if (found) {
          setCustomer(found);
          const allOrders = await orderService.getAll();
          const matchOrders = allOrders.filter(
            (o) => o.customerId === found.id || o.customerName === found.name
          );
          setCustomerOrders(matchOrders);
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return <Loading text="Đang tải dữ liệu khách hàng..." />;
  if (!customer) {
    return (
      <EmptyState
        title="Không tìm thấy khách hàng"
        description="Mã khách hàng không tồn tại."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/customers')}
      />
    );
  }

  return (
    <PageContainer
      title={customer.name}
      subtitle={`Mã khách: ${customer.code} | Ngày tạo: ${customer.createdAt}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/customers">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách
            </Button>
          </Link>
          <Link to="/sales/pos">
            <Button variant="primary" size="sm" leftIcon={<ShoppingBag className="w-4 h-4" />}>
              Tạo đơn bán hàng
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center text-2xl font-black mx-auto mb-4 shadow-md">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{customer.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{customer.code}</p>

            <div className="mt-3 flex justify-center">
              <Badge variant={customer.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
                {customer.status === 'active' ? 'Khách hàng thân thiết' : 'Tạm ngưng'}
              </Badge>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-left space-y-3 text-xs">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{customer.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{customer.email || 'Chưa cập nhật'}</span>
              </div>
              <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>{customer.address || 'Chưa có địa chỉ'}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Tổng Đơn</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {customer.totalOrders}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Đã Chi Tiêu</span>
              <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(customer.totalSpent)}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Order History of this customer (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lịch Sử Đơn Hàng Của Khách
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Các đơn hàng đã phát sinh tại quầy và online
                </p>
              </div>
              <Receipt className="w-5 h-5 text-indigo-500" />
            </div>

            {customerOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="pb-3">Mã đơn</th>
                      <th className="pb-3">Thời gian</th>
                      <th className="pb-3">Tổng tiền</th>
                      <th className="pb-3">Trạng thái</th>
                      <th className="pb-3 text-right">Xem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 font-semibold text-indigo-600 dark:text-indigo-400">
                          {o.code}
                        </td>
                        <td className="py-3 text-slate-500">{formatDate(o.createdAt)}</td>
                        <td className="py-3 font-bold text-slate-900 dark:text-white">
                          {formatCurrency(o.total)}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              o.status === 'completed'
                                ? 'success'
                                : o.status === 'shipping'
                                ? 'info'
                                : o.status === 'confirmed'
                                ? 'primary'
                                : o.status === 'pending'
                                ? 'warning'
                                : 'danger'
                            }
                            size="sm"
                            dot
                          >
                            {o.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            to={`/orders/${o.id}`}
                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Chưa có đơn hàng nào"
                description="Khách hàng này chưa phát sinh giao dịch trong hệ thống."
              />
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
