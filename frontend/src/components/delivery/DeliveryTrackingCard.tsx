import React, { useState } from 'react';
import {
  Truck,
  Copy,
  Check,
  Phone,
  MapPin,
  Calendar,
  Building,
  Package,
  Weight,
  ExternalLink,
} from 'lucide-react';
import { DeliveryTrackingDetails } from '../../types/DeliveryTracking';
import { useToast } from '../../contexts/ToastContext';
import { Link } from 'react-router-dom';

interface DeliveryTrackingCardProps {
  tracking: DeliveryTrackingDetails;
  showViewTrackingLink?: boolean;
}

export const DeliveryTrackingCard: React.FC<DeliveryTrackingCardProps> = ({
  tracking,
  showViewTrackingLink = true,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopyTrackingNumber = () => {
    navigator.clipboard.writeText(tracking.trackingNumber);
    setCopied(true);
    showToast(`Đã sao chép mã vận đơn: ${tracking.trackingNumber}`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-500" />
          Thông Tin Vận Chuyển & Giao Nhận
        </h3>
        {showViewTrackingLink && (
          <Link
            to={`/orders/${tracking.orderId}/delivery`}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
          >
            <span>Hành trình</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Mã vận đơn & Đơn vị vận chuyển */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 block">
            Mã Vận Đơn (Tracking Code)
          </span>
          <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
            {tracking.trackingNumber}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopyTrackingNumber}
          className="p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-100 transition-colors"
          title="Sao chép mã vận đơn"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Thông tin đơn vị vận chuyển */}
      <div className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Đơn vị vận chuyển:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {tracking.carrier}
          </span>
        </div>

        {/* Thông tin tài xế */}
        {tracking.driverName && (
          <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Tài xế giao hàng:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {tracking.driverName}
              </span>
            </div>
            {tracking.vehiclePlate && (
              <div className="flex items-center justify-between text-slate-500">
                <span>Phương tiện:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {tracking.vehiclePlate}
                </span>
              </div>
            )}
            {tracking.driverPhone && (
              <div className="flex items-center justify-between pt-1">
                <span>Liên hệ tài xế:</span>
                <a
                  href={`tel:${tracking.driverPhone}`}
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Phone className="w-3 h-3" />
                  <span>{tracking.driverPhone}</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Lộ trình kho -> đại lý */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-2">
            <Building className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-slate-400 text-[11px] block">Kho xuất hàng</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {tracking.sourceWarehouse}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-slate-400 text-[11px] block">Điểm giao nhận đại lý</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {tracking.destinationAddress}
              </span>
            </div>
          </div>
        </div>

        {/* Thời gian dự kiến & Kiện hàng */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">
              <Calendar className="w-3 h-3 text-indigo-500" />
              <span>Dự kiến giao</span>
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {tracking.estimatedDeliveryDate}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">
              <Package className="w-3 h-3 text-emerald-500" />
              <span>Quy cách kiện</span>
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {tracking.packagesCount} kiện (~{tracking.totalWeightKg} kg)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
