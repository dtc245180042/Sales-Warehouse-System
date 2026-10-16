import React, { useState, useEffect } from 'react';
import { History, X, Clock, ShieldCheck, Lock, Edit3, PlusCircle } from 'lucide-react';
import { SalesTarget, SalesTargetAuditRecord } from '../../types/SalesTarget';
import { salesTargetService } from '../../services/salesTargetService';
import { formatDateTime, formatNumber } from '../../utils/formatters';

interface TargetAuditHistoryProps {
  target: SalesTarget;
  isOpen: boolean;
  onClose: () => void;
}

export const TargetAuditHistory: React.FC<TargetAuditHistoryProps> = ({
  target,
  isOpen,
  onClose,
}) => {
  const [audits, setAudits] = useState<SalesTargetAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true);
      try {
        const records = await salesTargetService.getAuditHistory(target.id);
        setAudits(records);
      } catch {
        setAudits([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, target.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-100 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Nhật ký kiểm toán chỉ tiêu (Audit Log)
              </h3>
              <p className="text-xs text-slate-500">
                {target.period} • {target.scope === 'individual' ? target.userName : target.territory}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content timeline */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-500" />
              Đang tải lịch sử thay đổi...
            </div>
          ) : audits.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Chưa có nhật ký kiểm toán nào cho chỉ tiêu này
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {audits.map((item) => {
                let icon = <Edit3 className="w-3.5 h-3.5 text-white" />;
                let dotColor = 'bg-blue-500';

                if (item.action === 'CREATE') {
                  icon = <PlusCircle className="w-3.5 h-3.5 text-white" />;
                  dotColor = 'bg-emerald-500';
                } else if (item.action === 'LOCK') {
                  icon = <Lock className="w-3.5 h-3.5 text-white" />;
                  dotColor = 'bg-slate-600';
                } else if (item.action === 'UPDATE_LOCKED') {
                  icon = <Edit3 className="w-3.5 h-3.5 text-white" />;
                  dotColor = 'bg-amber-500';
                }

                return (
                  <div key={item.id} className="relative">
                    <div
                      className={`absolute -left-6 top-1 w-4 h-4 rounded-full ${dotColor} border-2 border-white dark:border-slate-900 flex items-center justify-center`}
                    />

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {item.userName}{' '}
                          <span className="font-normal text-slate-400">
                            ({item.userRole})
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(item.timestamp)}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {item.changeSummary}
                      </div>

                      {item.oldRevenue !== undefined && item.newRevenue !== undefined && (
                        <div className="text-xs flex items-center gap-2 font-mono text-slate-600 dark:text-slate-400">
                          <span className="line-through">{formatNumber(item.oldRevenue)} đ</span>
                          <span>→</span>
                          <span className="font-bold text-primary-600 dark:text-primary-400">
                            {formatNumber(item.newRevenue)} đ
                          </span>
                        </div>
                      )}

                      {item.reason && (
                        <div className="text-xs p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 mt-2">
                          <strong>Lý do điều chỉnh:</strong> {item.reason}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
