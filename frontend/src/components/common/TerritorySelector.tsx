import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit2, Check, X, Settings2, Type, ListFilter } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export const DEFAULT_TERRITORIES = [
  'Địa bàn Miền Bắc (Hà Nội, Hải Phòng, Quảng Ninh...)',
  'Địa bàn Miền Trung (Đà Nẵng, Huế, Khánh Hòa...)',
  'Địa bàn Miền Nam (TP. HCM, Bình Dương, Đồng Nai...)',
  'Địa bàn Tây Nguyên (Đắk Lắk, Gia Lai, Lâm Đồng...)',
  'Địa bàn Tây Nam Bộ (Cần Thơ, An Giang, Kiên Giang...)',
];

const STORAGE_KEY = 'oms_territory_options';

interface TerritorySelectorProps {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}

export const TerritorySelector: React.FC<TerritorySelectorProps> = ({
  value,
  onChange,
  required = false,
}) => {
  const [territories, setTerritories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_TERRITORIES;
  });

  const [inputMode, setInputMode] = useState<'select' | 'text'>('select');
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  // Lưu danh sách vào localStorage khi có thay đổi
  const saveTerritories = (newItems: string[]) => {
    setTerritories(newItems);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    } catch {
      // safe fallback
    }
  };

  const handleAddTerritory = () => {
    const trimmed = newTerritoryName.trim();
    if (!trimmed) return;
    if (territories.includes(trimmed)) {
      alert('Địa bàn này đã có trong danh sách!');
      return;
    }
    const updated = [...territories, trimmed];
    saveTerritories(updated);
    setNewTerritoryName('');
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingText(territories[index]);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const oldName = territories[index];
    const updated = [...territories];
    updated[index] = trimmed;
    saveTerritories(updated);
    setEditingIndex(null);

    // Nếu giá trị hiện tại trùng với tên cũ -> cập nhật luôn
    if (value === oldName) {
      onChange(trimmed);
    }
  };

  const handleDelete = (index: number) => {
    const targetName = territories[index];
    if (confirm(`Bạn có chắc muốn xóa "${targetName}" khỏi danh sách chọn có sẵn?`)) {
      const updated = territories.filter((_, i) => i !== index);
      saveTerritories(updated);
      if (value === targetName) {
        onChange('');
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Gán địa bàn hoạt động {required && '*'}</span>
        </label>

        <div className="flex items-center gap-1.5">
          {/* Nút chuyển đổi nhập tự do / chọn danh sách */}
          <button
            type="button"
            onClick={() => setInputMode(inputMode === 'select' ? 'text' : 'select')}
            className="text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors"
            title={inputMode === 'select' ? 'Chuyển sang gõ văn bản tự do' : 'Chuyển sang chọn từ danh sách'}
          >
            {inputMode === 'select' ? (
              <>
                <Type className="w-3 h-3" />
                <span>Nhập văn bản</span>
              </>
            ) : (
              <>
                <ListFilter className="w-3 h-3" />
                <span>Chọn có sẵn</span>
              </>
            )}
          </button>

          {/* Nút quản lý danh mục */}
          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Quản lý danh sách địa bàn có sẵn"
          >
            <Settings2 className="w-3 h-3" />
            <span>Thêm/Sửa/Xóa</span>
          </button>
        </div>
      </div>

      {inputMode === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
          required={required}
        >
          <option value="">-- Chưa phân địa bàn (Hiện là &quot;Chưa có&quot;) --</option>
          {territories.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : (
        <div className="relative">
          <input
            type="text"
            list="territory-datalist"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Nhập tên địa bàn (Ví dụ: Địa bàn Miền Nam, KCN VSIP, Quận 1...)"
            className="w-full px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
            required={required}
          />
          <datalist id="territory-datalist">
            {territories.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      )}

      <p className="text-[11px] text-amber-700 dark:text-amber-400">
        Nhân viên kinh doanh phụ trách các đại lý thuộc địa bàn này. Nếu chưa gán, hệ thống sẽ hiển thị là <strong>&quot;Chưa có&quot;</strong>.
      </p>

      {/* Modal Quản lý danh sách địa bàn (Thêm, Sửa, Xóa) */}
      <Modal
        isOpen={isManageModalOpen}
        onClose={() => {
          setIsManageModalOpen(false);
          setEditingIndex(null);
        }}
        title="Quản Lý Danh Sách Địa Bàn Phụ Trách Có Sẵn"
        size="md"
        footer={
          <div className="flex justify-end w-full">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsManageModalOpen(false);
                setEditingIndex(null);
              }}
            >
              Hoàn tất
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Thêm mới địa bàn */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTerritoryName}
              onChange={(e) => setNewTerritoryName(e.target.value)}
              placeholder="Nhập tên địa bàn mới muốn thêm..."
              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTerritory();
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddTerritory}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Thêm
            </Button>
          </div>

          {/* Danh sách địa bàn */}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-750">
            {territories.map((t, idx) => (
              <div
                key={idx}
                className="p-2.5 px-3 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs"
              >
                {editingIndex === idx ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="flex-1 px-2 py-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(idx)}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      title="Lưu thay đổi"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(null)}
                      className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Hủy"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate flex-1">
                      {t}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(idx)}
                        className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Sửa tên địa bàn"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Xóa địa bàn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400">
            Danh sách này được lưu tự động trên trình duyệt và sẽ xuất hiện trong menu chọn khi tạo hoặc sửa tài khoản nhân sự.
          </p>
        </div>
      </Modal>
    </div>
  );
};
