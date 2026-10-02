import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  variant = 'danger',
  isLoading = false,
}) => {
  const iconMap = {
    danger: <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />,
    warning: <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />,
    info: <Info className="w-10 h-10 text-indigo-500 mx-auto" />,
  };

  const buttonVariant = variant === 'danger' ? 'danger' : variant === 'warning' ? 'primary' : 'primary';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="text-center py-2">
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4">
          {iconMap[variant]}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>

        <div className="flex items-center justify-center gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={isLoading} className="flex-1">
            {cancelText}
          </Button>
          <Button
            variant={buttonVariant}
            onClick={onConfirm}
            isLoading={isLoading}
            className="flex-1"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
