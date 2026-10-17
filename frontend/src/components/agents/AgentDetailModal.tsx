import React from 'react';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  ShoppingBag,
  DollarSign,
  AlertCircle,
  FileText,
  CreditCard,
  X,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Agent, AgentGroup, AgentStatus } from '../../types/Agent';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface AgentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  onEdit?: (agent: Agent) => void;
  onDeactivate?: (agent: Agent) => void;
}

const GROUP_CONFIG: Record<AgentGroup, { label: string; variant: 'warning' | 'primary' | 'info' | 'neutral' }> = {
  platinum: { label: 'Platinum (Hạng Kim Cương)', variant: 'warning' },
  gold: { label: 'Gold (Hạng Vàng)', variant: 'primary' },
  silver: { label: 'Silver (Hạng Bạc)', variant: 'info' },
  standard: { label: 'Standard (Tiêu Chuẩn)', variant: 'neutral' },
};

const STATUS_CONFIG: Record<AgentStatus, { label: string; variant: 'success' | 'danger' | 'warning' }> = {
  active: { label: 'Đang hoạt động', variant: 'success' },
  inactive: { label: 'Ngừng giao dịch / Tạm ngưng', variant: 'danger' },
  pending: { label: 'Chờ duyệt hồ sơ', variant: 'warning' },
};

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  isOpen,
  onClose,
  agent,
  onEdit,
  onDeactivate,
}) => {
  if (!agent) return null;

  const statusConf = STATUS_CONFIG[agent.status] || { label: agent.status, variant: 'neutral' };
  const groupConf = GROUP_CONFIG[agent.customerGroup] || { label: agent.customerGroup, variant: 'neutral' };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Hồ Sơ Chi Tiết Đại Lý: ${agent.code}`}
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Header Summary */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black flex items-center justify-center text-lg shadow-md shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {agent.code}
                </span>
                <Badge variant={statusConf.variant} size="sm" dot>
                  {statusConf.label}
                </Badge>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {agent.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Link to={`/agents/orders/new?agent=${agent.id}`}>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<ShoppingBag className="w-4 h-4" />}
              >
                Tạo đơn hàng
              </Button>
            </Link>
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(agent);
                }}
              >
                Sửa hồ sơ
              </Button>
            )}
          </div>
        </div>

        {/* 3 Metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 block uppercase">
              Tổng số đơn hàng
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {agent.totalOrders} <span className="text-xs font-normal text-slate-400">đơn</span>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block uppercase">
              Tổng doanh số tích lũy
            </span>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
              {formatCurrency(agent.totalSpent)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block uppercase">
              Công nợ hiện tại
            </span>
            <p
              className={`text-xl font-black mt-1 ${
                agent.outstandingDebt > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {agent.outstandingDebt > 0 ? formatCurrency(agent.outstandingDebt) : '0 đ'}
            </p>
          </div>
        </div>

        {/* Detailed Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Cột 1: Thông tin pháp lý & Phân loại */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-500" />
              Thông Tin Định Danh & Phân Loại
            </h4>

            <div className="space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Mã đại lý:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">
                  {agent.code}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Mã số thuế (MST):</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {agent.taxCode || 'Chưa cung cấp'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Nhóm khách hàng:</span>
                <Badge variant={groupConf.variant} size="sm">
                  {groupConf.label}
                </Badge>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Khu vực địa lý:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {agent.region}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Người phụ trách (Sales):</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {agent.assignedStaffName || 'Chưa phân công'}
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-500">Ngày tạo hồ sơ:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {formatDate(agent.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Cột 2: Thông tin liên lạc & Địa chỉ */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-indigo-500" />
              Thông Tin Liên Lạc & Địa Chỉ
            </h4>

            <div className="space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Người đại diện / liên hệ:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {agent.contactPerson || '—'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Số điện thoại:</span>
                <a
                  href={`tel:${agent.phone}`}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  {agent.phone}
                </a>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Email:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {agent.email || '—'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Tỉnh / Thành phố:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {agent.province}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Quận / Huyện:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {agent.district || '—'}
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-500">Địa chỉ đầy đủ:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300 text-right max-w-[200px]">
                  {agent.address || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cảnh báo giao dịch nếu có */}
        {agent.totalOrders > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Đại lý đã có lịch sử giao dịch phát sinh</p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                Đại lý này hiện có {agent.totalOrders} đơn hàng ({formatCurrency(agent.totalSpent)}).
                Hệ thống vô hiệu hoá thao tác xoá hoàn toàn để giữ nguyên dữ liệu bán hàng. Nếu không hợp tác tiếp, bạn có thể chuyển trạng thái sang &quot;Ngừng giao dịch&quot;.
              </p>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            {agent.status === 'active' && onDeactivate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onDeactivate(agent);
                }}
              >
                Ngừng giao dịch đại lý này
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
};
