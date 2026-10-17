import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import {
  DeliveryMilestoneKey,
  DeliveryTrackingDetails,
} from '../../types/DeliveryTracking';
import { MILESTONE_META, MILESTONE_ORDER } from '../../services/deliveryTrackingService';

interface UpdateMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracking: DeliveryTrackingDetails;
  onConfirm: (
    targetMilestone: DeliveryMilestoneKey,
    note: string,
    performer: string,
    location: string
  ) => Promise<void>;
}

export const UpdateMilestoneModal: React.FC<UpdateMilestoneModalProps> = ({
  isOpen,
  onClose,
  tracking,
  onConfirm,
}) => {
  const [selectedMilestone, setSelectedMilestone] = useState<DeliveryMilestoneKey>(
    tracking.currentMilestone
  );
  const [note, setNote] = useState('');
  const [performer, setPerformer] = useState('');
  const [location, setLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(
        selectedMilestone,
        note.trim(),
        performer.trim(),
        location.trim()
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cập Nhật Mốc Giao Hàng Cho Đại Lý"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Chọn Mốc Giao Hàng <span className="text-rose-500">*</span>
          </label>
          <div className="space-y-2">
            {MILESTONE_ORDER.map((key) => {
              const meta = MILESTONE_META[key];
              const isSelected = selectedMilestone === key;

              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="milestone_choice"
                    value={key}
                    checked={isSelected}
                    onChange={() => setSelectedMilestone(key)}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {meta.shortDescription}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Nhân viên / Bộ phận phụ trách
          </label>
          <input
            type="text"
            value={performer}
            onChange={(e) => setPerformer(e.target.value)}
            placeholder="Ví dụ: Đội xe OMS - Tài xế Nguyễn Văn Hùng"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Địa điểm ghi nhận hiện tại
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ví dụ: Đang trên cầu Sài Gòn, hướng về Quận 2"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Ghi chú chi tiết cho mốc
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Đã liên hệ đại lý trước 30 phút, hẹn nhận tại kho phụ..."
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
          >
            Xác nhận cập nhật
          </Button>
        </div>
      </form>
    </Modal>
  );
};
