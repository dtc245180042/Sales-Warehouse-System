import React from 'react';
import { AlertTriangle, Ban, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Agent } from '../../types/Agent';
import { formatCurrency } from '../../utils/formatters';

interface AgentCannotDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  onDeactivate: (agent: Agent) => void;
}

export const AgentCannotDeleteModal: React.FC<AgentCannotDeleteModalProps> = ({
  isOpen,
  onClose,
  agent,
  onDeactivate,
}) => {
  if (!agent) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Không Thể Xóa Đại Lý Đã Có Giao Dịch"
      maxWidth="md"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Thao tác xóa đã bị vô hiệu hóa</h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              Đại lý <span className="font-bold">{agent.name}</span> ({agent.code}) đã có lịch sử đơn hàng phát sinh trên hệ thống.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
            <span>Tổng số đơn hàng đã lập:</span>
            <span className="font-black text-slate-900 dark:text-white">{agent.totalOrders} đơn</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60">
            <span>Tổng doanh số ghi nhận:</span>
            <span className="font-black text-indigo-600 dark:text-indigo-400">
              {formatCurrency(agent.totalSpent)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span>Công nợ tồn:</span>
            <span className={`font-bold ${agent.outstandingDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatCurrency(agent.outstandingDebt)}
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Nhằm đảm bảo tính chính xác cho các báo cáo doanh thu, đối soát công nợ và truy vết hóa đơn, hệ thống OMS Pro không cho phép xóa vĩnh viễn đại lý đã có đơn hàng. Thay vào đó, bạn có thể chuyển trạng thái sang <span className="font-bold text-slate-700 dark:text-slate-200">&quot;Ngừng giao dịch&quot;</span> để chặn tạo đơn mới.
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
          {agent.status !== 'inactive' ? (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Ban className="w-4 h-4" />}
              onClick={() => {
                onDeactivate(agent);
                onClose();
              }}
            >
              Chuyển sang Ngừng giao dịch
            </Button>
          ) : (
            <span className="text-xs text-slate-400 italic">Đại lý hiện đã ở trạng thái Ngừng giao dịch</span>
          )}
        </div>
      </div>
    </Modal>
  );
};
