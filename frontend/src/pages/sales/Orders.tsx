import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  Ban,
  Search,
  ShoppingCart,
  Download,
  Calendar,
  CreditCard,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { orderService } from '../../services/orderService';
import { Order, OrderStatus } from '../../types/Order';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const Orders: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);

  const loadOrders = async () => {
    const data = await orderService.getAll();
    setOrders(data);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        o.code.toLowerCase().includes(search.toLowerCase()) ||
        o.customerName.toLowerCase().includes(search.toLowerCase()) ||
        o.customerPhone.includes(search) ||
        o.staffName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const handleCancelOrder = async () => {
    if (!cancelOrderId) return;
    try {
      await orderService.cancelOrder(cancelOrderId);
      showToast('Đã hủy đơn hàng và hoàn lại số lượng tồn kho thành công', 'success');
      setCancelOrderId(null);
      loadOrders();
    } catch {
      showToast('Lỗi khi hủy đơn hàng', 'error');
    }
  };

  const handleExportCSV = () => {
    const rows = [
      ['Mã đơn', 'Khách hàng', 'SĐT', 'Ngày tạo', 'Tổng tiền', 'Phương thức', 'Trạng thái', 'Nhân viên'],
      ...filteredOrders.map((o) => [
        o.code,
        `"${o.customerName.replace(/"/g, '""')}"`,
        o.customerPhone,
        o.createdAt,
        o.total,
        o.paymentMethod,
        o.status,
        `"${o.staffName.replace(/"/g, '""')}"`,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `danh_sach_don_hang_${Date.now()}.csv`;
    link.click();
    showToast('Đã xuất danh sách đơn hàng sang CSV', 'success');
  };

  const statusConfigs: Record<OrderStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'primary' }> = {
    pending: { label: 'Chờ xử lý', variant: 'warning' },
    confirmed: { label: 'Đã xác nhận', variant: 'primary' },
    shipping: { label: 'Đang giao', variant: 'info' },
    completed: { label: 'Hoàn thành', variant: 'success' },
    cancelled: { label: 'Đã hủy', variant: 'danger' },
  };

  const columns: Column<Order>[] = [
    {
      key: 'code',
      header: 'Mã Đơn',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
      render: (o) => (
        <Link to={`/orders/${o.id}`} className="hover:underline">
          {o.code}
        </Link>
      ),
    },
    {
      key: 'customerName',
      header: 'Khách Hàng',
      sortable: true,
      className: 'min-w-[170px]',
      render: (o) => (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200">{o.customerName}</div>
          <span className="text-[11px] text-slate-400">{o.customerPhone}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Ngày Tạo',
      sortable: true,
      render: (o) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(o.createdAt)}</span>,
    },
    {
      key: 'total',
      header: 'Tổng Tiền',
      sortable: true,
      render: (o) => (
        <span className="font-black text-slate-900 dark:text-white">
          {formatCurrency(o.total)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Thanh Toán',
      sortable: true,
      render: (o) => {
        const methodMap = {
          cash: 'Tiền mặt',
          transfer: 'Chuyển khoản',
          card: 'Thẻ ATM/Visa',
        };
        return (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {methodMap[o.paymentMethod] || o.paymentMethod}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      sortable: true,
      render: (o) => {
        const conf = statusConfigs[o.status] || { label: o.status, variant: 'neutral' };
        return (
          <Badge variant={conf.variant as any} size="sm" dot>
            {conf.label}
          </Badge>
        );
      },
    },
    {
      key: 'staffName',
      header: 'Người Tạo Đơn',
      sortable: true,
      render: (o) => {
        const isCurrentUser = user && (user.name === o.staffName || String(user.id) === String(o.staffId));
        const avatarSrc = isCurrentUser && user?.avatar
          ? user.avatar
          : (o as any).staffAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(o.staffName)}&background=6366f1&color=fff&size=128`;
        return (
          <div className="flex items-center gap-2">
            <img
              src={avatarSrc}
              alt={o.staffName}
              className="w-7 h-7 rounded-full object-cover ring-2 ring-indigo-500/20 shadow-sm shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(o.staffName)}&background=6366f1&color=fff&size=128`;
              }}
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {o.staffName}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      className: 'text-right',
      render: (o) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/orders/${o.id}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Xem chi tiết đơn hàng"
          >
            <Eye className="w-4 h-4" />
          </Link>
          {o.status !== 'cancelled' && o.status !== 'completed' && (
            <button
              onClick={() => setCancelOrderId(o.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Hủy đơn hàng"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Quản Lý Đơn Hàng"
      subtitle={`Theo dõi và xử lý ${orders.length} đơn hàng trên toàn hệ thống`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel/CSV
          </Button>
          <Link to="/sales/pos">
            <Button variant="primary" size="sm" leftIcon={<ShoppingCart className="w-4 h-4" />}>
              Mở quầy POS bán hàng
            </Button>
          </Link>
        </div>
      }
    >
      <DataTable
        data={filteredOrders}
        columns={columns}
        keyExtractor={(o) => o.id}
        filterComponent={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã đơn, tên khách, số điện thoại, nhân viên..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ xử lý</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="shipping">Đang giao</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>
        }
      />

      <ConfirmDialog
        isOpen={!!cancelOrderId}
        onClose={() => setCancelOrderId(null)}
        onConfirm={handleCancelOrder}
        title="Xác nhận hủy đơn hàng"
        message="Bạn có chắc chắn muốn hủy đơn hàng này? Số lượng sản phẩm đã bán trong đơn sẽ được hoàn trả lại vào tồn kho."
        confirmText="Hủy đơn hàng"
        variant="danger"
      />
    </PageContainer>
  );
};
