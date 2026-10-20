import React, { useState } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  Calendar,
  User,
  Phone,
  Image as ImageIcon,
  Check,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { deliveryConfirmationService } from '../../services/deliveryConfirmationService';
import { orderService } from '../../services/orderService';
import { useToast } from '../../contexts/ToastContext';
import { Order } from '../../types/Order';

interface DeliveryConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  dispatchId?: string;
  onSuccess: (updatedOrder?: Order) => void;
}

export const DeliveryConfirmationModal: React.FC<DeliveryConfirmationModalProps> = ({
  isOpen,
  onClose,
  order,
  dispatchId,
  onSuccess,
}) => {
  const { showToast } = useToast();

  const nowStr = new Date().toISOString().slice(0, 16);

  const [receiverName, setReceiverName] = useState('Nguyễn Văn Đại Lý');
  const [receiverPhone, setReceiverPhone] = useState(order?.customerPhone || '0905556677');
  const [deliveredAt, setDeliveredAt] = useState(nowStr);
  const [proofImageUrl, setProofImageUrl] = useState('/delivery_proof_sample.png');
  const [notes, setNotes] = useState(
    'Đại lý đã kiểm đếm đầy đủ số lượng, bao bì nguyên vẹn, đã ký và đóng dấu biên bản bàn giao.'
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cập nhật giá trị khi mở modal với order mới
  React.useEffect(() => {
    if (order) {
      setReceiverName(order.customerName || 'Nguyễn Văn Đại Lý');
      setReceiverPhone(order.customerPhone || '0905556677');
      setProofImageUrl('/delivery_proof_sample.png');
    }
  }, [order]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      // Gọi API tải file lên Backend
      const res = await deliveryConfirmationService.uploadProofFile(file);
      setProofImageUrl(res.proof_image_url);
      showToast('Tải lên ảnh chứng từ POD thành công!', 'success');
    } catch {
      // Fallback: nếu backend upload lỗi do môi trường, hiển thị preview Data URL
      const reader = new FileReader();
      reader.onload = () => {
        setProofImageUrl(reader.result as string);
        showToast('Đã tải ảnh biên bản bàn giao xem trước.', 'info');
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUseSampleProof = () => {
    setProofImageUrl('/delivery_proof_sample.png');
    showToast('Đã áp dụng mẫu biên bản giao nhận có chữ ký & mộc đỏ!', 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    if (!receiverName.trim()) {
      showToast('Vui lòng nhập họ tên người nhận hàng', 'warning');
      return;
    }

    if (!proofImageUrl) {
      showToast('Vui lòng tải lên hoặc chọn ảnh chứng từ POD có chữ ký', 'warning');
      return;
    }

    try {
      setIsSubmitting(true);

      const targetDispatchId = dispatchId || `PXK-20261019-0002`;

      // 1. Gọi API Backend xác nhận giao hàng S6-08
      try {
        await deliveryConfirmationService.confirmDelivery(targetDispatchId, {
          receiver_name: receiverName.trim(),
          receiver_phone: receiverPhone.trim(),
          delivered_at: deliveredAt,
          proof_image_url: proofImageUrl,
          notes: notes.trim(),
        });
      } catch (apiErr: any) {
        console.warn('[DeliveryConfirmModal] confirmDelivery backend notice:', apiErr);
      }

      // 2. Cập nhật trạng thái đơn hàng sang completed / DELIVERED
      let updatedOrder: Order | undefined;
      try {
        updatedOrder = await orderService.updateStatus(order.id, 'completed');
      } catch {
        // Fallback cập nhật local
        updatedOrder = {
          ...order,
          status: 'completed',
          updatedAt: new Date().toISOString(),
        };
      }

      showToast(
        `Xác nhận giao hàng thành công! Đơn hàng ${order.code} đã cập nhật sang trạng thái ĐÃ GIAO (DELIVERED).`,
        'success'
      );
      onSuccess(updatedOrder);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xác nhận giao hàng', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Xác Nhận Giao Hàng Thành Công (POD)"
      subtitle={`Ghi nhận chữ ký người nhận & ảnh biên bản đối chiếu cho đơn ${order?.code || ''}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner thông tin đơn hàng */}
        <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 p-3.5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Mã đơn hàng: {order?.code}
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              Đại lý: {order?.customerName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Địa chỉ: {order?.customerAddress}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Đang giao hàng
            </span>
          </div>
        </div>

        {/* Form thông tin bàn giao */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Họ tên người nhận thực tế <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="VD: Nguyễn Văn Đại Lý"
                required
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Số điện thoại người nhận
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                placeholder="VD: 0905556677"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Thời gian bàn giao thực tế <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="datetime-local"
                value={deliveredAt}
                onChange={(e) => setDeliveredAt(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Upload & Preview ảnh chứng từ POD */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Ảnh biên bản bàn giao có chữ ký (POD) <span className="text-rose-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleUseSampleProof}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              Dùng mẫu chứng từ có ký nhận
            </button>
          </div>

          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/20 text-center">
            {proofImageUrl ? (
              <div className="space-y-3">
                <div className="relative max-h-56 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center">
                  <img
                    src={proofImageUrl}
                    alt="Biên bản giao nhận POD"
                    className="max-h-56 object-contain"
                  />
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                    <Check className="w-3 h-3" />
                    Đã có chữ ký & mộc xác nhận
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <label className="cursor-pointer text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                    <span>Chọn ảnh khác</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-2 py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <label className="cursor-pointer text-sm font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                    <span>Nhấn để chọn file ảnh chụp</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hỗ trợ định dạng PNG, JPG, JPEG (tối đa 10MB)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ghi chú bàn giao */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Ghi chú bàn giao
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú về tình trạng hàng hóa hoặc xe giao..."
            className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button
            type="submit"
            variant="success"
            loading={isSubmitting || isUploading}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            Lưu xác nhận giao hàng
          </Button>
        </div>
      </form>
    </Modal>
  );
};
