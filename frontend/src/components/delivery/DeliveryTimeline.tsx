import React from 'react';
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  Truck,
  CheckCheck,
  ChevronRight,
  AlertCircle,
  Building,
  User,
  MapPin,
} from 'lucide-react';
import {
  DeliveryMilestone,
  DeliveryMilestoneKey,
  MilestoneStatus,
} from '../../types/DeliveryTracking';

interface DeliveryTimelineProps {
  milestones: DeliveryMilestone[];
  currentMilestone: DeliveryMilestoneKey;
  isCancelled?: boolean;
  cancelledReason?: string;
  variant?: 'stepper' | 'detailed' | 'both';
  onAdvanceMilestone?: (nextKey: DeliveryMilestoneKey) => void;
  canManage?: boolean;
}

const MILESTONE_CONFIG: Record<
  DeliveryMilestoneKey,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  approved: {
    label: 'Đã duyệt',
    icon: CheckCircle2,
    color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
  },
  preparing: {
    label: 'Đang soạn',
    icon: PackageCheck,
    color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
  },
  dispatched: {
    label: 'Đã xuất',
    icon: Building,
    color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800',
  },
  shipping: {
    label: 'Đang giao',
    icon: Truck,
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
  },
  delivered: {
    label: 'Đã giao',
    icon: CheckCheck,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
  },
};

export const DeliveryTimeline: React.FC<DeliveryTimelineProps> = ({
  milestones,
  currentMilestone,
  isCancelled = false,
  cancelledReason,
  variant = 'both',
  onAdvanceMilestone,
  canManage = false,
}) => {
  if (isCancelled) {
    return (
      <div className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3.5 text-rose-800 dark:text-rose-200">
        <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-sm">Đơn hàng đã hủy bỏ tiến trình giao hàng</h4>
          <p className="text-xs text-rose-600 dark:text-rose-300 mt-1">
            {cancelledReason || 'Tiến trình giao hàng đã dừng lại do đơn hàng bị hủy bỏ.'}
          </p>
        </div>
      </div>
    );
  }

  // Tìm index hiện tại
  const currentIndex = milestones.findIndex((m) => m.key === currentMilestone);
  const nextMilestone =
    currentIndex >= 0 && currentIndex < milestones.length - 1
      ? milestones[currentIndex + 1]
      : null;

  return (
    <div className="space-y-6">
      {/* 1. HORIZONTAL STEPPER */}
      {(variant === 'stepper' || variant === 'both') && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800/80">
                Tiến độ giao hàng (SCRUM-695)
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-2">
                Các Mốc Giao Hàng Cho Đại Lý
              </h3>
            </div>
            {canManage && nextMilestone && onAdvanceMilestone && (
              <button
                type="button"
                onClick={() => onAdvanceMilestone(nextMilestone.key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-colors"
              >
                <span>Chuyển mốc: {nextMilestone.label}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative">
            {/* Thanh tiến trình nền ngang */}
            <div className="absolute top-5 left-8 right-8 h-1 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 z-0 hidden sm:block">
              {/* Highlight thanh tiến độ đã hoàn thành */}
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-500"
                style={{
                  width: `${
                    currentIndex >= 0
                      ? (currentIndex / (milestones.length - 1)) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* Danh sách 5 mốc */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 relative z-10">
              {milestones.map((m, idx) => {
                const isPast = idx < currentIndex || (idx === currentIndex && m.status === 'completed');
                const isCurrent = idx === currentIndex && m.status !== 'completed';
                const isPending = idx > currentIndex;
                const config = MILESTONE_CONFIG[m.key] || {
                  label: m.label,
                  icon: Clock,
                  color: '',
                };
                const IconComponent = config.icon;

                let iconStyles = 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700';
                if (isPast) {
                  iconStyles = 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-950/60 shadow-md';
                } else if (isCurrent) {
                  iconStyles = 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950 animate-pulse shadow-lg';
                }

                return (
                  <div
                    key={m.key}
                    className="flex sm:flex-col items-center gap-3 sm:gap-2 text-left sm:text-center p-2 rounded-xl sm:p-0 transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300 ${iconStyles}`}
                    >
                      <IconComponent className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:justify-center">
                        <span
                          className={`text-xs font-bold leading-tight ${
                            isCurrent
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : isPast
                              ? 'text-slate-800 dark:text-slate-100'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {m.label}
                        </span>
                        {isCurrent && (
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 truncate">
                        {m.timestamp || (isPending ? 'Chưa diễn ra' : 'Đang xử lý')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. DETAILED VERTICAL TIMELINE */}
      {(variant === 'detailed' || variant === 'both') && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Chi Tiết Nhật Ký Các Mốc Giao Nhận
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Ghi nhận chuẩn xác từng thời điểm thực tế và người phụ trách
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
              5 Mốc Tiêu Chuẩn
            </span>
          </div>

          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {milestones.map((milestone, idx) => {
              const isPast = idx < currentIndex || (idx === currentIndex && milestone.status === 'completed');
              const isCurrent = idx === currentIndex && milestone.status !== 'completed';
              const config = MILESTONE_CONFIG[milestone.key] || {
                label: milestone.label,
                icon: Clock,
                color: '',
              };
              const Icon = config.icon;

              let nodeClass = 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400';
              if (isPast) {
                nodeClass = 'bg-emerald-500 border-emerald-600 text-white shadow-sm ring-4 ring-emerald-100 dark:ring-emerald-950/60';
              } else if (isCurrent) {
                nodeClass = 'bg-indigo-600 border-indigo-700 text-white shadow-md ring-4 ring-indigo-100 dark:ring-indigo-950 animate-pulse';
              }

              return (
                <div key={milestone.key} className="relative group">
                  {/* Icon Node trên vạch kẻ */}
                  <div
                    className={`absolute -left-6 sm:-left-8 top-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 flex items-center justify-center transition-all ${nodeClass}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  {/* Nội dung mốc */}
                  <div
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/80 shadow-sm'
                        : isPast
                        ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800'
                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {idx + 1}. {milestone.label}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-600 text-white">
                            Đang xử lý
                          </span>
                        )}
                        {isPast && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                            Hoàn tất
                          </span>
                        )}
                        {!isPast && !isCurrent && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Chờ
                          </span>
                        )}
                      </div>

                      {milestone.timestamp && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{milestone.timestamp}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                      {milestone.shortDescription}
                    </p>

                    {milestone.detailedNote && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 mb-2">
                        <span className="font-semibold text-slate-900 dark:text-white">Ghi chú: </span>
                        {milestone.detailedNote}
                      </div>
                    )}

                    {/* Metadata: Người thực hiện & Vị trí */}
                    {(milestone.performedBy || milestone.location) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                        {milestone.performedBy && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-indigo-500" />
                            <span>{milestone.performedBy}</span>
                            {milestone.roleTitle && (
                              <span className="text-slate-400">({milestone.roleTitle})</span>
                            )}
                          </span>
                        )}
                        {milestone.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-rose-500" />
                            <span>{milestone.location}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
