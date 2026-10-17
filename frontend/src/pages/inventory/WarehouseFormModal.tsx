import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Warehouse, WarehouseStatus } from '../../types/Warehouse';
import { warehouseService } from '../../services/warehouseService';
import { useToast } from '../../contexts/ToastContext';

interface WarehouseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse?: Warehouse | null;
  onSuccess: () => void;
}

export const WarehouseFormModal: React.FC<WarehouseFormModalProps> = ({
  isOpen,
  onClose,
  warehouse,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    province: 'Hà Nội',
    district: '',
    manager: '',
    phone: '',
    capacity: 1000,
    status: 'active' as WarehouseStatus,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (warehouse) {
      setFormData({
        code: warehouse.code,
        name: warehouse.name,
        address: warehouse.address,
        province: warehouse.province || 'Hà Nội',
        district: warehouse.district || '',
        manager: warehouse.manager,
        phone: warehouse.phone || '',
        capacity: warehouse.capacity || 1000,
        status: warehouse.status,
      });
    } else {
      setFormData({
        code: '',
        name: '',
        address: '',
        province: 'Hà Nội',
        district: '',
        manager: '',
        phone: '',
        capacity: 1000,
        status: 'active',
      });
    }
    setErrors({});
  }, [warehouse, isOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Vui lòng nhập tên kho';
    if (!formData.address.trim()) errs.address = 'Vui lòng nhập địa chỉ';
    if (!formData.manager.trim()) errs.manager = 'Vui lòng nhập người phụ trách';
    if (formData.phone && !/^[0-9+-\s()]{8,15}$/.test(formData.phone.trim())) {
      errs.phone = 'Số điện thoại không hợp lệ';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (warehouse) {
        await warehouseService.update(warehouse.id, {
          name: formData.name.trim(),
          address: formData.address.trim(),
          province: formData.province.trim(),
          district: formData.district.trim() || undefined,
          manager: formData.manager.trim(),
          phone: formData.phone.trim() || undefined,
          capacity: Number(formData.capacity) || 0,
          status: formData.status,
        });
        showToast('Cập nhật thông tin kho thành công', 'success');
      } else {
        await warehouseService.create({
          code: formData.code.trim() || undefined,
          name: formData.name.trim(),
          address: formData.address.trim(),
          province: formData.province.trim(),
          district: formData.district.trim() || undefined,
          manager: formData.manager.trim(),
          phone: formData.phone.trim() || undefined,
          capacity: Number(formData.capacity) || 0,
          status: formData.status,
        });
        showToast('Tạo mới kho thành công', 'success');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu thông tin kho', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={warehouse ? 'Chỉnh sửa thông tin kho' : 'Thêm mới kho hàng'}
      subtitle={warehouse ? `Mã kho: ${warehouse.code}` : 'Khai báo kho lưu trữ mới trong hệ thống'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Mã kho {warehouse ? '(Không đổi)' : '(Tùy chọn)'}
            </label>
            <input
              type="text"
              value={formData.code}
              disabled={!!warehouse}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder={warehouse ? warehouse.code : 'VD: KHO-HN-02 (Tự sinh nếu trống)'}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên kho <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: Kho Tổng Miền Bắc"
              className={`w-full px-3 py-2 text-sm rounded-xl border ${
                errors.name ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
              } bg-white dark:bg-slate-900`}
            />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Địa chỉ kho <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="VD: Lô 10, KCN Quang Minh"
            className={`w-full px-3 py-2 text-sm rounded-xl border ${
              errors.address ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
            } bg-white dark:bg-slate-900`}
          />
          {errors.address && <p className="text-xs text-rose-500 mt-1">{errors.address}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tỉnh / Thành phố
            </label>
            <select
              value={formData.province}
              onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="Hà Nội">Hà Nội</option>
              <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
              <option value="Đà Nẵng">Đà Nẵng</option>
              <option value="Hải Phòng">Hải Phòng</option>
              <option value="Cần Thơ">Cần Thơ</option>
              <option value="Bình Dương">Bình Dương</option>
              <option value="Đồng Nai">Đồng Nai</option>
              <option value="Bắc Ninh">Bắc Ninh</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Quận / Huyện
            </label>
            <input
              type="text"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              placeholder="VD: Mê Linh, Cầu Giấy..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Người phụ trách <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.manager}
              onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
              placeholder="VD: Phạm Văn Kho"
              className={`w-full px-3 py-2 text-sm rounded-xl border ${
                errors.manager ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
              } bg-white dark:bg-slate-900`}
            />
            {errors.manager && <p className="text-xs text-rose-500 mt-1">{errors.manager}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Số điện thoại
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="VD: 0912345678"
              className={`w-full px-3 py-2 text-sm rounded-xl border ${
                errors.phone ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
              } bg-white dark:bg-slate-900`}
            />
            {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sức chứa dự kiến (SKU / Pallet)
            </label>
            <input
              type="number"
              min={1}
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Trạng thái hoạt động
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as WarehouseStatus })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="active">Hoạt động (Đang vận hành)</option>
              <option value="inactive">Tạm ngưng hoạt động</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Hủy bỏ
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {warehouse ? 'Lưu thay đổi' : 'Tạo kho mới'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
