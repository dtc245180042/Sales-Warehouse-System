import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Package, 
  Search, 
  Plus, 
  Filter, 
  Eye, 
  Calendar, 
  RefreshCw,
  FileText,
  AlertCircle
} from 'lucide-react';
import { mockUserApi } from '../../services/api';
import { UserOrder, OrderStatusType } from '../../data/mockData';
import { OrderStatusBadge } from '../../components/user/OrderStatus';
import { Pagination } from '../../components/user/Pagination';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await mockUserApi.getOrders();
      if (res.data.success && res.data.data) {
        setOrders(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch user orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        (order.orderNumber || order.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerPhone.includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const tabs: { key: OrderStatusType | 'all'; label: string; count?: number }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'processing', label: 'Đang xử lý' },
    { key: 'confirmed', label: 'Đã xác nhận' },
    { key: 'completed', label: 'Hoàn thành' },
    { key: 'cancelled', label: 'Đã hủy' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-7 h-7 text-blue-600" />
            Đơn hàng của tôi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Theo dõi và kiểm tra các đơn hàng do chính bạn lập trong hệ thống
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOrders}
            className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Tải lại danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/user/orders/create"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Tạo đơn mới
          </Link>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => {
          const isActive = statusFilter === tab.key;
          const count = tab.key === 'all'
            ? orders.length
            : orders.filter(o => o.status === tab.key).length;

          return (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm theo mã đơn (#HD...), tên hoặc SĐT..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 self-end sm:self-center">
          Tìm thấy <strong>{filteredOrders.length}</strong> đơn hàng
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-sm">Đang tải dữ liệu đơn hàng...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-lg">
              Chưa có đơn hàng nào
            </h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto mb-6">
              Không tìm thấy đơn hàng nào phù hợp với bộ lọc hiện tại của bạn.
            </p>
            <Link
              to="/user/orders/create"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tạo đơn hàng ngay
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4">Mã đơn</th>
                  <th className="p-4">Khách hàng</th>
                  <th className="p-4 text-right">Tổng tiền</th>
                  <th className="p-4 text-center">Thanh toán</th>
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4">Ngày tạo</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {paginatedOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Mã đơn */}
                    <td className="p-4">
                      <Link
                        to={`/user/orders/${order.id}`}
                        className="font-bold text-blue-600 dark:text-blue-400 hover:underline font-mono"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        {order.items.length} sản phẩm
                      </span>
                    </td>

                    {/* Khách hàng */}
                    <td className="p-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {order.customerName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {order.customerPhone}
                      </div>
                    </td>

                    {/* Tổng tiền */}
                    <td className="p-4 text-right">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {order.total.toLocaleString('vi-VN')}đ
                      </div>
                      {order.discount > 0 && (
                        <div className="text-[11px] text-emerald-600 font-medium">
                          Đã giảm: {order.discount.toLocaleString('vi-VN')}đ
                        </div>
                      )}
                    </td>

                    {/* Thanh toán */}
                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          order.paymentStatus === 'paid'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                        }`}
                      >
                        {order.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                      </span>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
                        {order.paymentMethod === 'cash' ? 'Tiền mặt' : order.paymentMethod === 'transfer' ? 'CK' : 'Ví điện tử'}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="p-4 text-center">
                      <OrderStatusBadge status={order.status} />
                    </td>

                    {/* Ngày tạo */}
                    <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {order.createdAt}
                      </div>
                    </td>

                    {/* Thao tác */}
                    <td className="p-4 text-right">
                      <Link
                        to={`/user/orders/${order.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredOrders.length}
            pageSize={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
