import React, { useState, useEffect } from 'react';
import { Plus, Trash2, MapPin, Layers } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Warehouse, WarehouseLocation } from '../../types/Warehouse';
import { warehouseService } from '../../services/warehouseService';
import { useToast } from '../../contexts/ToastContext';

interface WarehouseLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: Warehouse | null;
  onSuccess: () => void;
}

export const WarehouseLocationModal: React.FC<WarehouseLocationModalProps> = ({
  isOpen,
  onClose,
  warehouse,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // New location form state
  const [newLoc, setNewLoc] = useState({
    code: '',
    zone: 'Khu A',
    shelf: 'Kệ 01',
    description: '',
    capacity: 500,
  });

  const loadLocations = async () => {
    if (!warehouse) return;
    try {
      const list = await warehouseService.getLocations(warehouse.id);
      setLocations(list);
    } catch {
      showToast('Không thể tải danh sách vị trí kho', 'error');
    }
  };

  useEffect(() => {
    if (warehouse && isOpen) {
      loadLocations();
      setIsAdding(false);
    }
  }, [warehouse, isOpen]);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouse) return;
    if (!newLoc.code.trim()) {
      showToast('Vui lòng nhập mã vị trí', 'error');
      return;
    }

    setLoading(true);
    try {
      await warehouseService.createLocation(warehouse.id, {
        code: newLoc.code.trim().toUpperCase(),
        zone: newLoc.zone.trim(),
        shelf: newLoc.shelf.trim(),
        description: newLoc.description.trim() || undefined,
        capacity: Number(newLoc.capacity) || 500,
        isActive: true,
      });
      showToast('Đã thêm vị trí lưu trữ mới', 'success');
      setNewLoc({
        code: '',
        zone: 'Khu A',
        shelf: 'Kệ 01',
        description: '',
        capacity: 500,
      });
      setIsAdding(false);
      await loadLocations();
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thêm vị trí', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLocation = async (locId: string) => {
    if (!warehouse) return;
    if (!window.confirm('Bạn có chắc muốn xóa vị trí lưu này?')) return;

    try {
      await warehouseService.deleteLocation(warehouse.id, locId);
      showToast('Đã xóa vị trí lưu trữ', 'success');
      await loadLocations();
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xóa vị trí', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Vị trí lưu kho — ${warehouse?.name || ''}`}
      subtitle={`Mã kho: ${warehouse?.code || ''} | Sơ đồ phân khu & kệ hàng (SCRUM-538)`}
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Header toolbar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-500" />
            Tổng số: <span className="font-semibold text-slate-800 dark:text-slate-200">{locations.length}</span> vị trí
          </div>
          {!isAdding && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsAdding(true)}
            >
              Thêm vị trí mới
            </Button>
          )}
        </div>

        {/* Add new location form */}
        {isAdding && (
          <form
            onSubmit={handleAddLocation}
            className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-slate-800/60 border border-indigo-100 dark:border-slate-700 space-y-3"
          >
            <div className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
              Khai báo vị trí lưu mới
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Mã vị trí *
                </label>
                <input
                  type="text"
                  value={newLoc.code}
                  onChange={(e) => setNewLoc({ ...newLoc, code: e.target.value.toUpperCase() })}
                  placeholder="VD: A1-KE01"
                  required
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Khu vực (Zone)
                </label>
                <input
                  type="text"
                  value={newLoc.zone}
                  onChange={(e) => setNewLoc({ ...newLoc, zone: e.target.value })}
                  placeholder="VD: Khu A"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Kệ / Dãy (Shelf)
                </label>
                <input
                  type="text"
                  value={newLoc.shelf}
                  onChange={(e) => setNewLoc({ ...newLoc, shelf: e.target.value })}
                  placeholder="VD: Kệ 01"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Mô tả / Hàng đặc thù
                </label>
                <input
                  type="text"
                  value={newLoc.description}
                  onChange={(e) => setNewLoc({ ...newLoc, description: e.target.value })}
                  placeholder="VD: Hàng điện tử giá trị cao"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Sức chứa (SKU / Sản phẩm)
                </label>
                <input
                  type="number"
                  min={1}
                  value={newLoc.capacity}
                  onChange={(e) => setNewLoc({ ...newLoc, capacity: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(false)}
                disabled={loading}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={loading}>
                Lưu vị trí
              </Button>
            </div>
          </form>
        )}

        {/* Locations List Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Mã vị trí</th>
                <th className="py-2.5 px-3">Khu vực</th>
                <th className="py-2.5 px-3">Kệ / Tầng</th>
                <th className="py-2.5 px-3">Sức chứa</th>
                <th className="py-2.5 px-3">Mô tả</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Chưa có vị trí nào được khai báo trong kho này. Nhấn &quot;Thêm vị trí mới&quot; để tạo.
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {loc.code}
                    </td>
                    <td className="py-2.5 px-3">{loc.zone}</td>
                    <td className="py-2.5 px-3">{loc.shelf}</td>
                    <td className="py-2.5 px-3">{loc.capacity || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate">
                      {loc.description || '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={loc.isActive ? 'success' : 'neutral'} size="sm">
                        {loc.isActive ? 'Khả dụng' : 'Khóa'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteLocation(loc.id)}
                        className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Xóa vị trí"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
};
