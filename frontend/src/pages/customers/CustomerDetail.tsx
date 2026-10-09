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
  Receipt,
  Eye,
  UserCheck,
  History,
  ShieldAlert,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { Modal } from '../../components/common/Modal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { customerService } from '../../services/customerService';
import { orderService } from '../../services/orderService';
import { Customer, SalesRep, CustomerAssignmentBrief, CustomerAssignmentHistory } from '../../types/Customer';
import { Order } from '../../types/Order';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { DeliveryAddressManager } from '../../components/customers/DeliveryAddressManager';
import { CreditLimitManager } from '../../components/customers/CreditLimitManager';

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [assignment, setAssignment] = useState<CustomerAssignmentBrief | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<CustomerAssignmentHistory[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab điều hướng: 'orders' hoặc 'history'
  const [activeTab, setActiveTab] = useState<'orders' | 'history'>('orders');

  // Đánh giá quyền hạn người dùng
  const roleStr = String(user?.role || '').toLowerCase();
  const isManagerOrAdmin = roleStr.includes('admin') || roleStr.includes('manager') || roleStr.includes('director');

  // Modal phân công / đổi người phụ trách
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [assignReason, setAssignReason] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchDetail = async () => {
    if (!id) return;
    try {
      const found = await customerService.getById(id);
      if (found) {
        setCustomer(found);

        // Tải đơn hàng
        const allOrders = await orderService.getAll();
        const matchOrders = allOrders.filter(
          (o) => o.customerId === found.id || o.customerName === found.name
        );
        setCustomerOrders(matchOrders);

        // Tải thông tin phân công hiện tại
        const assignData = await customerService.getAssignment(found.id);
        setAssignment(assignData);

        // Tải lịch sử phân công
        const historyData = await customerService.getAssignmentHistory(found.id);
        setAssignmentHistory(historyData);

        // Nếu là quản lý, tải danh sách Sales Rep
        if (isManagerOrAdmin) {
          const reps = await customerService.getSalesReps();
          setSalesReps(reps);
        }
      }
    } catch {
      showToast('Không thể tải chi tiết đại lý', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id, user]);

  const handleOpenAssignModal = () => {
    setSelectedStaffId(assignment?.assignedStaffId || '');
    setAssignReason('');
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (!selectedStaffId) {
      showToast('Vui lòng chọn nhân viên kinh doanh phụ trách', 'warning');
      return;
    }
    if (assignReason.trim().length < 5) {
      showToast('Lý do phân công phải có ít nhất 5 ký tự', 'warning');
      return;
    }

    setAssignLoading(true);
    try {
      await customerService.assignCustomer(customer.id, selectedStaffId, assignReason.trim());
      showToast('Cập nhật nhân viên phụ trách thành công!', 'success');
      setAssignModalOpen(false);
      fetchDetail();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi khi phân công đại lý';
      showToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!customer) return;
    if (assignReason.trim().length < 5) {
      showToast('Vui lòng nhập lý do hủy phân công (tối thiểu 5 ký tự)', 'warning');
      return;
    }

    setAssignLoading(true);
    try {
      await customerService.unassignCustomer(customer.id, assignReason.trim());
      showToast('Đã hủy phân công phụ trách đại lý thành công!', 'success');
      setAssignModalOpen(false);
      fetchDetail();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi khi hủy phân công';
      showToast(msg, 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  if (loading) return <Loading text="Đang tải dữ liệu đại lý..." />;
  if (!customer) {
    return (
      <EmptyState
        title="Không tìm thấy đại lý"
        description="Mã đại lý không tồn tại hoặc bạn không có quyền truy cập phạm vi này."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/customers')}
      />
    );
  }

  return (
    <PageContainer
      title={customer.name}
      subtitle={`Mã đại lý: ${customer.code} | Ngày tạo: ${customer.createdAt}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/customers">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách đại lý
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
        {/* Cột trái: Hồ sơ đại lý + Nhân viên phụ trách */}
        <div className="space-y-6">
          {/* Thẻ đại lý */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center text-2xl font-black mx-auto mb-4 shadow-md">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{customer.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{customer.code}</p>

            <div className="mt-3 flex justify-center">
              <Badge variant={customer.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
                {customer.status === 'active' ? 'Đại lý hoạt động' : 'Tạm ngưng'}
              </Badge>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-left space-y-3 text-xs">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{customer.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{customer.email || 'Chưa cập nhật email'}</span>
              </div>
              <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>{customer.address || 'Chưa cập nhật địa chỉ'}</span>
              </div>
            </div>
          </div>

          {/* Thẻ Nhân viên phụ trách hiện tại */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Người Phụ Trách Hiện Tại
                </h4>
              </div>
              {isManagerOrAdmin && (
                <button
                  onClick={handleOpenAssignModal}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  {assignment?.assignedStaffId ? 'Đổi người' : 'Phân công'}
                </button>
              )}
            </div>

            {assignment?.assignedStaffName ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                    {assignment.assignedStaffName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {assignment.assignedStaffName}
                    </div>
                    {assignment.assignedStaffPhone && (
                      <div className="text-xs text-slate-400">{assignment.assignedStaffPhone}</div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-1 text-slate-400">
                  {assignment.assignedAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Ngày phân công: {formatDate(assignment.assignedAt)}</span>
                    </div>
                  )}
                  {assignment.assignedBy && (
                    <div>Người thực hiện gán: {assignment.assignedBy}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-400">
                <div className="inline-block p-2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 mb-2">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>Đại lý này hiện chưa được phân công nhân viên phụ trách.</div>
                {isManagerOrAdmin && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3"
                    onClick={handleOpenAssignModal}
                  >
                    Phân công ngay
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Tổng quan kinh doanh */}
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

        {/* Cột phải: Hạn mức công nợ + Điểm giao hàng + Tabs Lịch sử */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quản lý hạn mức công nợ & Thời hạn nợ (S3-05) */}
          <CreditLimitManager customerId={customer.id} customerName={customer.name} />

          {/* Quản lý điểm giao hàng & Kho bãi (S3-04) */}
          <DeliveryAddressManager customerId={customer.id} customerName={customer.name} />

          {/* Header Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'orders'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Đơn Hàng Gần Đây ({customerOrders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Lịch Sử Phân Công & Chuyển Giao ({assignmentHistory.length})</span>
            </button>
          </div>

          {/* Nội dung Tab Đơn Hàng */}
          {activeTab === 'orders' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              {customerOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Mã đơn</th>
                        <th className="pb-3">Thời gian</th>
                        <th className="pb-3">Tổng tiền</th>
                        <th className="pb-3">Trạng thái</th>
                        <th className="pb-3 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {customerOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 font-semibold text-indigo-600 dark:text-indigo-400">
                            {o.code}
                          </td>
                          <td className="py-3 text-slate-500">{formatDate(o.createdAt)}</td>
                          <td className="py-3 font-black text-slate-900 dark:text-white">
                            {formatCurrency(o.total)}
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={
                                o.status === 'completed'
                                  ? 'success'
                                  : o.status === 'cancelled'
                                  ? 'danger'
                                  : 'warning'
                              }
                              size="sm"
                            >
                              {o.status === 'completed'
                                ? 'Hoàn tất'
                                : o.status === 'cancelled'
                                ? 'Đã hủy'
                                : 'Đang xử lý'}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <Link
                              to={`/orders/${o.id}`}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 inline-block"
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
                  title="Chưa có đơn hàng"
                  description="Đại lý này chưa phát sinh giao dịch bán hàng nào trong hệ thống."
                />
              )}
            </div>
          )}

          {/* Nội dung Tab Lịch Sử Phân Công */}
          {activeTab === 'history' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              {assignmentHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Thời gian</th>
                        <th className="pb-3">Thao tác</th>
                        <th className="pb-3">Nhân viên liên quan</th>
                        <th className="pb-3 min-w-[200px]">Lý do thực hiện</th>
                        <th className="pb-3 text-right">Người duyệt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {assignmentHistory.map((h) => {
                        let actionBadge = <Badge variant="neutral" size="sm">Điều chỉnh</Badge>;
                        if (h.actionType === 'ASSIGN') {
                          actionBadge = <Badge variant="success" size="sm">Phân công mới</Badge>;
                        } else if (h.actionType === 'REASSIGN') {
                          actionBadge = <Badge variant="primary" size="sm">Đổi phụ trách</Badge>;
                        } else if (h.actionType === 'BULK_TRANSFER') {
                          actionBadge = <Badge variant="purple" size="sm">Chuyển giao hàng loạt</Badge>;
                        } else if (h.actionType === 'UNASSIGN') {
                          actionBadge = <Badge variant="danger" size="sm">Hủy phân công</Badge>;
                        }

                        return (
                          <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 text-slate-500 whitespace-nowrap">
                              {h.createdAt ? formatDate(h.createdAt) : '--'}
                            </td>
                            <td className="py-3 whitespace-nowrap">{actionBadge}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {h.fromStaffName || 'Chưa phân công'}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                  {h.toStaffName || 'Để trống'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 text-slate-700 dark:text-slate-300">
                              <div className="text-xs">{h.reason}</div>
                            </td>
                            <td className="py-3 text-right font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {h.performedBy}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Chưa có lịch sử thay đổi"
                  description="Đại lý này chưa từng được điều chỉnh hoặc chuyển giao người phụ trách."
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Phân công / Đổi người phụ trách */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={assignment?.assignedStaffId ? 'Điều chỉnh nhân viên phụ trách' : 'Phân công nhân viên phụ trách'}
        size="md"
      >
        <form onSubmit={handleConfirmAssign} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">Đại lý: </span>
            {customer.name} ({customer.code})
            {assignment?.assignedStaffName && (
              <div className="mt-1">
                <span className="font-semibold text-slate-900 dark:text-white">Người phụ trách hiện tại: </span>
                {assignment.assignedStaffName}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nhân viên kinh doanh phụ trách <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">-- Chọn nhân viên kinh doanh --</option>
              {salesReps.map((sr) => (
                <option key={sr.id} value={sr.id}>
                  {sr.fullName} ({sr.email}) - Đang phụ trách {sr.assignedCustomerCount} đại lý
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lý do phân công / điều chỉnh <span className="text-rose-500">* (5 - 500 ký tự)</span>
            </label>
            <textarea
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Nhập lý do phân công hoặc chuyển giao người phụ trách..."
              rows={3}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <div className="text-right text-[11px] text-slate-400 mt-0.5">
              {assignReason.trim().length}/500 ký tự
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            {assignment?.assignedStaffId ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmUnassign}
                disabled={assignLoading}
              >
                Hủy phân công
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAssignModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={assignLoading}>
                {assignLoading ? 'Đang lưu...' : 'Xác nhận phân công'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
