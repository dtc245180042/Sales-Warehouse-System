import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Star,
  Edit2,
  Trash2,
  CheckCircle2,
  Navigation,
  Phone,
  User,
  X,
  Building2,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Loading } from '../common/Loading';
import { deliveryAddressService } from '../../services/deliveryAddressService';
import {
  DeliveryAddress,
  DeliveryAddressCreateDTO,
} from '../../types/DeliveryAddress';
import { filterPhoneInput, validateVNPhoneNumber } from '../../utils/phoneUtils';

interface Props {
  customerId: string;
  customerName: string;
}

export const DeliveryAddressManager: React.FC<Props> = ({ customerId, customerName }) => {
  const [addresses, setAddresses] = useState<DeliveryAddress[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAddress, setEditingAddress] = useState<DeliveryAddress | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState<DeliveryAddressCreateDTO>({
    name: '',
    receiver_name: '',
    phone: '',
    address: '',
    directions_note: '',
    is_default: false,
    status: 'active',
  });

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const data = await deliveryAddressService.getByCustomerId(customerId);
      setAddresses(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) {
      fetchAddresses();
    }
  }, [customerId]);

  const handleOpenCreateModal = () => {
    setEditingAddress(null);
    setFormData({
      name: '',
      receiver_name: customerName || '',
      phone: '',
      address: '',
      directions_note: '',
      is_default: addresses.length === 0,
      status: 'active',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (addr: DeliveryAddress) => {
    setEditingAddress(addr);
    setFormData({
      name: addr.name,
      receiver_name: addr.receiverName,
      phone: addr.phone,
      address: addr.address,
      directions_note: addr.directionsNote || '',
      is_default: addr.isDefault,
      status: addr.status || 'active',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.receiver_name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      setErrorMsg('Vui lòng điền đầy đủ các thông tin bắt buộc (*)');
      return;
    }

    const phoneCheck = validateVNPhoneNumber(formData.phone);
    if (!phoneCheck.valid) {
      setErrorMsg(phoneCheck.message || 'Số điện thoại liên hệ không hợp lệ');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      if (editingAddress) {
        await deliveryAddressService.update(editingAddress.id, formData);
      } else {
        await deliveryAddressService.create(customerId, formData);
      }
      setIsModalOpen(false);
      await fetchAddresses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Có lỗi xảy ra khi lưu điểm giao hàng.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (addressId: number) => {
    try {
      await deliveryAddressService.setDefault(addressId);
      await fetchAddresses();
    } catch (err: any) {
      alert(err.message || 'Không thể đặt làm mặc định.');
    }
  };

  const handleDelete = async (addressId: number, addressName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa điểm giao hàng "${addressName}"?`)) {
      return;
    }
    try {
      await deliveryAddressService.delete(addressId);
      await fetchAddresses();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa điểm giao hàng.');
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Điểm Giao Hàng & Kho Bãi Đại Lý
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Khai báo nhiều kho nhận hàng, cửa hàng chi nhánh để điều phối giao vận chính xác
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleOpenCreateModal}
        >
          Thêm điểm giao hàng
        </Button>
      </div>

      {loading ? (
        <Loading text="Đang tải danh sách điểm giao hàng..." />
      ) : addresses.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Chưa có điểm giao hàng nào được khai báo riêng
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-4">
            Thêm kho hoặc chi nhánh để nhân viên kinh doanh chọn khi tạo đơn hàng
          </p>
          <Button size="sm" variant="secondary" onClick={handleOpenCreateModal}>
            Thêm điểm đầu tiên
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`p-4 rounded-xl border transition-all ${
                addr.isDefault
                  ? 'border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 dark:border-indigo-600 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    {addr.name}
                  </span>
                  {addr.isDefault && (
                    <Badge variant="success" size="sm" dot>
                      Điểm mặc định
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditModal(addr)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id, addr.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mt-3">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {addr.receiverName}
                  </span>
                  <span className="text-slate-400">|</span>
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{addr.phone}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{addr.address}</span>
                </div>
                {addr.directionsNote && (
                  <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg mt-2">
                    <Navigation className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-medium leading-relaxed">
                      Chỉ dẫn: {addr.directionsNote}
                    </span>
                  </div>
                )}
              </div>

              {!addr.isDefault && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-semibold"
                    leftIcon={<Star className="w-3.5 h-3.5" />}
                    onClick={() => handleSetDefault(addr.id)}
                  >
                    Đặt làm mặc định
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Form Tạo/Sửa Điểm Giao Hàng */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-600" />
                {editingAddress ? 'Chỉnh Sửa Điểm Giao Hàng' : 'Thêm Điểm Giao Hàng Cho Đại Lý'}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên điểm giao hàng / Tên kho *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Kho số 1, Kho trung chuyển miền Tây, Cửa hàng 2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Người nhận hàng *
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Anh Tuấn (Thủ kho)"
                    value={formData.receiver_name}
                    onChange={(e) => setFormData({ ...formData, receiver_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Số điện thoại liên hệ *
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formData.phone.length}/10
                    </span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Ví dụ: 0912345678"
                    value={formData.phone}
                    onChange={(e) => {
                      const filtered = filterPhoneInput(e.target.value);
                      setFormData({ ...formData, phone: filtered });
                      if (filtered.length > 0) {
                        const check = validateVNPhoneNumber(filtered);
                        if (!check.valid) {
                          setErrorMsg(check.message || 'Số điện thoại không hợp lệ');
                        } else {
                          setErrorMsg('');
                        }
                      } else {
                        setErrorMsg('');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Chỉ nhập số, đúng 10 chữ số</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Địa chỉ chi tiết nhận hàng *
                </label>
                <textarea
                  rows={2}
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú chỉ dẫn đường đi / lưu ý vận chuyển (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Xe tải > 5 tấn đi cổng 2; chỉ nhận hàng giờ hành chính..."
                  value={formData.directions_note}
                  onChange={(e) => setFormData({ ...formData, directions_note: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="is_default" className="text-xs text-slate-700 dark:text-slate-300 select-none cursor-pointer">
                  Đặt làm điểm giao hàng mặc định cho đại lý này
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  disabled={submitting}
                >
                  {submitting ? 'Đang lưu...' : editingAddress ? 'Cập nhật' : 'Thêm mới'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
