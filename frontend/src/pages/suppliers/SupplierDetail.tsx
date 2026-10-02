import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Package,
  DollarSign,
  ArrowDownLeft,
  Boxes,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { supplierService } from '../../services/supplierService';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { Supplier } from '../../types/Supplier';
import { Product } from '../../types/Product';
import { StockInReceipt } from '../../types/Inventory';

export const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [suppliedProducts, setSuppliedProducts] = useState<Product[]>([]);
  const [importReceipts, setImportReceipts] = useState<StockInReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const found = await supplierService.getById(id);
        if (found) {
          setSupplier(found);
          const [allProducts, allReceipts] = await Promise.all([
            productService.getAll(),
            inventoryService.getStockInReceipts(),
          ]);
          setSuppliedProducts(
            allProducts.filter((p) => p.supplierId === found.id || p.supplierName === found.name)
          );
          setImportReceipts(
            allReceipts.filter((r) => r.supplierId === found.id || r.supplierName === found.name)
          );
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return <Loading text="Đang tải dữ liệu nhà cung cấp..." />;
  if (!supplier) {
    return (
      <EmptyState
        title="Không tìm thấy nhà cung cấp"
        description="Mã nhà cung cấp không tồn tại."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/suppliers')}
      />
    );
  }

  return (
    <PageContainer
      title={supplier.name}
      subtitle={`Mã NCC: ${supplier.code} | Người liên hệ: ${supplier.contactPerson}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/suppliers">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách
            </Button>
          </Link>
          <Link to="/inventory/stock-in">
            <Button variant="primary" size="sm" leftIcon={<ArrowDownLeft className="w-4 h-4" />}>
              Tạo phiếu nhập từ NCC này
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Supplier Info Card (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card text-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-indigo-900 shadow-inner">
              <Building2 className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{supplier.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{supplier.code}</p>

            <div className="mt-3 flex justify-center">
              <Badge variant={supplier.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
                {supplier.status === 'active' ? 'Đang hợp tác' : 'Tạm dừng'}
              </Badge>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-left space-y-3 text-xs">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-400 min-w-[70px]">Đại diện:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {supplier.contactPerson}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{supplier.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{supplier.email || 'Chưa cập nhật'}</span>
              </div>
              <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>{supplier.address}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Lần Nhập Hàng</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {supplier.totalImports}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Tổng Tiền Đã Mua</span>
              <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(supplier.totalSpent)}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Products Provided & Receipts (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Supplied products list */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center justify-between">
              <span>Sản Phẩm Đang Phân Phối ({suppliedProducts.length})</span>
              <Boxes className="w-5 h-5 text-indigo-500" />
            </h3>

            {suppliedProducts.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {suppliedProducts.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-10 h-10 rounded-lg object-cover bg-slate-100"
                      />
                      <div className="truncate">
                        <Link
                          to={`/products/${p.id}`}
                          className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 hover:text-indigo-600 block truncate"
                        >
                          {p.name}
                        </Link>
                        <span className="text-[11px] text-slate-400">SKU: {p.sku}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Giá nhập: {formatCurrency(p.costPrice)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Tồn: {p.stock} {p.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">
                Chưa có mặt hàng nào liên kết với nhà cung cấp này
              </p>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
