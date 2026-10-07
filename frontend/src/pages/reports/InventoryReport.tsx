import React, { useState, useEffect } from 'react';
import {
  Layers,
  Download,
  Printer,
  Package,
  AlertTriangle,
  Boxes,
  RotateCcw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExporter';
import { productService } from '../../services/productService';
import { Product } from '../../types/Product';
import { useToast } from '../../contexts/ToastContext';

export const InventoryReport: React.FC = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    productService.getAll().then(setProducts);
  }, []);

  const totalStockUnits = products.reduce((s, p) => s + p.stock, 0);
  const totalStockValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;

  const warehouseBreakdown = [
    { name: 'Kho Tổng TP. HCM', stock: Math.round(totalStockUnits * 0.65), value: Math.round(totalStockValue * 0.65) },
    { name: 'Kho Tổng Hà Nội', stock: Math.round(totalStockUnits * 0.35), value: Math.round(totalStockValue * 0.35) },
  ];

  const handleExportCSV = () => {
    exportToCSV({
      filename: `bao_cao_kho_${Date.now()}`,
      headers: ['Tên kho hàng', 'Số lượng tồn (đơn vị)', 'Tổng giá trị lưu kho (VNĐ)'],
      rows: warehouseBreakdown.map((w) => [w.name, w.stock, w.value]),
    });
    showToast('Đã xuất báo cáo kho thành công!', 'success');
  };

  return (
    <PageContainer
      title="Báo Cáo Tồn Kho & Giá Trị Lưu Kho"
      subtitle="Đánh giá quy mô tài sản hàng tồn kho, tốc độ luân chuyển và định mức an toàn"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Xuất Excel/CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            In báo cáo
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Tổng Hàng Lưu Kho</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {formatNumber(totalStockUnits)} <span className="text-sm font-normal text-slate-400">sản phẩm</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Tỉ lệ lấp đầy kho 78%</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Tổng Vốn Hàng Đang Tồn</span>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {formatCurrency(totalStockValue)}
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Quy đổi theo giá vốn nhập</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
          <span className="text-xs font-bold text-slate-400 uppercase">Sản Phẩm Cần Tái Đặt Hàng</span>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {lowStockCount} <span className="text-sm font-normal text-slate-400">mã SP</span>
          </p>
          <span className="text-xs text-slate-400 mt-1 block">Dưới ngưỡng dự phòng tối thiểu</span>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card mt-6">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6">
          Phân Bổ Tồn Kho Theo Cơ Sở Kho
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={warehouseBreakdown}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                formatter={(v: any) => [`${v} sản phẩm`, 'Số lượng']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="stock" name="Số lượng tồn" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </PageContainer>
  );
};
