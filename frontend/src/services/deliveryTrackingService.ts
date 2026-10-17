// Dịch vụ theo dõi trạng thái giao hàng & Timeline các mốc (SCRUM-695 / SCRUM-260)
import {
  DeliveryMilestone,
  DeliveryMilestoneKey,
  DeliveryTrackingDetails,
} from '../types/DeliveryTracking';
import { Order } from '../types/Order';
import { initialDeliveryTrackings } from '../mock/deliveryTrackings';
import { getStorageItem, setStorageItem } from './storage';
import { orderService } from './orderService';

const STORAGE_KEY = 'kv_delivery_trackings';

export const MILESTONE_ORDER: DeliveryMilestoneKey[] = [
  'approved',
  'preparing',
  'dispatched',
  'shipping',
  'delivered',
];

export const MILESTONE_META: Record<
  DeliveryMilestoneKey,
  { label: string; shortDescription: string }
> = {
  approved: {
    label: 'Đã duyệt',
    shortDescription: 'Đơn hàng được duyệt chính sách & hạn mức tín dụng đại lý',
  },
  preparing: {
    label: 'Đang soạn',
    shortDescription: 'Bộ phận kho tiếp nhận phiếu xuất, tiến hành nhặt hàng & đóng gói',
  },
  dispatched: {
    label: 'Đã xuất',
    shortDescription: 'Đã xuất kho, in biên bản bàn giao & bàn giao cho đội vận chuyển',
  },
  shipping: {
    label: 'Đang giao',
    shortDescription: 'Kiện hàng đang trên đường vận chuyển tới địa chỉ đại lý',
  },
  delivered: {
    label: 'Đã giao',
    shortDescription: 'Đại lý đã kiểm đếm và ký nhận đủ hàng hóa, hoàn tất giao nhận',
  },
};

/**
 * Sinh timeline mặc định chuẩn 5 mốc cho bất kỳ đơn hàng nào nếu chưa có trong DB
 */
export function buildDefaultTrackingFromOrder(order: Order): DeliveryTrackingDetails {
  const isCompleted = order.status === 'completed';
  const isShipping = order.status === 'shipping';
  const isConfirmed = order.status === 'confirmed';
  const isCancelled = order.status === 'cancelled';

  let currentKey: DeliveryMilestoneKey = 'approved';
  if (isCompleted) currentKey = 'delivered';
  else if (isShipping) currentKey = 'shipping';
  else if (isConfirmed) currentKey = 'preparing';
  else currentKey = 'approved';

  const orderTime = order.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 16);

  const milestones: DeliveryMilestone[] = MILESTONE_ORDER.map((key) => {
    const meta = MILESTONE_META[key];
    let status: DeliveryMilestone['status'] = 'pending';
    let timestamp: string | undefined = undefined;
    let detailedNote: string | undefined = undefined;
    let performedBy: string | undefined = undefined;

    if (isCompleted) {
      status = 'completed';
      timestamp = orderTime;
      detailedNote = 'Hoàn tất theo đúng quy trình giao nhận chuẩn OMS.';
      performedBy = order.staffName;
    } else if (isCancelled) {
      status = 'cancelled';
      detailedNote = 'Đơn hàng đã hủy bỏ tiến trình giao hàng.';
    } else {
      const targetIndex = MILESTONE_ORDER.indexOf(currentKey);
      const currentIndex = MILESTONE_ORDER.indexOf(key);

      if (currentIndex < targetIndex) {
        status = 'completed';
        timestamp = orderTime;
        performedBy = order.staffName;
        detailedNote = 'Đã xử lý và kiểm định hoàn tất.';
      } else if (currentIndex === targetIndex) {
        status = 'in_progress';
        timestamp = order.updatedAt || orderTime;
        performedBy = order.staffName;
        detailedNote = 'Đang trong quá trình thực hiện mốc này.';
      } else {
        status = 'pending';
      }
    }

    return {
      key,
      label: meta.label,
      shortDescription: meta.shortDescription,
      detailedNote,
      timestamp,
      status,
      performedBy,
    };
  });

  return {
    orderId: order.id,
    orderCode: order.code,
    trackingNumber: `OMS-EXP-${order.code.replace(/[^0-9]/g, '') || Math.floor(100000 + Math.random() * 900000)}`,
    carrier: 'Đội Vận Tải OMS Express Nội Bộ',
    carrierPhone: '1900 6868',
    driverName: 'Nguyễn Văn Hùng',
    driverPhone: '0988 123 456',
    vehiclePlate: '51C-889.24 (Xe tải 2.5T)',
    estimatedDeliveryDate: orderTime,
    actualDeliveryDate: isCompleted ? (order.updatedAt || orderTime) : undefined,
    sourceWarehouse: 'Kho Tổng Tân Bình - TP. HCM',
    sourceWarehouseAddress: 'Lô C2, Đường KCN Tân Bình, Tây Thạnh, Tân Phú, TP. HCM',
    destinationAddress: order.customerAddress || 'Địa chỉ đại lý đã đăng ký',
    recipientName: order.customerName,
    recipientPhone: order.customerPhone,
    packagesCount: Math.max(1, Math.ceil(order.items.length / 2)),
    totalWeightKg: Math.max(5, order.items.reduce((sum, it) => sum + it.quantity * 2.5, 0)),
    shippingFee: 0,
    currentMilestone: currentKey,
    isCancelled,
    cancelledReason: isCancelled ? 'Khách hàng / Quản trị viên hủy đơn' : undefined,
    milestones,
    lastUpdated: order.updatedAt || orderTime,
  };
}

export const deliveryTrackingService = {
  /**
   * Lấy toàn bộ danh sách dữ liệu theo dõi giao hàng
   */
  getAll: (): Record<string, DeliveryTrackingDetails> => {
    return getStorageItem<Record<string, DeliveryTrackingDetails>>(
      STORAGE_KEY,
      initialDeliveryTrackings
    );
  },

  /**
   * Lấy thông tin theo dõi tiến độ giao hàng theo Mã đơn hàng hoặc ID
   */
  getByOrderId: async (orderIdOrCode: string): Promise<DeliveryTrackingDetails | null> => {
    const store = deliveryTrackingService.getAll();
    if (store[orderIdOrCode]) {
      return store[orderIdOrCode];
    }

    // Tìm theo code nếu truyền vào id
    const foundByVal = Object.values(store).find(
      (item) => item.orderId === orderIdOrCode || item.orderCode === orderIdOrCode
    );
    if (foundByVal) return foundByVal;

    // Nếu chưa có trong tracking store, tìm trong order service để tự động khởi tạo timeline chuẩn
    const order = await orderService.getById(orderIdOrCode);
    if (!order) return null;

    const generated = buildDefaultTrackingFromOrder(order);
    store[order.id] = generated;
    setStorageItem(STORAGE_KEY, store);
    return generated;
  },

  /**
   * Cập nhật chuyển mốc giao hàng tiếp theo (hoặc một mốc chỉ định)
   */
  updateMilestone: async (
    orderId: string,
    targetMilestone: DeliveryMilestoneKey,
    note?: string,
    performer?: string,
    location?: string
  ): Promise<DeliveryTrackingDetails> => {
    const current = await deliveryTrackingService.getByOrderId(orderId);
    if (!current) {
      throw new Error(`Không tìm thấy thông tin giao hàng cho đơn: ${orderId}`);
    }

    const targetIdx = MILESTONE_ORDER.indexOf(targetMilestone);
    const nowTime = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const updatedMilestones: DeliveryMilestone[] = current.milestones.map((m) => {
      const mIdx = MILESTONE_ORDER.indexOf(m.key);
      if (mIdx < targetIdx) {
        return {
          ...m,
          status: 'completed',
          timestamp: m.timestamp || nowTime,
        };
      } else if (mIdx === targetIdx) {
        return {
          ...m,
          status: targetMilestone === 'delivered' ? 'completed' : 'in_progress',
          timestamp: nowTime,
          detailedNote: note || m.detailedNote || 'Cập nhật tiến trình giao hàng.',
          performedBy: performer || m.performedBy || 'Nhân viên kho vận OMS',
          location: location || m.location,
        };
      } else {
        return {
          ...m,
          status: 'pending',
        };
      }
    });

    const updated: DeliveryTrackingDetails = {
      ...current,
      currentMilestone: targetMilestone,
      milestones: updatedMilestones,
      lastUpdated: nowTime,
      actualDeliveryDate: targetMilestone === 'delivered' ? nowTime : current.actualDeliveryDate,
    };

    // Đồng bộ lại với OrderStatus trong orderService
    try {
      if (targetMilestone === 'delivered') {
        await orderService.updateStatus(orderId, 'completed');
      } else if (targetMilestone === 'shipping' || targetMilestone === 'dispatched') {
        await orderService.updateStatus(orderId, 'shipping');
      } else if (targetMilestone === 'preparing' || targetMilestone === 'approved') {
        await orderService.updateStatus(orderId, 'confirmed');
      }
    } catch (e) {
      console.warn('[deliveryTrackingService] Sync status warning:', e);
    }

    const store = deliveryTrackingService.getAll();
    store[orderId] = updated;
    setStorageItem(STORAGE_KEY, store);
    return updated;
  },

  /**
   * Cập nhật thông tin vận chuyển (tài xế, đơn vị vận chuyển, mã vận đơn...)
   */
  updateShippingInfo: async (
    orderId: string,
    info: Partial<Pick<DeliveryTrackingDetails, 'carrier' | 'driverName' | 'driverPhone' | 'vehiclePlate' | 'estimatedDeliveryDate' | 'trackingNumber' | 'sourceWarehouse'>>
  ): Promise<DeliveryTrackingDetails> => {
    const current = await deliveryTrackingService.getByOrderId(orderId);
    if (!current) throw new Error('Không tìm thấy dữ liệu vận chuyển');

    const updated: DeliveryTrackingDetails = {
      ...current,
      ...info,
      lastUpdated: new Date().toISOString().replace('T', ' ').slice(0, 16),
    };

    const store = deliveryTrackingService.getAll();
    store[orderId] = updated;
    setStorageItem(STORAGE_KEY, store);
    return updated;
  },
};
