import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Tag,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Lock,
  Copy,
  Percent,
  Sparkles,
  Search,
  Layers,
  ArrowRight,
  ShieldAlert,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../common/Button';
import {
  PriceList,
  PriceListItem,
  PriceListCreatePayload,
  PriceListUpdatePayload,
  priceListService,
  CUSTOMER_GROUPS,
  ConflictingPriceListBrief,
} from '../../services/priceListService';
import { Product } from '../../types/Product';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PriceListFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  initialData?: PriceList | null;
  availableProducts: Product[];
  onTriggerClone?: (pl: PriceList) => void;
}

export const PriceListFormModal: React.FC<PriceListFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  mode,
  initialData,
  availableProducts,
  onTriggerClone,
}) => {
  const { showToast } = useToast();

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [customerGroup, setCustomerGroup] = useState('TIER_1');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Pre-flight overlap check state
  const [overlapConflicts, setOverlapConflicts] = useState<ConflictingPriceListBrief[]>([]);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  const overlapDebounceTimer = useRef<any>(null);

  // Initialize or reset form values
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && initialData) {
      setCode(initialData.code);
      setName(initialData.name);
      setCustomerGroup(initialData.customer_group);
      setValidFrom(initialData.valid_from ? initialData.valid_from.split('T')[0] : '');
      setValidTo(initialData.valid_to ? initialData.valid_to.split('T')[0] : '');

      // Load existing items or copy
      const existingItems: PriceListItem[] = (initialData.items || []).map((it) => ({
        id: it.id,
        price_list_id: it.price_list_id,
        product_id: it.product_id,
        product_sku: it.product_sku,
        product_name: it.product_name,
        unit: it.unit || 'Chiếc',
        listed_price: it.listed_price,
        floor_price: it.floor_price,
        sale_price: it.sale_price,
        discount_percent: it.discount_percent,
        requires_approval: it.sale_price < it.floor_price,
      }));
      setItems(existingItems);
    } else {
      // Create mode: prefill defaults
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const randomSuffix = Math.floor(100 + Math.random() * 900);

      setCode(`PL-TIER1-${randomSuffix}`);
      setName('Bảng giá Đại lý Cấp 1 - Quý này');
      setCustomerGroup('TIER_1');
      setValidFrom(today);
      setValidTo(nextMonth);

      // Default sample items if available
      if (availableProducts.length > 0) {
        const defaultItems: PriceListItem[] = availableProducts.slice(0, 3).map((p) => {
          const cost = p.costPrice || 20000000;
          const listed = p.salePrice || 25000000;
          const floor = Math.round(cost * 1.05);
          const sale = Math.round(listed * 0.9);
          return {
            product_id: p.id,
            product_sku: p.sku,
            product_name: p.name,
            unit: p.unit || 'Chiếc',
            listed_price: listed,
            floor_price: floor,
            sale_price: sale,
            discount_percent: Math.round(((listed - sale) / listed) * 100),
            requires_approval: sale < floor,
          };
        });
        setItems(defaultItems);
      } else {
        setItems([]);
      }
    }
  }, [isOpen, mode, initialData, availableProducts]);

  // Pre-flight check for overlapping date ranges (SCRUM-417)
  useEffect(() => {
    if (!isOpen || !customerGroup || !validFrom) {
      setOverlapConflicts([]);
      return;
    }

    if (overlapDebounceTimer.current) {
      clearTimeout(overlapDebounceTimer.current);
    }

    overlapDebounceTimer.current = setTimeout(async () => {
      try {
        setCheckingOverlap(true);
        const res = await priceListService.checkOverlap(
          customerGroup,
          new Date(validFrom).toISOString(),
          validTo ? new Date(validTo).toISOString() : null,
          mode === 'edit' && initialData ? initialData.id : undefined
        );
        if (res.has_overlap && res.conflicts?.length > 0) {
          setOverlapConflicts(res.conflicts);
        } else {
          setOverlapConflicts([]);
        }
      } catch (err) {
        // Silently handle overlap check failure
        setOverlapConflicts([]);
      } finally {
        setCheckingOverlap(false);
      }
    }, 450);

    return () => {
      if (overlapDebounceTimer.current) {
        clearTimeout(overlapDebounceTimer.current);
      }
    };
  }, [customerGroup, validFrom, validTo, mode, initialData, isOpen]);

  // Check if locked due to orders
  const isLocked = mode === 'edit' && Boolean(initialData?.has_orders || initialData?.is_locked);
  const isPendingApproval = mode === 'edit' && initialData?.status === 'PENDING_APPROVAL';
  const isRejected = mode === 'edit' && initialData?.status === 'REJECTED';
  const isExpired = mode === 'edit' && Boolean(initialData?.is_expired);

  // Detect sub-floor items
  const hasSubFloorPrice = useMemo(() => {
    return items.some((it) => it.sale_price < it.floor_price);
  }, [items]);

  const subFloorCount = useMemo(() => {
    return items.filter((it) => it.sale_price < it.floor_price).length;
  }, [items]);

  // Adding an item to table
  const handleAddItem = (productId: string) => {
    if (isLocked) return;

    const p = availableProducts.find((item) => item.id === productId);
    if (!p) return;

    if (items.some((it) => it.product_id === p.id)) {
      showToast('Sản phẩm này đã có trong danh sách bảng giá', 'warning');
      return;
    }

    const cost = p.costPrice || 10000000;
    const listed = p.salePrice || 12000000;
    const floor = Math.round(cost * 1.05);
    const sale = Math.round(listed * 0.92);

    const newItem: PriceListItem = {
      product_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      unit: p.unit || 'Chiếc',
      listed_price: listed,
      floor_price: floor,
      sale_price: sale,
      discount_percent: Math.round(((listed - sale) / listed) * 100),
      requires_approval: sale < floor,
    };
    setItems([...items, newItem]);
  };

  // Add all products from catalog
  const handleAddAllProducts = () => {
    if (isLocked) return;

    const newItems: PriceListItem[] = [];
    availableProducts.forEach((p) => {
      if (!items.some((it) => it.product_id === p.id)) {
        const cost = p.costPrice || 10000000;
        const listed = p.salePrice || 12000000;
        const floor = Math.round(cost * 1.05);
        const sale = Math.round(listed * 0.9);
        newItems.push({
          product_id: p.id,
          product_sku: p.sku,
          product_name: p.name,
          unit: p.unit || 'Chiếc',
          listed_price: listed,
          floor_price: floor,
          sale_price: sale,
          discount_percent: Math.round(((listed - sale) / listed) * 100),
          requires_approval: sale < floor,
        });
      }
    });

    if (newItems.length === 0) {
      showToast('Tất cả sản phẩm đã có trong bảng giá', 'info');
      return;
    }

    setItems([...items, ...newItems]);
    showToast(`Đã thêm ${newItems.length} sản phẩm vào bảng giá!`, 'success');
  };

  // Updating single item price
  const handleUpdateItemSalePrice = (index: number, newSalePrice: number) => {
    if (isLocked) return;

    const updated = [...items];
    const target = updated[index];
    target.sale_price = newSalePrice;
    target.requires_approval = newSalePrice < target.floor_price;
    if (target.listed_price > 0) {
      target.discount_percent = Math.round(
        ((target.listed_price - newSalePrice) / target.listed_price) * 100
      );
    }
    setItems(updated);
  };

  // Bulk price discount adjustment
  const handleBatchAdjust = (percentDiscount: number) => {
    if (isLocked) return;

    const updated = items.map((it) => {
      const sale = Math.round(it.listed_price * (1 - percentDiscount / 100));
      return {
        ...it,
        sale_price: sale,
        discount_percent: percentDiscount,
        requires_approval: sale < it.floor_price,
      };
    });
    setItems(updated);
    showToast(`Đã áp dụng mức chiết khấu ${percentDiscount}% cho toàn bộ mặt hàng!`, 'info');
  };

  // Remove item from table
  const handleRemoveItem = (index: number) => {
    if (isLocked) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLocked) {
      showToast('Bảng giá đã bị khóa do có đơn hàng phát sinh. Vui lòng tạo phiên bản mới!', 'error');
      return;
    }

    if (!code.trim() || !name.trim() || !validFrom) {
      showToast('Vui lòng điền đầy đủ các thông tin bắt buộc', 'warning');
      return;
    }

    if (validTo && validTo < validFrom) {
      showToast('Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực', 'warning');
      return;
    }

    if (items.length === 0) {
      showToast('Vui lòng thêm ít nhất 1 sản phẩm vào bảng giá', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const payload: PriceListCreatePayload = {
          code: code.trim(),
          name: name.trim(),
          customer_group: customerGroup,
          valid_from: new Date(validFrom).toISOString(),
          valid_to: validTo ? new Date(validTo).toISOString() : null,
          items: items,
        };

        const res = await priceListService.create(payload);
        showToast(
          res.status === 'PENDING_APPROVAL'
            ? 'Bảng giá đã tạo và chuyển sang trạng thái CHỜ DUYỆT do có sản phẩm bán dưới giá sàn!'
            : 'Tạo bảng giá mới thành công!',
          res.status === 'PENDING_APPROVAL' ? 'warning' : 'success'
        );
      } else if (mode === 'edit' && initialData) {
        const updatePayload: PriceListUpdatePayload = {
          name: name.trim(),
          customer_group: customerGroup,
          valid_from: new Date(validFrom).toISOString(),
          valid_to: validTo ? new Date(validTo).toISOString() : null,
          items: items,
        };

        const res = await priceListService.update(initialData.id, updatePayload);
        showToast(
          res.status === 'PENDING_APPROVAL'
            ? 'Bảng giá đã cập nhật và chuyển sang trạng thái CHỜ DUYỆT do có sản phẩm dưới sàn!'
            : 'Cập nhật bảng giá thành công!',
          res.status === 'PENDING_APPROVAL' ? 'warning' : 'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.data?.detail || err.message || 'Lỗi khi lưu bảng giá';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        className="w-full max-w-5xl lg:max-w-6xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl ${
                isLocked
                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {isLocked ? <Lock className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {mode === 'create'
                    ? 'Khai Báo Bảng Giá Phân Phối'
                    : `Chỉnh Sửa Bảng Giá: ${initialData?.code}`}
                </h3>
                {isLocked && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> ĐÃ KHÓA SỬA
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {mode === 'create'
                  ? 'Quy định giá bán, giá sàn và thời hạn hiệu lực cho từng cấp đại lý'
                  : 'Cập nhật chính sách giá, thời gian hiệu lực và danh mục sản phẩm'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. LOCK WARNING BANNER (When locked due to existing orders) */}
        {isLocked && initialData && (
          <div className="mx-6 mt-6 p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
              <div className="text-xs text-purple-900 dark:text-purple-200">
                <h4 className="font-bold text-sm mb-0.5">BẢNG GIÁ ĐÃ BỊ KHÓA SỬA ĐỔI HOÀN TOÀN</h4>
                <p className="leading-relaxed">
                  Bảng giá này đã phát sinh <strong>{initialData.orders_count} đơn hàng</strong> trong hệ thống.
                  Mọi thao tác sửa đổi trực tiếp đã bị khóa vĩnh viễn để bảo toàn lịch sử hóa đơn. Để điều chỉnh giá
                  cho nhóm khách hàng này, vui lòng sử dụng tính năng <strong>Tạo phiên bản kế thừa (v{initialData.version + 1})</strong>.
                </p>
              </div>
            </div>
            {onTriggerClone && (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => {
                  onClose();
                  onTriggerClone(initialData);
                }}
                className="shrink-0 gap-1.5 text-xs shadow-md bg-purple-600 hover:bg-purple-700"
              >
                <Copy className="w-3.5 h-3.5" /> Tạo phiên bản kế thừa ngay
              </Button>
            )}
          </div>
        )}

        {/* 2. PENDING APPROVAL WARNING BANNER */}
        {!isLocked && isPendingApproval && (
          <div className="mx-6 mt-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm mb-0.5">BẢNG GIÁ ĐANG TRONG TRẠNG THÁI CHỜ DUYỆT</h4>
              <p>
                Bảng giá này đang chờ Quản lý kinh doanh / Giám đốc phê duyệt do có dòng giá bán dưới sàn. Nếu bạn sửa đổi
                và lưu lại, hệ thống sẽ tự động đánh giá lại trạng thái duyệt theo danh mục giá mới.
              </p>
            </div>
          </div>
        )}

        {/* 3. REJECTED WARNING BANNER */}
        {!isLocked && isRejected && (
          <div className="mx-6 mt-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 flex items-start gap-3 text-xs text-rose-900 dark:text-rose-200">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm mb-0.5">BẢNG GIÁ ĐÃ BỊ TỪ CHỐI PHÊ DUYỆT</h4>
              <p>
                Lý do từ chối: <strong>{initialData?.approval_note || 'Chưa đạt mức biên lợi nhuận quy định'}</strong>.
                Hãy điều chỉnh lại giá bán các sản phẩm vượt qua giá sàn hoặc đề xuất mức giá hợp lý hơn trước khi lưu lại.
              </p>
            </div>
          </div>
        )}

        {/* 4. EXPIRED WARNING BANNER */}
        {!isLocked && isExpired && (
          <div className="mx-6 mt-6 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
            <Clock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm mb-0.5">BẢNG GIÁ ĐÃ HẾT HẠN HIỆU LỰC</h4>
              <p>
                Bảng giá này đã kết thúc thời gian áp dụng vào ngày {formatDate(initialData?.valid_to || '')}.
                Bạn nên tạo một phiên bản kế thừa mới cho chu kỳ kinh doanh hiện tại thay vì sửa bảng giá cũ.
              </p>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* General Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mã bảng giá *
                </label>
                <input
                  type="text"
                  required
                  disabled={mode === 'edit' || isLocked}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="VD: PL-TIER1-2026"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên bảng giá *
                </label>
                <input
                  type="text"
                  required
                  disabled={isLocked}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Bảng giá Đại lý Cấp 1 Toàn quốc"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nhóm khách hàng áp dụng *
                </label>
                <select
                  disabled={isLocked}
                  value={customerGroup}
                  onChange={(e) => {
                    const newGrp = e.target.value;
                    setCustomerGroup(newGrp);
                    if (mode === 'create') {
                      setCode(`PL-${newGrp}-${Math.floor(100 + Math.random() * 900)}`);
                      const grpLabel = CUSTOMER_GROUPS.find((g) => g.value === newGrp)?.label || newGrp;
                      setName(`Bảng giá ${grpLabel} - Áp dụng mới`);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {CUSTOMER_GROUPS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label} ({g.description})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Effective Dates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Ngày bắt đầu hiệu lực *
                </label>
                <input
                  type="date"
                  required
                  disabled={isLocked}
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Ngày kết thúc hiệu lực (Để trống nếu vô thời hạn)
                </label>
                <input
                  type="date"
                  disabled={isLocked}
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Real-time Overlap Conflict Warning Banner (SCRUM-417) */}
            {overlapConflicts.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>CẢNH BÁO CHỒNG LẤN THỜI GIAN HIỆU LỰC:</span>
                </div>
                <p>
                  Khoảng thời gian này đang bị trùng lặp với bảng giá đang áp dụng cho nhóm này:
                </p>
                <div className="space-y-1 pl-4">
                  {overlapConflicts.map((c) => (
                    <div key={c.id} className="font-medium text-[11px] flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
                        {c.code} (v{c.version})
                      </span>
                      <span>- {c.name}:</span>
                      <span className="tabular-nums">
                        {formatDate(c.valid_from)} {c.valid_to ? `→ ${formatDate(c.valid_to)}` : '→ Vô thời hạn'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                  💡 Gợi ý: Khi phê duyệt bảng giá này, hệ thống sẽ cung cấp tùy chọn "Tự động ngắt ngày hiệu lực bản cũ"
                  để bảng giá mới có thể kích hoạt ngay lập tức.
                </p>
              </div>
            )}

            {/* Sub-floor Price Alert (SCRUM-418, SCRUM-421) */}
            {hasSubFloorPrice && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 flex items-start gap-3 text-amber-800 dark:text-amber-200 text-xs animate-pulse">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold">CẢNH BÁO GIÁ SÀN QUY ĐỊNH: </span>
                  Phát hiện có <strong>{subFloorCount} mặt hàng</strong> có <strong className="underline">Giá bán thấp hơn Giá sàn</strong>!
                  Bảng giá này sau khi lưu sẽ tự động chuyển sang trạng thái <strong>CHỜ PHÊ DUYỆT</strong> bởi Quản lý kinh
                  doanh trước khi có thể chính thức áp dụng cho khách hàng.
                </div>
              </div>
            )}

            {/* Products & Line Items Table */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Chi tiết dòng giá sản phẩm ({items.length} mặt hàng)
                  </h4>
                </div>

                {!isLocked && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Add single product dropdown */}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs max-w-xs truncate font-medium"
                    >
                      <option value="">+ Thêm sản phẩm vào bảng...</option>
                      {availableProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </option>
                      ))}
                    </select>

                    {/* Quick Add all */}
                    <button
                      type="button"
                      onClick={handleAddAllProducts}
                      className="px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      Nạp tất cả kho
                    </button>
                  </div>
                )}
              </div>

              {/* Batch Adjustment Bar */}
              {!isLocked && items.length > 0 && (
                <div className="mb-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Áp dụng chiết khấu nhanh cho toàn bộ mặt hàng:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBatchAdjust(10)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:border-indigo-400"
                    >
                      CK 10%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchAdjust(15)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:border-indigo-400"
                    >
                      CK 15%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchAdjust(20)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:border-indigo-400"
                    >
                      CK 20%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchAdjust(5)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:border-indigo-400"
                    >
                      CK 5%
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto shadow-2xs">
                <table className="w-full text-left text-xs border-collapse min-w-[760px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-700 font-semibold">
                      <th className="py-2.5 px-3">Sản phẩm</th>
                      <th className="py-2.5 px-3">ĐVT</th>
                      <th className="py-2.5 px-3 text-right">Giá niêm yết</th>
                      <th className="py-2.5 px-3 text-right">Giá sàn tối thiểu</th>
                      <th className="py-2.5 px-3 text-right">Giá bán áp dụng</th>
                      <th className="py-2.5 px-3 text-center">Chiết khấu</th>
                      <th className="py-2.5 px-3 text-center">Trạng thái sàn</th>
                      {!isLocked && <th className="py-2.5 px-4 text-center w-20">Xóa</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={isLocked ? 7 : 8} className="py-8 text-center text-slate-400">
                          Chưa có sản phẩm nào trong bảng giá. Hãy chọn sản phẩm ở ô bên trên!
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const isBelowFloor = item.sale_price < item.floor_price;
                        return (
                          <tr
                            key={item.product_id}
                            className={
                              isBelowFloor
                                ? 'bg-amber-50/50 dark:bg-amber-950/30'
                                : 'hover:bg-slate-50/50'
                            }
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900 dark:text-white max-w-[200px] truncate text-xs">
                                {item.product_name}
                              </div>
                              <div className="text-[11px] text-slate-400 tabular-nums">
                                {item.product_sku}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-xs">{item.unit}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-500 text-xs font-medium">
                              {formatCurrency(item.listed_price)}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-rose-600 dark:text-rose-400 text-xs">
                              {formatCurrency(item.floor_price)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {isLocked ? (
                                <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                                  {formatCurrency(item.sale_price)}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  step={10000}
                                  value={item.sale_price}
                                  onChange={(e) =>
                                    handleUpdateItemSalePrice(idx, Number(e.target.value) || 0)
                                  }
                                  className={`w-32 px-2.5 py-1 text-right rounded-lg tabular-nums font-bold text-xs border focus:ring-2 ${
                                    isBelowFloor
                                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 focus:ring-amber-500'
                                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-indigo-500 text-slate-900 dark:text-white'
                                  }`}
                                />
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center tabular-nums font-semibold text-indigo-600 text-xs">
                              {item.discount_percent || 0}%
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isBelowFloor ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                  Dưới sàn (-{formatCurrency(item.floor_price - item.sale_price)})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  Hợp lệ
                                </span>
                              )}
                            </td>
                            {!isLocked && (
                              <td className="py-2.5 px-4 text-center w-20">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors inline-flex items-center justify-center"
                                  title="Xóa khỏi bảng giá"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              {isLocked ? (
                <span className="text-purple-600 font-semibold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Bảng giá đã khóa sửa đổi trực tiếp (Có {initialData?.orders_count} đơn)
                </span>
              ) : hasSubFloorPrice ? (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Có {subFloorCount} mặt hàng dưới sàn: Sẽ chuyển sang Chờ duyệt
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Toàn bộ giá bán đều đạt chuẩn
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button" onClick={onClose}>
                {isLocked ? 'Đóng' : 'Hủy'}
              </Button>
              {isLocked && onTriggerClone && initialData && (
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    onClose();
                    onTriggerClone(initialData);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 border-none shadow-md shadow-purple-600/20 gap-1.5"
                >
                  <Copy className="w-4 h-4" /> Tạo phiên bản kế thừa (v{initialData.version + 1})
                </Button>
              )}
              {!isLocked && (
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting
                    ? 'Đang lưu...'
                    : mode === 'create'
                    ? 'Lưu bảng giá'
                    : 'Cập nhật bảng giá'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
