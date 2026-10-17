import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  TrendingUp,
  Package,
  Plus,
  Minus,
  Check,
  Search,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
  Layers,
  Copy,
  CheckSquare,
  Square,
  Clock,
  ArrowRight,
  Filter,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Product } from '../../types/Product';
import { Order } from '../../types/Order';
import { orderService } from '../../services/orderService';
import { purchaseHistoryService } from '../../services/purchaseHistoryService';
import {
  RecentPurchasedItem,
  CategoryGroupedHistory,
  PreviousOrderSummary,
  PreviousOrderItem,
} from '../../types/PurchaseHistory';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

// ─── Các Sub-component tách rời ngoài hàm render chính (Tuân thủ AGENTS.md) ───

interface FrequencyBadgeProps {
  frequency: RecentPurchasedItem['purchaseFrequency'];
}

const FrequencyBadge: React.FC<FrequencyBadgeProps> = ({ frequency }) => {
  if (frequency === 'frequent') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
        <Sparkles className="w-2.5 h-2.5" />
        Mua thường xuyên
      </span>
    );
  }
  if (frequency === 'regular') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
        <RotateCcw className="w-2.5 h-2.5" />
        Mua định kỳ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      Thỉnh thoảng
    </span>
  );
};

interface StockStatusBadgeProps {
  stock: number;
}

const StockStatusBadge: React.FC<StockStatusBadgeProps> = ({ stock }) => {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
        Hết hàng
      </span>
    );
  }
  if (stock <= 10) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        <AlertTriangle className="w-2.5 h-2.5" />
        Còn ít ({stock})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
      Sẵn sàng ({stock})
    </span>
  );
};

// Item card component cho chế độ danh sách
interface HistoryItemCardProps {
  item: RecentPurchasedItem;
  quantityInput: number;
  inCartQty: number;
  isSelected: boolean;
  onToggleSelect: (productId: string) => void;
  onQtyChange: (productId: string, val: number) => void;
  onQuickAdd: (item: RecentPurchasedItem, customQty?: number) => void;
}

const HistoryItemCard: React.FC<HistoryItemCardProps> = ({
  item,
  quantityInput,
  inCartQty,
  isSelected,
  onToggleSelect,
  onQtyChange,
  onQuickAdd,
}) => {
  const isOutOfStock = item.stock <= 0;

  return (
    <div
      className={`p-3 rounded-xl border transition-all ${
        isSelected
          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-sm'
          : inCartQty > 0
          ? 'bg-slate-50/80 dark:bg-slate-800/40 border-indigo-200 dark:border-indigo-900/60'
          : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Checkbox chọn nhanh */}
        <button
          type="button"
          onClick={() => onToggleSelect(item.productId)}
          disabled={isOutOfStock}
          className="p-1 -ml-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title={isSelected ? 'Bỏ chọn mặt hàng này' : 'Chọn nhanh mặt hàng này'}
        >
          {isSelected ? (
            <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-950" />
          ) : (
            <Square className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {/* Hình ảnh sản phẩm */}
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
        )}

        {/* Thông tin sản phẩm */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1 flex-wrap">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
              {item.name}
            </h4>
            <div className="flex items-center gap-1 shrink-0">
              <FrequencyBadge frequency={item.purchaseFrequency} />
              <StockStatusBadge stock={item.stock} />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
            <span>SKU: {item.sku}</span>
            <span>·</span>
            <span>Đơn giá: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(item.unitPrice)}</strong></span>
            {item.category && (
              <>
                <span>·</span>
                <span className="text-slate-400">{item.category}</span>
              </>
            )}
          </div>

          {/* Dòng thống kê lịch sử & Số lượng bình quân + lần mua gần nhất */}
          <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-100/70 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                <span>Bình quân: <strong>{item.avgQuantity} {item.unit}</strong>/đơn</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Lần trước mua: <strong className="text-slate-700 dark:text-slate-300">{item.lastPurchasedQty} {item.unit}</strong>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1 ml-auto">
              <Calendar className="w-3 h-3" />
              <span>Gần nhất: {formatDate(item.lastPurchasedDate)}</span>
            </div>
          </div>

          {/* Thao tác nhập nhanh */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => onQtyChange(item.productId, Math.max(1, quantityInput - 1))}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 disabled:opacity-40 transition"
                title="Giảm số lượng"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="number"
                min={1}
                max={item.stock > 0 ? item.stock : 1}
                disabled={isOutOfStock}
                value={quantityInput}
                onChange={(e) => onQtyChange(item.productId, Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 py-1 text-center font-bold text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-40"
              />
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => onQtyChange(item.productId, quantityInput + 1)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 disabled:opacity-40 transition"
                title="Tăng số lượng"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="text-xs text-slate-400 ml-0.5">{item.unit}</span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {inCartQty > 0 && (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Đã có: {inCartQty}
                </span>
              )}

              {/* Nút 1: Thêm nhanh đúng số lượng bình quân */}
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => onQuickAdd(item, item.avgQuantity)}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 disabled:opacity-40"
                title={`Thêm nhanh số lượng bình quân (${item.avgQuantity} ${item.unit})`}
              >
                <Zap className="w-3 h-3 text-amber-500" />
                <span>+TB ({item.avgQuantity})</span>
              </button>

              {/* Nút 2: Thêm theo số lượng trong ô nhập */}
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => onQuickAdd(item, quantityInput)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-40"
              >
                <ShoppingCart className="w-3 h-3" />
                <span>Thêm</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Card nhóm hàng (Category Group Card - SCRUM-519)
interface CategoryGroupCardProps {
  group: CategoryGroupedHistory;
  selectedIds: Set<string>;
  onToggleGroup: (group: CategoryGroupedHistory) => void;
  onAddGroupToCart: (group: CategoryGroupedHistory) => void;
  renderItem: (item: RecentPurchasedItem) => React.ReactNode;
}

const CategoryGroupCard: React.FC<CategoryGroupCardProps> = ({
  group,
  selectedIds,
  onToggleGroup,
  onAddGroupToCart,
  renderItem,
}) => {
  const [isGroupOpen, setIsGroupOpen] = useState(true);

  const availableItems = group.items.filter((it) => it.stock > 0);
  const isAllSelected =
    availableItems.length > 0 &&
    availableItems.every((it) => selectedIds.has(it.productId));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
      {/* Header nhóm hàng với nút thêm nhanh toàn bộ nhóm */}
      <div className="p-3 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onToggleGroup(group)}
            disabled={availableItems.length === 0}
            className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition"
            title={isAllSelected ? 'Bỏ chọn toàn bộ nhóm' : 'Chọn toàn bộ nhóm hàng'}
          >
            {isAllSelected ? (
              <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsGroupOpen(!isGroupOpen)}
            className="flex items-center gap-1.5 text-left font-bold text-xs sm:text-sm text-slate-900 dark:text-white hover:text-indigo-600 transition"
          >
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">{group.categoryName}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {group.items.length}
            </span>
            {isGroupOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Nút Thêm toàn bộ nhóm hàng này vào đơn (SCRUM-519) */}
          <button
            type="button"
            onClick={() => onAddGroupToCart(group)}
            disabled={availableItems.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-40"
            title={`Thêm tất cả ${availableItems.length} sản phẩm thuộc nhóm ${group.categoryName} theo số lượng bình quân`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Thêm nhóm này (+{availableItems.length} sp)</span>
          </button>
        </div>
      </div>

      {/* Danh sách các sản phẩm trong nhóm */}
      {isGroupOpen && (
        <div className="p-2.5 sm:p-3 space-y-2 bg-slate-50/30 dark:bg-slate-950/30">
          {group.items.map((it) => renderItem(it))}
        </div>
      )}
    </div>
  );
};

// Card đơn hàng đã mua lần trước (Previous Order Card - SCRUM-519)
interface PreviousOrderCardProps {
  order: PreviousOrderSummary;
  onCopyOrderToCart: (order: PreviousOrderSummary) => void;
  onAddSingleItem: (item: PreviousOrderItem) => void;
}

const PreviousOrderCard: React.FC<PreviousOrderCardProps> = ({
  order,
  onCopyOrderToCart,
  onAddSingleItem,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const availableItems = order.items.filter((it) => it.stock > 0);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
      <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                {order.code}
              </span>
              <span className="text-[11px] text-slate-400">
                {formatDate(order.createdAt)}
              </span>
            </div>
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
              Tổng tiền: {formatCurrency(order.total)} · {order.items.length} mặt hàng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Nút Sao chép toàn bộ đơn lần trước vào đơn mới (SCRUM-519) */}
          <button
            type="button"
            onClick={() => onCopyOrderToCart(order)}
            disabled={availableItems.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-40"
            title="Đưa toàn bộ mặt hàng của đơn này với đúng số lượng đã mua lần trước vào đơn mới"
          >
            <Copy className="w-3.5 h-3.5 text-amber-300" />
            <span>Sao chép đơn này vào đơn mới</span>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-slate-400 hover:text-slate-600 transition"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 space-y-2 divide-y divide-slate-100 dark:divide-slate-800">
          {order.items.map((it) => (
            <div
              key={it.productId}
              className="pt-2 first:pt-0 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                {it.image ? (
                  <img
                    src={it.image}
                    alt={it.name}
                    className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-400">
                    <Package className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {it.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    SKU: {it.sku} · Đã mua: <strong className="text-indigo-600 dark:text-indigo-400">{it.quantity} {it.unit}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <StockStatusBadge stock={it.stock} />
                <button
                  type="button"
                  disabled={it.stock <= 0}
                  onClick={() => onAddSingleItem(it)}
                  className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 rounded-lg transition disabled:opacity-40"
                  title={`Thêm ${it.quantity} ${it.unit} vào đơn`}
                >
                  +{it.quantity} {it.unit}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Component Chính: RecentPurchaseHistory (SCRUM-236 / SCRUM-519) ────────

interface RecentPurchaseHistoryProps {
  agentId: string;
  agentName?: string;
  agentCode?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  onAddToCart: (product: Product, quantity: number) => void;
  onAddMultipleToCart?: (items: { product: Product; quantity: number }[]) => void;
  cartLineProductIds?: { [productId: string]: number };
  allProducts: Product[];
  hideWhenRestricted?: boolean;
}

export const RecentPurchaseHistory: React.FC<RecentPurchaseHistoryProps> = ({
  agentId,
  agentName,
  agentCode,
  assignedStaffId,
  assignedStaffName,
  onAddToCart,
  onAddMultipleToCart,
  cartLineProductIds = {},
  allProducts,
  hideWhenRestricted = false,
}) => {
  const { showToast } = useToast();
  const { user } = useAuth();

  // State hỗ trợ kiểm thử mô phỏng phân công (SCRUM-522)
  const [simulateUnassigned, setSimulateUnassigned] = useState(false);
  const [isRestrictedCardDismissed, setIsRestrictedCardDismissed] = useState(false);

  // Kiểm tra quyền xem lịch sử mua hàng của đại lý (SCRUM-522)
  const permission = useMemo(() => {
    if (simulateUnassigned) {
      return {
        allowed: false,
        reason: `Bạn không được phân công phụ trách đại lý này (Người phụ trách: ${assignedStaffName || assignedStaffId || 'Nhân viên khác'}).`,
      };
    }
    return purchaseHistoryService.canViewAgentPurchaseHistory(
      user,
      assignedStaffId,
      assignedStaffName
    );
  }, [user, assignedStaffId, assignedStaffName, simulateUnassigned]);

  const [isExpanded, setIsExpanded] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  // Tab view: 'category' (theo nhóm hàng), 'previous_orders' (đơn lần trước), 'all' (tất cả)
  const [activeTab, setActiveTab] = useState<'category' | 'previous_orders' | 'all'>('category');

  const [timeRangeMonths, setTimeRangeMonths] = useState<number>(3);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'frequent' | 'in_stock'>('all');

  // Quản lý số lượng đang nhập cho từng mặt hàng (mặc định lấy số lượng bình quân)
  const [itemQuantities, setItemQuantities] = useState<{ [productId: string]: number }>({});

  // Danh sách các mặt hàng đang được chọn qua checkbox (Bulk Selection - SCRUM-519)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Cách lấy số lượng khi thêm hàng loạt: 'average' (bình quân) hoặc 'last_order' (lần trước)
  const [bulkQtyMode, setBulkQtyMode] = useState<'average' | 'last_order'>('average');

  // Tải danh sách đơn hàng để phân tích lịch sử (Chỉ tải khi có quyền xem - SCRUM-522)
  useEffect(() => {
    if (!agentId || !permission.allowed) {
      setOrders([]);
      setSelectedProductIds(new Set());
      return;
    }

    setLoading(true);
    orderService
      .getAll()
      .then((data) => {
        setOrders(data);
      })
      .catch((err) => {
        console.warn('Lỗi khi tải đơn hàng cho lịch sử:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [agentId, permission.allowed]);

  // Phân tích danh sách mặt hàng đã mua trong 3 tháng gần nhất
  const historyItems = useMemo(() => {
    if (!agentId || orders.length === 0) return [];
    return purchaseHistoryService.getAgentPurchaseHistory(
      agentId,
      agentCode,
      orders,
      allProducts,
      timeRangeMonths
    );
  }, [agentId, agentCode, orders, allProducts, timeRangeMonths]);

  // Gom nhóm theo ngành hàng (SCRUM-519)
  const categoryGroups = useMemo(() => {
    return purchaseHistoryService.groupHistoryByCategory(historyItems);
  }, [historyItems]);

  // Danh sách các đơn hàng đã mua gần nhất (SCRUM-519)
  const previousOrders = useMemo(() => {
    return purchaseHistoryService.getPreviousOrders(
      agentId,
      agentCode,
      orders,
      allProducts
    );
  }, [agentId, agentCode, orders, allProducts]);

  // Khởi tạo số lượng mặc định bằng số lượng bình quân cho mỗi mặt hàng
  useEffect(() => {
    if (historyItems.length > 0) {
      setItemQuantities((prev) => {
        const next = { ...prev };
        historyItems.forEach((it) => {
          if (!next[it.productId]) {
            next[it.productId] = it.avgQuantity;
          }
        });
        return next;
      });
    }
  }, [historyItems]);

  const handleQtyChange = useCallback((productId: string, val: number) => {
    setItemQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, val),
    }));
  }, []);

  // Xử lý tick / bỏ tick 1 mặt hàng
  const handleToggleSelect = useCallback((productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  // Xử lý chọn / bỏ chọn cả nhóm hàng (SCRUM-519)
  const handleToggleGroup = useCallback((group: CategoryGroupedHistory) => {
    const available = group.items.filter((it) => it.stock > 0).map((it) => it.productId);
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      const isAllIn = available.every((id) => next.has(id));
      if (isAllIn) {
        available.forEach((id) => next.delete(id));
      } else {
        available.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  // Chọn tất cả các mặt hàng còn hàng
  const handleSelectAll = useCallback(() => {
    const allAvailable = historyItems
      .filter((it) => it.stock > 0)
      .map((it) => it.productId);

    if (selectedProductIds.size === allAvailable.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(allAvailable));
    }
  }, [historyItems, selectedProductIds.size]);

  // Thêm 1 sản phẩm vào giỏ
  const handleQuickAdd = useCallback(
    (item: RecentPurchasedItem, customQty?: number) => {
      const targetProd = allProducts.find(
        (p) => p.id === item.productId || p.sku === item.sku
      );

      if (!targetProd) {
        showToast('Không tìm thấy thông tin sản phẩm', 'error');
        return;
      }

      const qty = customQty ?? itemQuantities[item.productId] ?? item.avgQuantity;

      if (targetProd.stock <= 0) {
        showToast(`${targetProd.name} đã hết hàng`, 'warning');
        return;
      }

      onAddToCart(targetProd, qty);
    },
    [allProducts, itemQuantities, onAddToCart, showToast]
  );

  // Thêm toàn bộ nhóm hàng vào đơn (SCRUM-519)
  const handleAddGroupToCart = useCallback(
    (group: CategoryGroupedHistory) => {
      const validItems: { product: Product; quantity: number }[] = [];

      group.items.forEach((it) => {
        if (it.stock > 0) {
          const prod = allProducts.find(
            (p) => p.id === it.productId || p.sku === it.sku
          );
          if (prod) {
            const qty = Math.min(it.avgQuantity, prod.stock);
            validItems.push({ product: prod, quantity: qty });
          }
        }
      });

      if (validItems.length === 0) {
        showToast(`Nhóm hàng "${group.categoryName}" không có sản phẩm nào còn hàng`, 'warning');
        return;
      }

      if (onAddMultipleToCart) {
        onAddMultipleToCart(validItems);
      } else {
        validItems.forEach(({ product, quantity }) => {
          onAddToCart(product, quantity);
        });
      }

      showToast(
        `Đã thêm ${validItems.length} mặt hàng thuộc nhóm "${group.categoryName}" vào đơn`,
        'success'
      );
    },
    [allProducts, onAddMultipleToCart, onAddToCart, showToast]
  );

  // Sao chép toàn bộ đơn lần trước vào đơn mới (SCRUM-519)
  const handleCopyOrderToCart = useCallback(
    (order: PreviousOrderSummary) => {
      const validItems: { product: Product; quantity: number }[] = [];

      order.items.forEach((it) => {
        if (it.stock > 0) {
          const prod = allProducts.find(
            (p) => p.id === it.productId || p.sku === it.sku
          );
          if (prod) {
            const qty = Math.min(it.quantity, prod.stock);
            validItems.push({ product: prod, quantity: qty });
          }
        }
      });

      if (validItems.length === 0) {
        showToast('Các mặt hàng trong đơn trước hiện đã hết hàng', 'warning');
        return;
      }

      if (onAddMultipleToCart) {
        onAddMultipleToCart(validItems);
      } else {
        validItems.forEach(({ product, quantity }) => {
          onAddToCart(product, quantity);
        });
      }

      showToast(
        `Đã sao chép ${validItems.length} mặt hàng từ đơn ${order.code} vào đơn mới`,
        'success'
      );
    },
    [allProducts, onAddMultipleToCart, onAddToCart, showToast]
  );

  // Thêm 1 mặt hàng từ đơn cũ
  const handleAddSingleItemFromOldOrder = useCallback(
    (item: PreviousOrderItem) => {
      const prod = allProducts.find(
        (p) => p.id === item.productId || p.sku === item.sku
      );
      if (!prod) {
        showToast('Không tìm thấy thông tin sản phẩm', 'error');
        return;
      }
      if (prod.stock <= 0) {
        showToast(`${prod.name} đã hết hàng`, 'warning');
        return;
      }
      const qty = Math.min(item.quantity, prod.stock);
      onAddToCart(prod, qty);
    },
    [allProducts, onAddToCart, showToast]
  );

  // Thêm các mặt hàng đã chọn qua Checkbox vào đơn (SCRUM-519 Bulk Add)
  const handleAddSelectedToCart = useCallback(() => {
    if (selectedProductIds.size === 0) {
      showToast('Vui lòng chọn ít nhất một mặt hàng', 'warning');
      return;
    }

    const validItems: { product: Product; quantity: number }[] = [];

    selectedProductIds.forEach((prodId) => {
      const historyItem = historyItems.find((it) => it.productId === prodId);
      const prod = allProducts.find((p) => p.id === prodId || p.sku === historyItem?.sku);

      if (prod && prod.stock > 0 && historyItem) {
        const qtyTarget =
          bulkQtyMode === 'last_order'
            ? historyItem.lastPurchasedQty
            : historyItem.avgQuantity;

        const qty = Math.min(qtyTarget, prod.stock);
        validItems.push({ product: prod, quantity: qty });
      }
    });

    if (validItems.length === 0) {
      showToast('Các mặt hàng đã chọn hiện không khả dụng trong kho', 'warning');
      return;
    }

    if (onAddMultipleToCart) {
      onAddMultipleToCart(validItems);
    } else {
      validItems.forEach(({ product, quantity }) => {
        onAddToCart(product, quantity);
      });
    }

    showToast(
      `Đã thêm ${validItems.length} mặt hàng đã chọn vào đơn hàng`,
      'success'
    );
    setSelectedProductIds(new Set());
  }, [selectedProductIds, historyItems, allProducts, bulkQtyMode, onAddMultipleToCart, onAddToCart, showToast]);

  // Thêm tất cả theo số lượng bình quân (1-click Re-order All)
  const handleAddAllAverage = useCallback(() => {
    const validItems: { product: Product; quantity: number }[] = [];

    historyItems.forEach((it) => {
      if (it.stock > 0) {
        const prod = allProducts.find(
          (p) => p.id === it.productId || p.sku === it.sku
        );
        if (prod) {
          const qty = Math.min(it.avgQuantity, prod.stock);
          validItems.push({ product: prod, quantity: qty });
        }
      }
    });

    if (validItems.length === 0) {
      showToast('Không có sản phẩm nào khả dụng để thêm', 'warning');
      return;
    }

    if (onAddMultipleToCart) {
      onAddMultipleToCart(validItems);
    } else {
      validItems.forEach(({ product, quantity }) => {
        onAddToCart(product, quantity);
      });
    }

    showToast(
      `Đã thêm ${validItems.length} mặt hàng theo số lượng bình quân vào đơn`,
      'success'
    );
  }, [historyItems, allProducts, onAddMultipleToCart, onAddToCart, showToast]);

  // Lọc theo search và filterType
  const filteredItems = useMemo(() => {
    return historyItems.filter((item) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filterType === 'frequent') {
        return item.purchaseFrequency === 'frequent' || item.purchaseFrequency === 'regular';
      }
      if (filterType === 'in_stock') {
        return item.stock > 0;
      }

      return true;
    });
  }, [historyItems, search, filterType]);

  // Lọc category groups theo filteredItems
  const filteredCategoryGroups = useMemo(() => {
    return purchaseHistoryService.groupHistoryByCategory(filteredItems);
  }, [filteredItems]);

  // Nếu chưa chọn đại lý
  if (!agentId) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm text-center">
        <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
          <History className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Gợi Ý & Nhóm Hàng Đã Mua Lần Trước (SCRUM-236 / SCRUM-519)
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          Vui lòng chọn đại lý ở bước 1 để hiển thị nhóm hàng đã mua lần trước, số lượng bình quân và các nút chọn nhanh vào đơn mới.
        </p>
      </section>
    );
  }

  // ── XỬ LÝ KHI NHÂN VIÊN KHÔNG ĐƯỢC PHÂN CÔNG ĐẠI LÝ (SCRUM-522) ──
  if (!permission.allowed) {
    if (hideWhenRestricted || isRestrictedCardDismissed) {
      return null;
    }

    return (
      <section className="bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-dashed border-amber-300 dark:border-amber-800/80 p-4 shadow-xs transition-all animate-fadeIn">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
            <Lock className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                  Lịch Sử Mua Hàng & Gợi Ý Nhập Nhanh - Không Khả Dụng
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Chưa được phân công
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {/* Nút kiểm thử mô phỏng */}
                <button
                  type="button"
                  onClick={() => setSimulateUnassigned(false)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  title="Tắt chế độ mô phỏng để xem lại lịch sử"
                >
                  [Bật lại hiển thị]
                </button>
                <button
                  type="button"
                  onClick={() => setIsRestrictedCardDismissed(true)}
                  className="text-xs text-amber-700/70 hover:text-amber-900 dark:text-amber-400 hover:underline"
                >
                  Ẩn thông báo này
                </button>
              </div>
            </div>

            <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
              {permission.reason || `Bạn không được phân công phụ trách đại lý ${agentName || ''}.`}
            </p>

            <div className="p-2.5 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span>Người phụ trách đại lý: </span>
                <strong className="text-slate-900 dark:text-slate-200">
                  {assignedStaffName || assignedStaffId || 'Chưa phân công'}
                </strong>
                {user?.name && (
                  <span className="text-slate-400 ml-1">
                    (Tài khoản hiện tại: {user.name} - {user.role})
                  </span>
                )}
              </div>
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                💡 Bạn vẫn có thể tìm kiếm và chọn sản phẩm ở ô phía dưới để tạo đơn.
              </span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-950/80 shadow-sm overflow-hidden transition-all">
      {/* Header Card với các nút thao tác chính */}
      <div className="p-3.5 sm:p-4 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-transparent dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-transparent border-b border-indigo-100/80 dark:border-indigo-900/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Gợi Ý & Nhóm Hàng Đã Mua Lần Trước
              </h3>
              {historyItems.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-indigo-600 text-white shadow-xs">
                  {historyItems.length} mặt hàng
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-slate-500 truncate">
                {agentName ? `Đại lý: ${agentName}` : 'Hỗ trợ đưa nhanh nhóm hàng hoặc đơn cũ vào đơn mới'}
              </span>
              {assignedStaffName && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200/60 dark:border-indigo-800/60">
                  Phụ trách: {assignedStaffName}
                </span>
              )}
              {/* Nút kiểm thử mô phỏng phân công (SCRUM-522) */}
              <button
                type="button"
                onClick={() => setSimulateUnassigned(true)}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 ml-1"
                title="Bấm để thử nghiệm trạng thái khi nhân viên không được phân công đại lý này (SCRUM-522)"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>[Thử mô phỏng chưa phân công]</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Nút hành động nhanh: Nhập toàn bộ hàng theo số lượng bình quân */}
          {historyItems.length > 0 && isExpanded && (
            <button
              type="button"
              onClick={handleAddAllAverage}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition active:scale-95"
              title="Thêm tất cả các mặt hàng còn hàng vào giỏ theo số lượng bình quân"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Nhập tất cả theo SL bình quân</span>
            </button>
          )}

          {/* Nút đóng / mở accordion */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white dark:hover:bg-slate-800 transition"
            title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Nội dung danh sách khi mở rộng */}
      {isExpanded && (
        <div className="p-3.5 sm:p-4 space-y-3">
          {/* ── 3 Tabs chính: Theo nhóm hàng | Đơn mua lần trước | Tất cả mặt hàng (SCRUM-519) ── */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('category')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'category'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Theo nhóm hàng ({categoryGroups.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('previous_orders')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'previous_orders'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Đơn mua lần trước ({previousOrders.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'all'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Tất cả ({historyItems.length})</span>
              </button>
            </div>

            {/* Checkbox chọn tất cả & bộ chọn số tháng */}
            <div className="flex items-center gap-2 ml-auto">
              {activeTab !== 'previous_orders' && historyItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  {selectedProductIds.size === historyItems.filter((it) => it.stock > 0).length ? (
                    <span>Bỏ chọn tất cả</span>
                  ) : (
                    <span>Chọn tất cả ({historyItems.filter((it) => it.stock > 0).length})</span>
                  )}
                </button>
              )}

              <select
                value={timeRangeMonths}
                onChange={(e) => setTimeRangeMonths(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
              >
                <option value={1}>1 tháng gần nhất</option>
                <option value={3}>3 tháng gần nhất</option>
                <option value={6}>6 tháng gần nhất</option>
              </select>
            </div>
          </div>

          {/* Thanh công cụ tìm kiếm và lọc phụ */}
          {activeTab !== 'previous_orders' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition shrink-0 ${
                    filterType === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Tất cả ({historyItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('frequent')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition shrink-0 ${
                    filterType === 'frequent'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Mua thường xuyên
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('in_stock')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition shrink-0 ${
                    filterType === 'in_stock'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Còn hàng
                </button>
              </div>

              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lọc mặt hàng đã mua..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          {/* ── Floating Action Bar khi chọn nhiều mặt hàng qua Checkbox (SCRUM-519) ── */}
          {selectedProductIds.size > 0 && (
            <div className="p-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl shadow-lg flex items-center justify-between gap-3 flex-wrap animate-fadeIn">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs">
                  {selectedProductIds.size}
                </div>
                <span className="text-xs font-bold">
                  Đã chọn {selectedProductIds.size} mặt hàng
                </span>
                <span className="text-white/60 text-xs hidden sm:inline">|</span>
                {/* Chọn cách lấy số lượng */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs">
                  <span className="text-white/80">Lấy số lượng:</span>
                  <button
                    type="button"
                    onClick={() => setBulkQtyMode('average')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                      bulkQtyMode === 'average'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    Bình quân
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkQtyMode('last_order')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                      bulkQtyMode === 'last_order'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    Lần mua trước
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedProductIds(new Set())}
                  className="px-2.5 py-1 text-xs font-semibold text-white/80 hover:text-white hover:underline transition"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedToCart}
                  className="px-3.5 py-1.5 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold shadow-sm transition active:scale-95 flex items-center gap-1.5"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Đưa {selectedProductIds.size} mặt hàng vào đơn</span>
                </button>
              </div>
            </div>
          )}

          {/* Nội dung danh sách theo tab được chọn */}
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Đang phân tích dữ liệu mua hàng và nhóm hàng...
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
              <Package className="w-8 h-8 mx-auto text-slate-300 stroke-[1.2]" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Chưa có lịch sử mua hàng trong {timeRangeMonths} tháng gần nhất
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Đại lý này chưa phát sinh đơn hàng trong thời gian đã chọn. Bạn có thể sử dụng ô tìm kiếm ở mục số 3 bên dưới để lên đơn mới.
              </p>
            </div>
          ) : activeTab === 'category' ? (
            /* ── TAB 1: HIỂN THỊ THEO NHÓM HÀNG / NGÀNH HÀNG (SCRUM-519) ── */
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-0.5">
              {filteredCategoryGroups.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Không tìm thấy nhóm hàng nào phù hợp với bộ lọc &quot;{search}&quot;.
                </div>
              ) : (
                filteredCategoryGroups.map((group) => (
                  <CategoryGroupCard
                    key={group.categoryName}
                    group={group}
                    selectedIds={selectedProductIds}
                    onToggleGroup={handleToggleGroup}
                    onAddGroupToCart={handleAddGroupToCart}
                    renderItem={(item) => (
                      <HistoryItemCard
                        key={item.productId}
                        item={item}
                        quantityInput={itemQuantities[item.productId] ?? item.avgQuantity}
                        inCartQty={cartLineProductIds[item.productId] || 0}
                        isSelected={selectedProductIds.has(item.productId)}
                        onToggleSelect={handleToggleSelect}
                        onQtyChange={handleQtyChange}
                        onQuickAdd={handleQuickAdd}
                      />
                    )}
                  />
                ))
              )}
            </div>
          ) : activeTab === 'previous_orders' ? (
            /* ── TAB 2: HIỂN THỊ THEO ĐƠN MUA LẦN TRƯỚC (SCRUM-519) ── */
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-0.5">
              {previousOrders.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Chưa tìm thấy đơn hàng nào đã mua trước đó.
                </div>
              ) : (
                previousOrders.map((order) => (
                  <PreviousOrderCard
                    key={order.id}
                    order={order}
                    onCopyOrderToCart={handleCopyOrderToCart}
                    onAddSingleItem={handleAddSingleItemFromOldOrder}
                  />
                ))
              )}
            </div>
          ) : (
            /* ── TAB 3: HIỂN THỊ TOÀN BỘ DANH SÁCH MẶT HÀNG ── */
            <div className="grid grid-cols-1 gap-2.5 max-h-[460px] overflow-y-auto pr-0.5">
              {filteredItems.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Không tìm thấy mặt hàng nào phù hợp với bộ lọc &quot;{search}&quot;.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <HistoryItemCard
                    key={item.productId}
                    item={item}
                    quantityInput={itemQuantities[item.productId] ?? item.avgQuantity}
                    inCartQty={cartLineProductIds[item.productId] || 0}
                    isSelected={selectedProductIds.has(item.productId)}
                    onToggleSelect={handleToggleSelect}
                    onQtyChange={handleQtyChange}
                    onQuickAdd={handleQuickAdd}
                  />
                ))
              )}
            </div>
          )}

          {/* Nút hành động nhanh trên Mobile */}
          {historyItems.length > 0 && (
            <div className="md:hidden pt-1">
              <button
                type="button"
                onClick={handleAddAllAverage}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Nhập tất cả theo SL bình quân ({historyItems.length} sp)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default RecentPurchaseHistory;
