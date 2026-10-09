import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Boxes,
  Barcode,
  Building2,
  Calendar,
  TrendingUp,
  PackageCheck,
  History,
  ArrowDownLeft,
  Package,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';
import { useAuth } from '../../contexts/AuthContext';

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canViewCostPrice = role === 'Admin' || role === 'SalesManager' || role === 'Director';

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const found = await productService.getById(id);
        if (found) setProduct(found);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return <Loading text="Đang tải dữ liệu sản phẩm..." />;
  if (!product) {
    return (
      <EmptyState
        title="Không tìm thấy sản phẩm"
        description="Sản phẩm yêu cầu không tồn tại."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/products')}
      />
    );
  }

  // Stock history mock curve for charts
  const stockHistoryData = [
    { date: '01/09', stock: product.stock + 15 },
    { date: '08/09', stock: product.stock + 10 },
    { date: '15/09', stock: product.stock + 6 },
    { date: '22/09', stock: product.stock + 2 },
    { date: '01/10', stock: product.stock },
  ];

  const profitMargin = Math.round(
    ((product.salePrice - product.costPrice) / product.salePrice) * 100
  );

  return (
    <PageContainer
      title={product.name}
      subtitle={`Mã SKU: ${product.sku} | Barcode: ${product.barcode}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/products">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách
            </Button>
          </Link>
          <Link to={`/inventory/stock-in`}>
            <Button variant="outline" size="sm" leftIcon={<ArrowDownLeft className="w-4 h-4" />}>
              Nhập hàng mã này
            </Button>
          </Link>
          <Link to={`/products/${product.id}/edit`}>
            <Button variant="primary" size="sm" leftIcon={<Edit className="w-4 h-4" />}>
              Chỉnh sửa
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Image & Quick Stats */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card text-center">
            {product.image ? (
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-64 object-cover rounded-xl border border-slate-200 dark:border-slate-700 mx-auto mb-4 bg-slate-50 dark:bg-slate-800"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-48 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 mx-auto mb-4 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center text-slate-400">
                <Package className="w-12 h-12 stroke-[1.2] mb-1 text-slate-300 dark:text-slate-600" />
                <span className="text-xs">Không có hình ảnh</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 mb-2">
              <Badge
                variant={
                  product.status === 'active'
                    ? 'success'
                    : product.status === 'low_stock'
                    ? 'warning'
                    : product.status === 'out_of_stock'
                    ? 'danger'
                    : 'neutral'
                }
                size="md"
                dot
              >
                {product.status === 'active'
                  ? 'Đang kinh doanh'
                  : product.status === 'low_stock'
                  ? 'Sắp hết hàng'
                  : product.status === 'out_of_stock'
                  ? 'Hết hàng'
                  : 'Ngừng kinh doanh'}
              </Badge>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                {product.category}
              </span>
            </div>
            <div className="space-y-1 text-xs text-slate-400 mt-2">
              <p>
                Đơn vị tính cơ sở: <span className="font-semibold text-slate-700 dark:text-slate-200">{product.unit}</span>
              </p>
              <p>
                Quy cách đóng gói: <span className="font-semibold text-slate-700 dark:text-slate-200">{product.packagingSpecification || '1 chiếc/hộp'}</span>
              </p>
            </div>
          </div>

          {/* Supplier details card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-500" />
              Nhà Cung Cấp
            </h4>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {product.supplierName}
            </p>
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p>Mã đối tác: {product.supplierId}</p>
              <p>Cam kết bảo hành chính hãng toàn diện</p>
            </div>
          </div>
        </div>

        {/* Right Column: Pricing, Inventory curve, specifications (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs font-bold text-slate-400 uppercase">Giá Bán Lẻ</span>
              <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(product.salePrice)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {canViewCostPrice
                  ? `Giá nhập: ${formatCurrency(product.costPrice)}`
                  : 'Giá nhập: ****** (Chỉ Quản lý xem)'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs font-bold text-slate-400 uppercase">Tỷ Suất Lợi Nhuận</span>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {canViewCostPrice ? `${profitMargin}%` : '******'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {canViewCostPrice
                  ? `Lãi gộp: ${formatCurrency(product.salePrice - product.costPrice)} / sp`
                  : '🔒 Phân quyền Quản lý kinh doanh'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs font-bold text-slate-400 uppercase">Tồn Kho Hiện Tại</span>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                {product.stock} <span className="text-sm font-normal text-slate-400">{product.unit}</span>
              </p>
              <p className="text-xs text-amber-500 mt-1">Ngưỡng báo động: &lt; {product.minStock} {product.unit}</p>
            </div>
          </div>

          {/* Stock Trend Chart */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Biến Động Tồn Kho 30 Ngày
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Số lượng hàng lưu kho qua từng tuần</p>
              </div>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-lg">
                Chu kỳ tháng 9-10
              </span>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stockHistoryData}>
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    formatter={(val: any) => [`${val} ${product.unit}`, 'Tồn kho']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                  />
                  <Area type="monotone" dataKey="stock" stroke="#6366f1" strokeWidth={3} fill="#e0e7ff" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Description & Technical details */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Thông Tin Chi Tiết</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {product.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Mã SKU:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{product.sku}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Mã Barcode:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{product.barcode}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày tạo:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{product.createdAt}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Cập nhật:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{product.updatedAt}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
