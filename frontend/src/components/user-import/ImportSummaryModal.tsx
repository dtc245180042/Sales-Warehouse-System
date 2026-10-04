import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  AlertTriangle,
  Users,
  Copy,
  ArrowRight,
  Shield,
  Key,
} from 'lucide-react';
import { UserImportSummaryResponse } from '../../types/userImport';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface ImportSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: UserImportSummaryResponse | null;
  onGoToUsers: () => void;
}

export const ImportSummaryModal: React.FC<ImportSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  onGoToUsers,
}) => {
  useEffect(() => {
    if (isOpen && summary && summary.success_count > 0) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Safe fallback if canvas is not supported
      }
    }
  }, [isOpen, summary]);

  if (!summary) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(`Đã sao chép: ${text}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Báo Cáo Tổng Kết Nhập Người Dùng Hàng Loạt"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onGoToUsers}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Xem danh sách người dùng
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Banner Tổng kết 3 chỉ số */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng dòng xử lý</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.total_processed}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nhập thành công</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.success_count}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-md shadow-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bị bỏ qua (Lỗi)</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{summary.failed_count}</p>
            </div>
          </div>
        </div>

        {/* Danh sách tài khoản đã tạo thành công */}
        {summary.created_users.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Tài khoản tạo thành công ({summary.created_users.length})
            </h4>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-750">
              {summary.created_users.map((u) => (
                <div key={u.id} className="p-2.5 px-3.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                      {u.username} <span className="text-slate-400 font-normal">({u.email})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Shield className="w-3 h-3 text-indigo-500" />
                      <span>{u.role}</span>
                      {u.full_name && <span>• {u.full_name}</span>}
                    </div>
                  </div>

                  {u.temporary_password && (
                    <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2 py-1 rounded-lg border border-amber-200/50 dark:border-amber-800/50">
                      <Key className="w-3 h-3 text-amber-600" />
                      <span className="font-mono text-[11px]">Pass tạm: {u.temporary_password}</span>
                      <button
                        onClick={() => copyToClipboard(u.temporary_password || '')}
                        className="p-0.5 hover:text-amber-950 dark:hover:text-white"
                        title="Sao chép mật khẩu"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danh sách các dòng bị lỗi đã bỏ qua */}
        {summary.row_errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Chi tiết dòng bị bỏ qua ({summary.row_errors.length})
            </h4>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10 divide-y divide-rose-100 dark:divide-rose-900/30">
              {summary.row_errors.map((err, i) => (
                <div key={i} className="p-2.5 px-3.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-mono text-[10px]">
                      Dòng #{err.row_index}
                    </span>
                    <span className="font-mono">{err.username || '(Chưa có username)'}</span>
                    {err.email && <span className="text-slate-400">({err.email})</span>}
                  </div>
                  <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-rose-300 dark:border-rose-700 text-[11px] text-rose-600 dark:text-rose-400">
                    {err.errors.map((msg, mIdx) => (
                      <div key={mIdx}>• {msg}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
