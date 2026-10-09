import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Star,
  RefreshCw,
  Info,
  ChevronRight,
  Scale,
  Barcode,
  FileText,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Search,
  Package,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { CurrencyInput } from '../../components/common/CurrencyInput';
import { productService } from '../../services/productService';
import { unitConfigService } from '../../mock/unitConversions';
import { Product, ProductUnitConfig, UnitConversion } from '../../types/Product';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency } from '../../utils/formatters';

// ─── Sub-components (must be defined OUTSIDE parent to follow React Rules of Hooks) ───

interface ConversionCardProps {
  unit: UnitConversion;
  baseUnit: string;
  onEdit: (unit: UnitConversion) => void;
  onDelete: (id: string) => void;
  onSetBase: (id: string) => void;
}

const ConversionCard: React.FC<ConversionCardProps> = ({
  unit,
  baseUnit,
  onEdit,
  onDelete,
  onSetBase,
}) => {
  return (
    <div
      className={`relative rounded-2xl border transition-all duration-200 hover:shadow-md group ${
        unit.isBase
          ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 shadow-sm'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      {/* Base indicator ribbon */}
      {unit.isBase && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Star className="w-2.5 h-2.5" />
          Cơ sở
        </div>
      )}

      <div className="p-5">
        {/* Unit name & ratio */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {unit.unitName}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {unit.isBase ? (
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">Đơn vị gốc — tỷ lệ 1:1</span>
              ) : (
                <>
                  1 <span className="font-semibold text-slate-700 dark:text-slate-300">{unit.unitName}</span>
                  {' = '}
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{unit.ratio}</span>
                  {' '}
                  {baseUnit}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Detail rows */}
        <div className="space-y-2.5 text-xs">
          {unit.barcode && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-mono">{unit.barcode}</span>
            </div>
          )}
          {unit.salePrice !== undefined && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(unit.salePrice)}
              </span>
              <span className="text-slate-400">/ {unit.unitName}</span>
            </div>
          )}
          {unit.notes && (
            <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
              <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="italic">{unit.notes}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => onEdit(unit)}
            className="flex-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 py-1.5 rounded-lg transition-colors"
          >
            Chỉnh sửa
          </button>
          {!unit.isBase && (
            <>
              <button
                onClick={() => onSetBase(unit.id)}
                className="flex-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 py-1.5 rounded-lg transition-colors"
              >
                Đặt cơ sở
              </button>
              <button
                onClick={() => onDelete(unit.id)}
                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Conversion Preview Table ───
interface ConversionPreviewProps {
  units: UnitConversion[];
  baseUnit: string;
}

const ConversionPreview: React.FC<ConversionPreviewProps> = ({ units, baseUnit }) => {
  const [inputQty, setInputQty] = useState<string>('1');
  const [fromUnitId, setFromUnitId] = useState<string>(units[0]?.id ?? '');

  const fromUnit = units.find((u) => u.id === fromUnitId);
  const parsedQty = parseInt(inputQty, 10) || 0;

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/40 dark:from-slate-900 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-4 h-4 text-indigo-500" />
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Bảng Quy Đổi Thực Tế</h4>
      </div>

      {/* Input picker */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1" htmlFor="preview-qty">Số lượng</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputQty}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              setInputQty(val);
            }}
            onBlur={() => {
              if (!inputQty || parseInt(inputQty, 10) < 1) {
                setInputQty('1');
              }
            }}
            placeholder="1"
            className="w-full text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            id="preview-qty"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1" htmlFor="preview-unit">Đơn vị</label>
          <select
            value={fromUnitId}
            onChange={(e) => setFromUnitId(e.target.value)}
            className="w-full text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            id="preview-unit"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.unitName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-2">
        {units.map((u) => {
          if (!fromUnit) return null;
          const displayQty = parsedQty > 0 ? parsedQty : (inputQty === '' ? 0 : 1);
          const baseQty = displayQty * fromUnit.ratio;
          const result = u.isBase ? baseQty : baseQty / u.ratio;
          const isTarget = u.id === fromUnitId;
          return (
            <div
              key={u.id}
              className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm transition-all ${
                isTarget
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {u.isBase && <Star className={`w-3 h-3 ${isTarget ? 'text-indigo-200' : 'text-amber-400'}`} />}
                <span className="font-medium">{u.unitName}</span>
                {u.isBase && <span className={`text-[10px] ${isTarget ? 'text-indigo-200' : 'text-slate-400'}`}>(cơ sở)</span>}
              </div>
              <span className={`font-bold text-base ${isTarget ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`}>
                {Number.isInteger(result) ? result : result.toFixed(3).replace(/\.?0+$/, '')}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 mt-3 text-center">
        Đơn vị cơ sở: <strong>{baseUnit}</strong>
      </p>
    </div>
  );
};

// ─── Unit Form ───
const TECH_UNITS = [
  'Chiếc',
  'Cái',
  'Hộp',
  'Thùng',
  'Bộ',
  'Gói',
  'Kiện',
];

const EMPTY_UNIT: Omit<UnitConversion, 'id'> = {
  unitName: '',
  ratio: 1,
  isBase: false,
  barcode: '',
  salePrice: undefined,
  notes: '',
};

interface UnitFormProps {
  initial?: UnitConversion;
  baseUnitName: string;
  onSave: (data: Omit<UnitConversion, 'id'>) => void;
  onCancel: () => void;
}

const UnitForm: React.FC<UnitFormProps> = ({ initial, baseUnitName, onSave, onCancel }) => {
  const [form, setForm] = useState<Omit<UnitConversion, 'id'>>(
    initial
      ? { unitName: initial.unitName, ratio: initial.ratio, isBase: initial.isBase, barcode: initial.barcode ?? '', salePrice: initial.salePrice, notes: initial.notes ?? '' }
      : { ...EMPTY_UNIT }
  );
  const isInitialCustom = initial?.unitName ? !TECH_UNITS.includes(initial.unitName) : false;
  const [isCustomUnit, setIsCustomUnit] = useState<boolean>(isInitialCustom);
  const [ratioStr, setRatioStr] = useState<string>(String(initial?.ratio ?? 1));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSelectUnit = (val: string) => {
    if (val === '__custom__') {
      setIsCustomUnit(true);
      setForm((prev) => ({ ...prev, unitName: '' }));
    } else {
      setIsCustomUnit(false);
      setForm((prev) => ({ ...prev, unitName: val }));
    }
    if (errors.unitName) {
      setErrors((prev) => ({ ...prev, unitName: '' }));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.unitName.trim()) errs.unitName = 'Vui lòng chọn hoặc nhập tên đơn vị tính';
    if (!form.isBase) {
      const parsed = parseInt(ratioStr, 10);
      if (!ratioStr.trim() || isNaN(parsed) || parsed < 1) {
        errs.ratio = 'Hệ số phải là số nguyên ≥ 1';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const finalRatio = form.isBase ? 1 : Math.max(1, parseInt(ratioStr, 10) || 1);
    onSave({
      ...form,
      ratio: finalRatio,
    });
  };

  return (
    <div className="space-y-4">
      {/* Unit name */}
      <div>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="unit-form-name">
          Tên đơn vị tính <span className="text-rose-500">*</span>
        </label>
        <select
          id="unit-form-name"
          value={isCustomUnit ? '__custom__' : (form.unitName || '')}
          onChange={(e) => handleSelectUnit(e.target.value)}
          className={`w-full text-sm bg-white dark:bg-slate-800 border rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
            errors.unitName ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-600'
          } ${
            form.unitName
              ? 'text-slate-900 dark:text-white font-medium'
              : 'text-slate-400 dark:text-slate-400 font-normal'
          }`}
        >
          <option value="" disabled className="text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800">
            Chọn đơn vị tính
          </option>
          {TECH_UNITS.map((u) => (
            <option key={u} value={u} className="text-slate-900 dark:text-white bg-white dark:bg-slate-800 font-medium">
              {u}
            </option>
          ))}
          <option value="__custom__" className="text-slate-900 dark:text-white bg-white dark:bg-slate-800">
            Khác (Tự nhập đơn vị riêng...)
          </option>
        </select>

        {/* Custom text input if "Khác" is selected */}
        {isCustomUnit && (
          <div className="mt-2">
            <input
              type="text"
              placeholder="Nhập tên đơn vị tính riêng (VD: Lô, Khay...)"
              value={form.unitName}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, unitName: e.target.value }));
                if (errors.unitName) setErrors((prev) => ({ ...prev, unitName: '' }));
              }}
              className="w-full text-sm bg-white dark:bg-slate-800 border border-indigo-400 dark:border-indigo-500 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              autoFocus
            />
          </div>
        )}

        {/* Quick select chips for tech products */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[11px] text-slate-400 dark:text-slate-400 mr-0.5">Gợi ý nhanh:</span>
          {TECH_UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => handleSelectUnit(u)}
              className={`px-2 py-0.5 rounded-lg text-xs transition-colors ${
                form.unitName === u && !isCustomUnit
                  ? 'bg-indigo-600 text-white font-medium shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-transparent dark:border-slate-700/60'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {errors.unitName && (
          <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {errors.unitName}
          </p>
        )}
      </div>

      {/* Is base toggle */}
      <div className="flex items-center justify-between p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
        <div>
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Là đơn vị cơ sở?</p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Đơn vị cơ sở có hệ số quy đổi = 1</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const nextIsBase = !form.isBase;
            setForm((prev) => ({ ...prev, isBase: nextIsBase, ratio: nextIsBase ? 1 : (parseInt(ratioStr, 10) || 1) }));
            if (nextIsBase) setRatioStr('1');
          }}
          id="unit-form-isbase"
          className={`relative flex items-center w-10 h-6 rounded-full transition-colors ${form.isBase ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              form.isBase ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Ratio */}
      {!form.isBase && (
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="unit-form-ratio">
            Hệ số quy đổi <span className="text-rose-500">*</span>
            <span className="ml-1 text-slate-400 font-normal">(1 {form.unitName || '???'} = ? {baseUnitName})</span>
          </label>
          <div className="relative">
            <input
              id="unit-form-ratio"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="VD: 1, 6, 12, 24 (nếu 1 thùng = 24 chiếc)"
              value={ratioStr}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                setRatioStr(val);
                if (errors.ratio) setErrors((prev) => ({ ...prev, ratio: '' }));
              }}
              onBlur={() => {
                if (!ratioStr || parseInt(ratioStr, 10) < 1) {
                  setRatioStr('1');
                  setForm((prev) => ({ ...prev, ratio: 1 }));
                } else {
                  setForm((prev) => ({ ...prev, ratio: parseInt(ratioStr, 10) }));
                }
              }}
              className={`w-full text-sm bg-white dark:bg-slate-800 border rounded-xl px-3.5 py-2.5 pr-20 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                errors.ratio ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-600'
              } text-slate-900 dark:text-white`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">
              {baseUnitName}
            </span>
          </div>
          {errors.ratio && (
            <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {errors.ratio}
            </p>
          )}
        </div>
      )}

      {/* Barcode */}
      <div>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="unit-form-barcode">
          Barcode (tùy chọn)
        </label>
        <input
          id="unit-form-barcode"
          type="text"
          placeholder="Mã barcode riêng cho đơn vị này"
          value={form.barcode ?? ''}
          onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-slate-900 dark:text-white"
        />
      </div>

      {/* Sale price */}
      <div>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="unit-form-price">
          Giá bán theo đơn vị này (tùy chọn)
        </label>
        <CurrencyInput
          id="unit-form-price"
          placeholder="Để trống nếu dùng giá bán gốc (VD: 1.000.000)"
          value={form.salePrice ?? null}
          onChange={(val) => setForm((prev) => ({ ...prev, salePrice: val > 0 ? val : undefined }))}
          suffix="VNĐ"
          className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-slate-900 dark:text-white font-medium"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="unit-form-notes">
          Ghi chú (tùy chọn)
        </label>
        <textarea
          id="unit-form-notes"
          rows={2}
          placeholder="VD: Thùng 24 lon, dùng cho nhập kho..."
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-slate-900 dark:text-white resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button variant="secondary" size="sm" onClick={onCancel} className="flex-1">
          Hủy
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          className="flex-1"
          leftIcon={<CheckCircle2 className="w-4 h-4" />}
        >
          {initial ? 'Cập nhật' : 'Thêm đơn vị'}
        </Button>
      </div>
    </div>
  );
};

// ─── Product Picker Row ───
interface ProductRowProps {
  product: Product;
  hasConfig: boolean;
  isSelected: boolean;
  onSelect: (p: Product) => void;
}

const ProductRow: React.FC<ProductRowProps> = ({ product, hasConfig, isSelected, onSelect }) => (
  <button
    onClick={() => onSelect(product)}
    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors rounded-xl ${
      isSelected
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
    }`}
  >
    <div className="flex-1 min-w-0">
      <p className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
        {product.name}
      </p>
      <p className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
        <span className="font-mono">{product.sku}</span> · <span>{product.unit}</span>
      </p>
    </div>
    <div className="flex items-center gap-1.5 shrink-0 ml-2">
      {hasConfig && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          isSelected ? 'bg-indigo-500 text-white' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
        }`}>
          Đã có
        </span>
      )}
      <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`} />
    </div>
  </button>
);

// ─── Main Page ───
export const ProductUnitPage: React.FC = () => {
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [unitConfig, setUnitConfig] = useState<ProductUnitConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitConversion | undefined>(undefined);

  useEffect(() => {
    productService.getAll().then((data) => {
      setProducts(data);
      setLoadingProducts(false);
    });
  }, []);

  const allConfigs = unitConfigService.getAll();

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
    const existing = unitConfigService.getByProductId(product.id);
    if (existing) {
      setUnitConfig(existing);
    } else {
      setUnitConfig({
        productId: product.id,
        baseUnit: product.unit,
        updatedAt: '',
        units: [
          {
            id: `u-${product.id}-base`,
            unitName: product.unit,
            ratio: 1,
            isBase: true,
          },
        ],
      });
    }
  }, []);

  const handleAddOrUpdateUnit = (data: Omit<UnitConversion, 'id'>) => {
    if (!unitConfig) return;
    if (editingUnit) {
      const updated = unitConfig.units.map((u) =>
        u.id === editingUnit.id ? { ...u, ...data } : u
      );
      setUnitConfig({ ...unitConfig, units: updated });
    } else {
      const newUnit: UnitConversion = {
        ...data,
        id: `u-${unitConfig.productId}-${Date.now()}`,
      };
      let newUnits = data.isBase
        ? unitConfig.units.map((u) => ({ ...u, isBase: false }))
        : [...unitConfig.units];
      newUnits = [...newUnits, newUnit];
      setUnitConfig({
        ...unitConfig,
        units: newUnits,
        baseUnit: data.isBase ? data.unitName : unitConfig.baseUnit,
      });
    }
    setIsFormOpen(false);
    setEditingUnit(undefined);
  };

  const handleDeleteUnit = (id: string) => {
    if (!unitConfig) return;
    const remaining = unitConfig.units.filter((u) => u.id !== id);
    const updatedConfig = { ...unitConfig, units: remaining };
    setUnitConfig(updatedConfig);
    // Auto-save ngay lập tức để tránh mất dữ liệu khi chuyển sản phẩm
    unitConfigService.save(updatedConfig);
    showToast('Đã xóa đơn vị tính và lưu tự động', 'success');
  };

  const handleSetBase = (id: string) => {
    if (!unitConfig) return;
    const targetUnit = unitConfig.units.find((u) => u.id === id);
    if (!targetUnit) return;
    const updated = unitConfig.units.map((u) => ({
      ...u,
      isBase: u.id === id,
      ratio: u.id === id ? 1 : u.ratio,
    }));
    const updatedConfig = { ...unitConfig, units: updated, baseUnit: targetUnit.unitName };
    setUnitConfig(updatedConfig);
    // Auto-save để tránh mất thay đổi khi chuyển sản phẩm
    unitConfigService.save(updatedConfig);
    showToast(`Đã đặt "${targetUnit.unitName}" làm đơn vị cơ sở`, 'info');
  };

  const handleSave = async () => {
    if (!unitConfig || !selectedProduct) return;
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      unitConfigService.save(unitConfig);
      showToast('Đã lưu cấu hình đơn vị tính thành công!', 'success');
    } catch {
      showToast('Lỗi khi lưu cấu hình', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openAddForm = () => {
    setEditingUnit(undefined);
    setIsFormOpen(true);
  };

  const openEditForm = (unit: UnitConversion) => {
    setEditingUnit(unit);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingUnit(undefined);
  };

  const baseUnit = unitConfig?.baseUnit ?? selectedProduct?.unit ?? '';

  return (
    <PageContainer
      title="Khai Báo Đơn Vị Tính"
      subtitle="Quản lý đơn vị tính và hệ số quy đổi cho từng SKU sản phẩm trong danh mục"
      actions={
        <div className="flex items-center gap-2">
          <Link to="/products">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh mục
            </Button>
          </Link>
          {selectedProduct && unitConfig && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Save className="w-4 h-4" />}
              onClick={handleSave}
              isLoading={saving}
              id="save-unit-config-btn"
            >
              Lưu cấu hình
            </Button>
          )}
        </div>
      }
    >
      {/* Info Banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <strong>Hướng dẫn:</strong> Chọn sản phẩm ở cột trái → Khai báo danh sách đơn vị tính → Chọn{' '}
          <strong>đơn vị cơ sở</strong> → Nhập hệ số quy đổi → Nhấn <strong>Lưu cấu hình</strong>.
          <br />
          Đơn vị cơ sở là đơn vị nhỏ nhất (VD: Chiếc). Các đơn vị khác (Thùng, Lốc) khai báo số lượng đơn vị cơ sở tương đương.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Left Panel: Product Picker ── */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Chọn Sản Phẩm</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-slate-900 dark:text-white"
                  id="product-unit-search"
                />
              </div>
            </div>

            <div className="p-2 max-h-[520px] overflow-y-auto space-y-0.5">
              {loadingProducts ? (
                <Loading text="Đang tải..." />
              ) : filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Không tìm thấy sản phẩm</p>
              ) : (
                filteredProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    hasConfig={!!allConfigs[p.id]}
                    isSelected={selectedProduct?.id === p.id}
                    onSelect={handleSelectProduct}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right Panel: Unit Config ── */}
        <div className="lg:col-span-8 xl:col-span-9">
          {!selectedProduct ? (
            <EmptyState
              title="Chưa chọn sản phẩm"
              description="Chọn một sản phẩm từ cột bên trái để bắt đầu khai báo đơn vị tính."
            />
          ) : (
            <div className="space-y-6">
              {/* Product Header */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Package className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white truncate">{selectedProduct.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    SKU: <strong className="font-mono">{selectedProduct.sku}</strong> · Đơn vị mặc định: <strong>{selectedProduct.unit}</strong>
                  </p>
                </div>
                <Badge
                  variant={unitConfig && unitConfig.units.length > 1 ? 'success' : 'neutral'}
                  size="sm"
                  dot
                >
                  {unitConfig ? `${unitConfig.units.length} đơn vị` : 'Chưa có'}
                </Badge>
              </div>

              {/* Units Grid */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Danh sách đơn vị tính</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Đơn vị cơ sở:{' '}
                      <strong className="text-indigo-600 dark:text-indigo-400">{baseUnit}</strong>
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={openAddForm}
                    id="add-unit-btn"
                  >
                    Thêm đơn vị
                  </Button>
                </div>

                {unitConfig && unitConfig.units.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {unitConfig.units.map((unit) => (
                      <ConversionCard
                        key={unit.id}
                        unit={unit}
                        baseUnit={baseUnit}
                        onEdit={openEditForm}
                        onDelete={handleDeleteUnit}
                        onSetBase={handleSetBase}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-10 text-center">
                    <Scale className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">
                      Chưa có đơn vị nào. Nhấn "Thêm đơn vị" để bắt đầu.
                    </p>
                  </div>
                )}
              </div>

              {/* Conversion Preview */}
              {unitConfig && unitConfig.units.length > 1 && (
                <ConversionPreview units={unitConfig.units} baseUnit={baseUnit} />
              )}

              {/* Last updated */}
              {unitConfig && unitConfig.updatedAt && (
                <p className="text-[11px] text-slate-400 text-right">
                  Cập nhật lần cuối: {unitConfig.updatedAt}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Add/Edit Unit Modal ── */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingUnit ? 'Chỉnh Sửa Đơn Vị Tính' : 'Thêm Đơn Vị Tính Mới'}
        subtitle={selectedProduct ? `Sản phẩm: ${selectedProduct.name}` : undefined}
        maxWidth="md"
        footer={null}
      >
        {selectedProduct && unitConfig && (
          <UnitForm
            initial={editingUnit}
            baseUnitName={baseUnit}
            onSave={handleAddOrUpdateUnit}
            onCancel={closeForm}
          />
        )}
      </Modal>
    </PageContainer>
  );
};
